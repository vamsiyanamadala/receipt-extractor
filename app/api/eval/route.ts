import { NextResponse } from "next/server";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { extractReceiptSync, type MediaType } from "@/lib/extract";
import type { Receipt } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

const FIXTURES_DIR = path.join(process.cwd(), "eval", "fixtures");
const GOLDEN_DIR = path.join(process.cwd(), "eval", "golden");

const MEDIA_BY_EXT: Record<string, MediaType> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

type GoldenLabel = Partial<Pick<Receipt,
  "merchant" | "date" | "total" | "currency" |
  "subtotal" | "service_charge" | "sst_amount"
>>;

type FixtureResult = {
  fixture: string;
  ok: boolean;
  error?: string;
  predicted?: Receipt;
  golden?: GoldenLabel;
  field_matches?: Record<string, boolean>;
  latency_ms?: number;
  cost_usd?: number;
};

function moneyEqual(a: string | undefined, b: string | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  // 12.30 == 12.3 == 12 (ignore trailing zeros)
  return Number(a) === Number(b);
}

function strEqual(a: string | undefined, b: string | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function compareFields(predicted: Receipt, golden: GoldenLabel) {
  const matches: Record<string, boolean> = {};
  if (golden.merchant !== undefined)
    matches.merchant = strEqual(predicted.merchant, golden.merchant);
  if (golden.date !== undefined) matches.date = predicted.date === golden.date;
  if (golden.total !== undefined) matches.total = moneyEqual(predicted.total, golden.total);
  if (golden.currency !== undefined)
    matches.currency = strEqual(predicted.currency, golden.currency);
  if (golden.subtotal !== undefined)
    matches.subtotal = moneyEqual(predicted.subtotal, golden.subtotal);
  if (golden.service_charge !== undefined)
    matches.service_charge = moneyEqual(predicted.service_charge, golden.service_charge);
  if (golden.sst_amount !== undefined)
    matches.sst_amount = moneyEqual(predicted.sst_amount, golden.sst_amount);
  return matches;
}

export async function POST() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "Server missing ANTHROPIC_API_KEY." },
      { status: 500 },
    );
  }

  // Check that the eval directories exist.
  try {
    await stat(FIXTURES_DIR);
  } catch {
    return NextResponse.json({
      ok: true,
      results: [],
      summary: { total: 0, message: "No eval/fixtures directory. See eval/README.md." },
    });
  }

  const files = (await readdir(FIXTURES_DIR)).filter((f) =>
    Object.keys(MEDIA_BY_EXT).some((ext) => f.toLowerCase().endsWith(ext)),
  );

  const results: FixtureResult[] = [];
  for (const filename of files) {
    const ext = path.extname(filename).toLowerCase();
    const mediaType = MEDIA_BY_EXT[ext];
    if (!mediaType) continue;

    const goldenPath = path.join(GOLDEN_DIR, filename.replace(ext, ".json"));
    let golden: GoldenLabel | undefined;
    try {
      const raw = await readFile(goldenPath, "utf-8");
      const clean = raw.replace(/^\uFEFF/, "").trim();
      golden = JSON.parse(clean) as GoldenLabel;
    } catch {
      golden = undefined;
    }

    try {
      const imageBytes = await readFile(path.join(FIXTURES_DIR, filename));
      const base64 = imageBytes.toString("base64");
      const { data, cost, latency_ms } = await extractReceiptSync(base64, mediaType);
      results.push({
        fixture: filename,
        ok: true,
        predicted: data,
        golden,
        field_matches: golden ? compareFields(data, golden) : undefined,
        latency_ms,
        cost_usd: cost.estimated_usd,
      });
    } catch (err) {
      results.push({
        fixture: filename,
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  // Aggregate field-level accuracy across labelled fixtures.
  const fieldStats: Record<string, { correct: number; total: number }> = {};
  let fullMatch = 0;
  let labelledCount = 0;
  for (const r of results) {
    if (!r.field_matches) continue;
    labelledCount++;
    const entries = Object.entries(r.field_matches);
    let allMatch = entries.length > 0;
    for (const [field, ok] of entries) {
      fieldStats[field] ??= { correct: 0, total: 0 };
      fieldStats[field].total++;
      if (ok) fieldStats[field].correct++;
      else allMatch = false;
    }
    if (allMatch) fullMatch++;
  }

  const totalLatency = results
    .filter((r) => r.latency_ms !== undefined)
    .map((r) => r.latency_ms!)
    .sort((a, b) => a - b);
  const totalCost = results
    .filter((r) => r.cost_usd !== undefined)
    .reduce((s, r) => s + (r.cost_usd ?? 0), 0);

  return NextResponse.json({
    ok: true,
    results,
    summary: {
      total: results.length,
      labelled: labelledCount,
      full_record_match: labelledCount > 0 ? fullMatch / labelledCount : null,
      field_accuracy: Object.fromEntries(
        Object.entries(fieldStats).map(([k, v]) => [
          k,
          { ...v, rate: v.correct / v.total },
        ]),
      ),
      latency_p50_ms: totalLatency[Math.floor(totalLatency.length * 0.5)] ?? null,
      latency_p95_ms: totalLatency[Math.floor(totalLatency.length * 0.95)] ?? null,
      total_cost_usd: totalCost,
    },
  });
}
