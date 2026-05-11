"use client";

import { useState } from "react";
import { Play, Check, X as XIcon } from "lucide-react";
import { Nav } from "@/components/Nav";

type EvalResult = {
  fixture: string;
  ok: boolean;
  error?: string;
  predicted?: Record<string, unknown>;
  golden?: Record<string, unknown>;
  field_matches?: Record<string, boolean>;
  latency_ms?: number;
  cost_usd?: number;
};

type EvalSummary = {
  total: number;
  labelled?: number;
  full_record_match?: number | null;
  field_accuracy?: Record<string, { correct: number; total: number; rate: number }>;
  latency_p50_ms?: number | null;
  latency_p95_ms?: number | null;
  total_cost_usd?: number;
  message?: string;
};

export default function EvalPage() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<EvalResult[] | null>(null);
  const [summary, setSummary] = useState<EvalSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    setResults(null);
    setSummary(null);
    try {
      const res = await fetch("/api/eval", { method: "POST" });
      const body = await res.json();
      if (!body.ok) {
        setError(body.error ?? "Eval failed");
      } else {
        setResults(body.results);
        setSummary(body.summary);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setRunning(false);
    }
  };

  return (
    <main className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 py-8 sm:py-12">
      <Nav />

      <header className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="font-serif text-4xl sm:text-5xl leading-[0.95] tracking-tight text-ink">
            Evaluation.
          </h1>
          <p className="mt-3 max-w-prose font-sans text-sm text-ink-soft leading-relaxed">
            Runs the extractor against{" "}
            <code className="font-mono text-xs bg-paper-dark px-1.5 py-0.5 border border-line">
              eval/fixtures/
            </code>{" "}
            and compares each result against{" "}
            <code className="font-mono text-xs bg-paper-dark px-1.5 py-0.5 border border-line">
              eval/golden/
            </code>
            . Reports per-field accuracy, latency, and total cost. See{" "}
            <code className="font-mono text-xs bg-paper-dark px-1.5 py-0.5 border border-line">
              eval/README.md
            </code>{" "}
            to populate.
          </p>
        </div>
        <button onClick={run} disabled={running} className="btn-primary">
          <Play size={12} /> {running ? "Running…" : "Run eval"}
        </button>
      </header>

      {error && (
        <div className="border border-flag bg-flag-soft px-4 py-3 mb-6 font-mono text-xs text-flag">
          {error}
        </div>
      )}

      {summary && summary.message && (
        <div className="receipt-card receipt-perforated p-10 text-center">
          <p className="font-serif italic text-xl text-ink-muted">
            {summary.message}
          </p>
        </div>
      )}

      {summary && summary.field_accuracy && (
        <SummaryPanel summary={summary} />
      )}

      {results && results.length > 0 && <ResultsTable results={results} />}
    </main>
  );
}

function SummaryPanel({ summary }: { summary: EvalSummary }) {
  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
      <div className="receipt-card receipt-perforated p-6">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted mb-4">
          field-level accuracy
        </h2>
        <table className="w-full">
          <tbody>
            {Object.entries(summary.field_accuracy ?? {}).map(([field, s]) => {
              const pct = (s.rate * 100).toFixed(0);
              const color =
                s.rate >= 0.9 ? "text-ok" : s.rate >= 0.75 ? "text-ink" : "text-flag";
              return (
                <tr key={field} className="border-b border-line/40 last:border-b-0">
                  <td className="py-2 font-mono text-xs text-ink-soft">{field}</td>
                  <td className="py-2 text-right font-serif text-base text-ink-muted">
                    {s.correct}/{s.total}
                  </td>
                  <td className="py-2 text-right">
                    <span className={`font-mono text-sm font-medium ${color}`}>
                      {pct}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="receipt-card receipt-perforated p-6">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted mb-4">
          summary
        </h2>
        <dl className="space-y-3">
          <Stat
            label="Full-record exact match"
            value={
              summary.full_record_match !== null && summary.full_record_match !== undefined
                ? `${(summary.full_record_match * 100).toFixed(1)}%`
                : "—"
            }
          />
          <Stat label="Receipts tested" value={String(summary.total)} />
          <Stat label="Labelled fixtures" value={String(summary.labelled ?? 0)} />
          <Stat
            label="Latency p50"
            value={
              summary.latency_p50_ms != null
                ? `${(summary.latency_p50_ms / 1000).toFixed(2)}s`
                : "—"
            }
          />
          <Stat
            label="Latency p95"
            value={
              summary.latency_p95_ms != null
                ? `${(summary.latency_p95_ms / 1000).toFixed(2)}s`
                : "—"
            }
          />
          <Stat
            label="Total cost"
            value={
              summary.total_cost_usd != null
                ? `$${summary.total_cost_usd.toFixed(4)}`
                : "—"
            }
          />
        </dl>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="font-mono text-xs text-ink-soft">{label}</dt>
      <dd className="font-mono text-sm text-ink">{value}</dd>
    </div>
  );
}

function ResultsTable({ results }: { results: EvalResult[] }) {
  return (
    <section className="receipt-card receipt-perforated overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-line bg-paper-dark/40">
            {["Fixture", "Result", "Predicted", "Latency", ""].map((h) => (
              <th
                key={h}
                className="text-left px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-ink-muted font-medium"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => {
            const matches = r.field_matches ?? {};
            const allMatch = Object.values(matches).every(Boolean);
            const hasGolden = Object.keys(matches).length > 0;
            return (
              <tr key={i} className="border-b border-line/50 last:border-b-0">
                <td className="px-4 py-3 font-mono text-xs text-ink-soft truncate max-w-[200px]">
                  {r.fixture}
                </td>
                <td className="px-4 py-3">
                  {!r.ok ? (
                    <span className="pill-flag">
                      <XIcon size={9} /> error
                    </span>
                  ) : !hasGolden ? (
                    <span className="font-mono text-[10px] text-ink-muted">
                      no golden
                    </span>
                  ) : allMatch ? (
                    <span className="pill-ok">
                      <Check size={9} /> match
                    </span>
                  ) : (
                    <span className="pill-flag">
                      missed:{" "}
                      {Object.entries(matches)
                        .filter(([, ok]) => !ok)
                        .map(([f]) => f)
                        .join(", ")}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 font-serif text-sm text-ink">
                  {r.predicted ? (
                    <>
                      {String(r.predicted.merchant ?? "—")}{" "}
                      <span className="font-mono text-xs text-ink-muted">
                        · {String(r.predicted.currency ?? "")}{" "}
                        {String(r.predicted.total ?? "")} ·{" "}
                        {String(r.predicted.date ?? "")}
                      </span>
                    </>
                  ) : (
                    <span className="text-flag">{r.error}</span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-ink-muted">
                  {r.latency_ms ? `${r.latency_ms}ms` : "—"}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-ink-muted">
                  {r.cost_usd ? `$${r.cost_usd.toFixed(4)}` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
