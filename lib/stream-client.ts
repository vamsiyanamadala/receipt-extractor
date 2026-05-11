"use client";

import type { CostInfo, Receipt } from "./schema";

export type StreamCallbacks = {
  onPartial: (data: Partial<Receipt>) => void;
  onComplete: (data: Receipt, cost: CostInfo, latencyMs: number) => void;
  onError: (err: string) => void;
};

/**
 * POST a receipt image to /api/extract and parse the SSE stream.
 *
 * Native EventSource only supports GET, so we use fetch + ReadableStream and
 * parse the wire format manually:
 *   event: partial
 *   data: { ... }
 *   <blank line>
 */
export async function streamExtraction(
  file: File,
  cb: StreamCallbacks,
  signal?: AbortSignal,
) {
  const fd = new FormData();
  fd.append("file", file);

  let res: Response;
  try {
    res = await fetch("/api/extract", { method: "POST", body: fd, signal });
  } catch (err) {
    cb.onError(err instanceof Error ? err.message : "Network error");
    return;
  }

  if (!res.body) {
    cb.onError("No response body from server.");
    return;
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value ?? "";

      // SSE messages are separated by double newlines.
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        handleChunk(chunk, cb);
      }
    }
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") return;
    cb.onError(err instanceof Error ? err.message : "Stream read error");
  }
}

function handleChunk(chunk: string, cb: StreamCallbacks) {
  let event = "message";
  let data = "";
  for (const line of chunk.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return;
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    return;
  }
  if (event === "partial") {
    const p = payload as { data?: Partial<Receipt> };
    if (p?.data) cb.onPartial(p.data);
  } else if (event === "complete") {
    const p = payload as { data: Receipt; cost: CostInfo; latency_ms: number };
    cb.onComplete(p.data, p.cost, p.latency_ms);
  } else if (event === "error") {
    cb.onError((payload as { error?: string }).error ?? "Unknown error");
  }
}
