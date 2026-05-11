"use client";

import { AlertTriangle, X } from "lucide-react";
import type { SavedRecord } from "@/lib/schema";

export function DuplicateBanner({
  match,
  onDismiss,
}: {
  match: SavedRecord;
  onDismiss: () => void;
}) {
  const isSameImage = match.image_hash !== "";
  const date = new Date(match.saved_at).toLocaleString();
  return (
    <div className="flex items-start gap-3 border border-flag bg-flag-soft px-4 py-3 mb-4">
      <AlertTriangle
        size={16}
        className="text-flag mt-0.5 shrink-0"
        strokeWidth={1.75}
      />
      <div className="flex-1 min-w-0">
        <p className="font-mono text-[11px] uppercase tracking-wider text-flag mb-1">
          {isSameImage ? "duplicate image" : "possible duplicate"}
        </p>
        <p className="font-serif text-sm text-ink leading-snug">
          A matching receipt for{" "}
          <span className="font-medium">{match.merchant || "this merchant"}</span> on{" "}
          {match.date || "this date"} ({match.currency} {match.total}) was already
          saved on {date}.
        </p>
      </div>
      <button
        onClick={onDismiss}
        className="text-flag/70 hover:text-flag transition-colors p-0.5"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
