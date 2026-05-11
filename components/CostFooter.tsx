"use client";

import type { CostInfo } from "@/lib/schema";
import { Zap } from "lucide-react";

export function CostFooter({
  cost,
  latencyMs,
}: {
  cost: CostInfo | null;
  latencyMs: number | null;
}) {
  if (!cost) return null;
  const cached = (cost.cache_read_tokens ?? 0) > 0;
  return (
    <div className="flex flex-wrap items-center gap-3 mt-6 pt-4 border-t border-dashed border-line font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
      <span className="pill-ink">
        <Zap size={10} strokeWidth={1.5} /> claude sonnet 4.6
      </span>
      <span>
        cost <span className="text-ink">${cost.estimated_usd.toFixed(4)}</span>
      </span>
      <span>
        in <span className="text-ink">{cost.input_tokens.toLocaleString()}</span>
        {" "}/ out <span className="text-ink">{cost.output_tokens.toLocaleString()}</span> tok
      </span>
      {cached && (
        <span className="text-ok">
          cache hit <span className="text-ink">{cost.cache_read_tokens?.toLocaleString()}</span> tok
        </span>
      )}
      {latencyMs !== null && (
        <span>
          latency <span className="text-ink">{(latencyMs / 1000).toFixed(2)}s</span>
        </span>
      )}
    </div>
  );
}
