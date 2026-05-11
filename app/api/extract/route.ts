import { NextRequest } from "next/server";
import { extractReceiptStream, type MediaType } from "@/lib/extract";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_TYPES = new Set<MediaType>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

function sseEvent(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      sseEvent("error", {
        error: "Server missing ANTHROPIC_API_KEY. Add it to .env.local.",
      }),
      { status: 500, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  let file: File;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (!(f instanceof File)) {
      return errorStream("No file uploaded.", 400);
    }
    if (!ALLOWED_TYPES.has(f.type as MediaType)) {
      return errorStream(`Unsupported file type: ${f.type}`, 415);
    }
    if (f.size > MAX_BYTES) {
      return errorStream(
        `Image too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Max 8 MB.`,
        413,
      );
    }
    file = f;
  } catch (err) {
    return errorStream(
      err instanceof Error ? err.message : "Bad request",
      400,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const mediaType = file.type as MediaType;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Initial "ready" ping so the client knows the connection is alive.
      controller.enqueue(encoder.encode(sseEvent("ready", { ok: true })));

      try {
        for await (const chunk of extractReceiptStream(base64, mediaType)) {
          if (chunk.type === "partial") {
            controller.enqueue(
              encoder.encode(sseEvent("partial", { data: chunk.data })),
            );
          } else {
            controller.enqueue(
              encoder.encode(
                sseEvent("complete", {
                  data: chunk.data,
                  cost: chunk.cost,
                  latency_ms: chunk.latency_ms,
                }),
              ),
            );
          }
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            sseEvent("error", {
              error: err instanceof Error ? err.message : "Extraction failed",
            }),
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function errorStream(message: string, status: number) {
  return new Response(sseEvent("error", { error: message }), {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}
