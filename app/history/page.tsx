"use client";

import { useEffect, useState } from "react";
import { Download, FileJson, Trash2 } from "lucide-react";
import { Nav } from "@/components/Nav";
import {
  clearHistory,
  deleteRecord,
  loadHistory,
} from "@/lib/storage";
import { exportJson, exportXeroCsv } from "@/lib/export";
import type { SavedRecord } from "@/lib/schema";

export default function HistoryPage() {
  const [records, setRecords] = useState<SavedRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setRecords(loadHistory());
    setLoaded(true);
  }, []);

  const refresh = () => setRecords(loadHistory());

  return (
    <main className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 py-8 sm:py-12">
      <Nav />

      <header className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="font-serif text-4xl sm:text-5xl leading-[0.95] tracking-tight text-ink">
            History.
          </h1>
          <p className="mt-3 font-sans text-sm text-ink-soft">
            {loaded ? `${records.length} saved` : "Loading…"} ·
            Stored in your browser, never uploaded anywhere.
          </p>
        </div>
        {records.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn-ghost"
              onClick={() => exportXeroCsv(records)}
            >
              <Download size={12} /> CSV
            </button>
            <button className="btn-ghost" onClick={() => exportJson(records)}>
              <FileJson size={12} /> JSON
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                if (confirm("Clear all saved receipts?")) {
                  clearHistory();
                  refresh();
                }
              }}
            >
              <Trash2 size={12} /> Clear
            </button>
          </div>
        )}
      </header>

      {loaded && records.length === 0 && (
        <div className="receipt-card receipt-perforated p-10 sm:p-14 text-center">
          <p className="font-serif italic text-xl text-ink-muted max-w-[34ch] mx-auto">
            No receipts saved yet. Extract one to see it here.
          </p>
        </div>
      )}

      {records.length > 0 && (
        <div className="receipt-card receipt-perforated overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line bg-paper-dark/40">
                {["Date", "Merchant", "Total", "Category", "SST", "Saved", ""].map(
                  (h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-ink-muted font-medium"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-line/50 last:border-b-0 hover:bg-paper-dark/30"
                >
                  <td className="px-4 py-3 font-mono text-xs text-ink-soft">
                    {r.date || "—"}
                  </td>
                  <td className="px-4 py-3 font-serif text-base text-ink">
                    {r.merchant || "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-ink">
                    {r.currency} {r.total}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-soft">
                    {r.expense_category || "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-muted">
                    {r.sst_amount || "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-ink-muted">
                    {new Date(r.saved_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => {
                        deleteRecord(r.id);
                        refresh();
                      }}
                      className="text-ink-muted hover:text-accent transition-colors"
                      aria-label="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
