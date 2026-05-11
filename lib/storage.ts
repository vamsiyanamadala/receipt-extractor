"use client";

import type { CostInfo, Receipt, SavedRecord } from "./schema";

const STORAGE_KEY = "receipts:saved";

/** Compute SHA-256 hex of arbitrary bytes (browser, no node). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  return sha256Hex(new Uint8Array(buf));
}

export function loadHistory(): SavedRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function findDuplicate(
  history: SavedRecord[],
  imageHash: string,
  candidate: Pick<Receipt, "merchant" | "date" | "total">,
): SavedRecord | null {
  // Strong match: same image bytes.
  const byHash = history.find((r) => r.image_hash === imageHash);
  if (byHash) return byHash;
  // Weaker match: identical (merchant, date, total) tuple.
  if (candidate.merchant && candidate.date && candidate.total) {
    return (
      history.find(
        (r) =>
          r.merchant.toLowerCase().trim() === candidate.merchant.toLowerCase().trim() &&
          r.date === candidate.date &&
          r.total === candidate.total,
      ) ?? null
    );
  }
  return null;
}

export function saveRecord(
  data: Receipt,
  imageHash: string,
  cost: CostInfo,
): SavedRecord {
  const record: SavedRecord = {
    ...data,
    id: crypto.randomUUID(),
    image_hash: imageHash,
    saved_at: new Date().toISOString(),
    cost,
  };
  const history = loadHistory();
  history.unshift(record);
  // Cap history at 200 to avoid filling localStorage.
  const trimmed = history.slice(0, 200);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  return record;
}

export function clearHistory() {
  localStorage.removeItem(STORAGE_KEY);
}

export function deleteRecord(id: string) {
  const history = loadHistory().filter((r) => r.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}
