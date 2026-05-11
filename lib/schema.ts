import { z } from "zod";

/**
 * Schema for everything we extract from a receipt.
 * Single source of truth used by the API route, the client form, and the eval runner.
 *
 * Design notes:
 * - The four assessment-required fields (merchant, date, total, currency) are at the
 *   top and marked. Everything else is a stretch field.
 * - We keep all numeric values as strings so the form's text inputs stay simple
 *   and we don't fight react-hook-form's string-default behaviour.
 * - `confidences` is a parallel record keyed by field name; values 0..1.
 *   Fields below CONFIDENCE_THRESHOLD render with a "review" warning in the UI.
 */

export const CONFIDENCE_THRESHOLD = 0.85;

const moneyString = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Must be a decimal (e.g. 12.34)")
  .or(z.literal(""));

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
  .or(z.literal(""));

const confidence = z.number().min(0).max(1);

export const LineItemSchema = z.object({
  description: z.string(),
  quantity: z.string().regex(/^\d+(\.\d+)?$/).or(z.literal("")).default(""),
  unit_price: moneyString.default(""),
  amount: moneyString.default(""),
});

export const ReceiptSchema = z.object({
  // ----- Assessment-required fields -----
  merchant: z.string().min(1, "Merchant name is required"),
  date: isoDate,
  total: moneyString,
  currency: z.string().min(1, "Currency is required").max(8),

  // ----- Stretch: structure -----
  merchant_address: z.string().default(""),
  merchant_name_translated: z.string().default(""),

  subtotal: moneyString.default(""),
  service_charge: moneyString.default(""),
  sst_amount: moneyString.default(""),
  tax_label: z.string().default(""), // "SST 6%", "GST 6%", "VAT 20%", etc.

  payment_method: z.string().default(""),

  // ----- Stretch: Malaysia / e-invoice -----
  is_einvoice: z.boolean().default(false),
  irbm_uin: z.string().default(""), // 15-char alphanumeric per LHDN

  // ----- Stretch: classification -----
  expense_category: z
    .enum([
      "Food & Beverage",
      "Groceries",
      "Transportation",
      "Fuel",
      "Travel & Accommodation",
      "Office Supplies",
      "Software & Subscriptions",
      "Entertainment",
      "Health & Pharmacy",
      "Utilities",
      "Telecommunications",
      "Other",
    ])
    .or(z.literal(""))
    .default(""),

  language_detected: z.string().default(""), // "en", "ms", "zh", "mixed"

  // ----- Stretch: structured detail -----
  line_items: z.array(LineItemSchema).default([]),

  // ----- Stretch: model output meta -----
  notes: z.string().default(""), // free-form notes from the model

  confidences: z
    .object({
      merchant: confidence,
      date: confidence,
      total: confidence,
      currency: confidence,
      subtotal: confidence,
      service_charge: confidence,
      sst_amount: confidence,
    })
    .partial()
    .default({}),
});

export type Receipt = z.infer<typeof ReceiptSchema>;
export type LineItem = z.infer<typeof LineItemSchema>;
export type ConfidenceMap = Receipt["confidences"];

// ----- API / streaming event types -----

export type CostInfo = {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  estimated_usd: number;
};

export type StreamEvent =
  | { type: "field"; partial: Partial<Receipt> }
  | { type: "done"; data: Receipt; cost: CostInfo; latency_ms: number }
  | { type: "error"; error: string };

export type SyncResponse =
  | { ok: true; data: Receipt; cost: CostInfo; latency_ms: number }
  | { ok: false; error: string };

// ----- Saved record in localStorage -----

export type SavedRecord = Receipt & {
  id: string;          // uuid
  image_hash: string;  // sha-256 of the image bytes
  saved_at: string;    // ISO timestamp
  cost: CostInfo;
};

// ----- Helpers -----

/**
 * Strict pricing for cost telemetry (USD per million tokens, May 2026).
 * Claude Sonnet 4.6.
 */
export const PRICING = {
  input_per_mtok: 3.0,
  output_per_mtok: 15.0,
  cache_read_per_mtok: 0.3,    // 0.1x input
  cache_write_per_mtok: 3.75,  // 1.25x input (5-min cache)
} as const;

export function computeCost(usage: {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
}): CostInfo {
  const inputUsd = (usage.input_tokens / 1_000_000) * PRICING.input_per_mtok;
  const outputUsd = (usage.output_tokens / 1_000_000) * PRICING.output_per_mtok;
  const cacheReadUsd =
    ((usage.cache_read_tokens ?? 0) / 1_000_000) * PRICING.cache_read_per_mtok;
  const cacheWriteUsd =
    ((usage.cache_write_tokens ?? 0) / 1_000_000) * PRICING.cache_write_per_mtok;
  return {
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_tokens: usage.cache_read_tokens,
    cache_write_tokens: usage.cache_write_tokens,
    estimated_usd: inputUsd + outputUsd + cacheReadUsd + cacheWriteUsd,
  };
}
