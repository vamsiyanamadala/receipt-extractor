#!/usr/bin/env tsx
/**
 * CLI eval runner. Loads receipts from eval/fixtures/, compares against
 * eval/golden/ labels, prints per-field accuracy. Run with `npm run eval`.
 *
 * Why a CLI in addition to the /eval page: this is what you run in CI, or
 * point at when iterating on prompts. The page is for showing reviewers.
 */
import { config } from "dotenv";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { extractReceiptSync, type MediaType } from "../lib/extract";
import type { Receipt } from "../lib/schema";

config({ path: ".env.local" });
config({ path: ".env" });

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

const moneyEqual = (a?: string, b?: string) =>
  (!a && !b) || (!!a && !!b && Number(a) === Number(b));
const strEqual = (a?: string, b?: string) =>
  (!a && !b) ||
  (!!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase());

function compare(predicted: Receipt, golden: GoldenLabel) {
  const matches: Record<string, boolean> = {};
  if (golden.merchant !== undefined)
    matches.merchant = strEqual(predicted.merchant, golden.merchant);
  if (golden.date !== undefined) matches.date = predicted.date === golden.date;
  if (golden.total !== undefined)
    matches.total = moneyEqual(predicted.total, golden.total);
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

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("✗ Missing ANTHROPIC_API_KEY. Add it to .env.local.");
    process.exit(1);
  }
  try {
    await stat(FIXTURES_DIR);
  } catch {
    console.log("No eval/fixtures directory found.");
    console.log("See eval/README.md for how to populate the test set.");
    process.exit(0);
  }
  const files = (await readdir(FIXTURES_DIR)).filter((f) =>
    Object.keys(MEDIA_BY_EXT).some((ext) => f.toLowerCase().endsWith(ext)),
  );
  if (files.length === 0) {
    console.log("No fixture images found in eval/fixtures/.");
    console.log("Drop .jpg/.png receipts in there and add matching .json labels in eval/golden/.");
    process.exit(0);
  }

  console.log(`\n→ Running eval against ${files.length} fixture(s)\n`);

  const fieldStats: Record<string, { correct: number; total: number }> = {};
  let labelled = 0;
  let fullMatch = 0;
  let totalCost = 0;
  const latencies: number[] = [];

  for (const filename of files) {
    const ext = path.extname(filename).toLowerCase();
    const mediaType = MEDIA_BY_EXT[ext];
    if (!mediaType) continue;

    const goldenPath = path.join(GOLDEN_DIR, filename.replace(ext, ".json"));
    let golden: GoldenLabel | undefined;
    try {
      const raw = await readFile(goldenPath, "utf-8");
      // Strip UTF-8 BOM if present (Windows PowerShell loves to add one)
      const clean = raw.replace(/^\uFEFF/, "").trim();
      golden = JSON.parse(clean) as GoldenLabel;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(`  ! couldn't load golden for ${filename}: ${(e as Error).message}`);
      }
      golden = undefined;
    }

    try {
      const bytes = await readFile(path.join(FIXTURES_DIR, filename));
      const { data, cost, latency_ms } = await extractReceiptSync(
        bytes.toString("base64"),
        mediaType,
      );
      latencies.push(latency_ms);
      totalCost += cost.estimated_usd;

      const summary = `[${data.merchant || "?"}] ${data.date || "?"}  ${
        data.currency || "?"
      } ${data.total || "?"}`;
      if (golden) {
        labelled++;
        const matches = compare(data, golden);
        const entries = Object.entries(matches);
        let allOk = entries.length > 0;
        for (const [field, ok] of entries) {
          fieldStats[field] ??= { correct: 0, total: 0 };
          fieldStats[field].total++;
          if (ok) fieldStats[field].correct++;
          else allOk = false;
        }
        if (allOk) fullMatch++;
        const missed = entries.filter(([, ok]) => !ok).map(([f]) => f);
        const status = allOk ? "✓" : `✗ (missed: ${missed.join(", ")})`;
        console.log(`  ${status}  ${filename.padEnd(40)} ${summary}  [${latency_ms}ms]`);
      } else {
        console.log(`  •  ${filename.padEnd(40)} ${summary}  [${latency_ms}ms]  (no golden)`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      console.log(`  ✗  ${filename.padEnd(40)} ERROR: ${msg}`);
    }
  }

  console.log("\n→ Field accuracy");
  for (const [field, s] of Object.entries(fieldStats)) {
    const rate = ((s.correct / s.total) * 100).toFixed(1);
    console.log(`  ${field.padEnd(16)} ${s.correct}/${s.total}  (${rate}%)`);
  }
  if (labelled > 0) {
    console.log(
      `\n→ Full-record exact match: ${fullMatch}/${labelled}  (${(
        (fullMatch / labelled) *
        100
      ).toFixed(1)}%)`,
    );
  }
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  console.log(
    `\n→ Latency  p50: ${p50 ?? "—"}ms   p95: ${p95 ?? "—"}ms   total cost: $${totalCost.toFixed(4)}`,
  );
}

main().catch((err) => {
  console.error("Eval crashed:", err);
  process.exit(1);
});
