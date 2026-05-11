"use client";

import type { LineItem } from "@/lib/schema";

export function LineItemsTable({ items }: { items: LineItem[] }) {
  if (!items?.length) {
    return (
      <div className="font-mono text-[11px] text-ink-muted italic py-2">
        No line items detected.
      </div>
    );
  }
  return (
    <div className="overflow-hidden border border-line">
      <table className="w-full font-mono text-xs">
        <thead>
          <tr className="border-b border-line bg-paper-dark/40">
            <th className="text-left px-3 py-1.5 uppercase tracking-wider text-[10px] text-ink-muted font-medium">
              Item
            </th>
            <th className="text-right px-3 py-1.5 uppercase tracking-wider text-[10px] text-ink-muted font-medium w-14">
              Qty
            </th>
            <th className="text-right px-3 py-1.5 uppercase tracking-wider text-[10px] text-ink-muted font-medium w-20">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr
              key={i}
              className="border-b border-line/50 last:border-b-0 hover:bg-paper-dark/30"
            >
              <td className="px-3 py-1.5 text-ink-soft font-serif text-sm">
                {it.description || "—"}
              </td>
              <td className="px-3 py-1.5 text-right text-ink-muted">
                {it.quantity || "1"}
              </td>
              <td className="px-3 py-1.5 text-right text-ink font-medium">
                {it.amount || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
