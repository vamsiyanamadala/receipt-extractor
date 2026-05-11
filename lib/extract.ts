import Anthropic from "@anthropic-ai/sdk";
import { parse as parsePartial, Allow } from "partial-json";
import { SYSTEM_PROMPT } from "./prompt";
import { type Receipt, computeCost, type CostInfo } from "./schema";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

export type MediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

/**
 * JSON Schema for the extract_receipt tool. We use forced tool-use to guarantee
 * the model returns a single object matching this exact shape.
 *
 * Keep this aligned with `lib/schema.ts` Zod schema — they are two views of the
 * same contract.
 */
const TOOL_SCHEMA = {
  type: "object",
  properties: {
    merchant: { type: "string", description: "Trading name of the merchant" },
    merchant_address: { type: "string" },
    merchant_name_translated: {
      type: "string",
      description: "Romanised English version if merchant is in another script",
    },
    date: { type: "string", description: "YYYY-MM-DD" },
    total: { type: "string", description: "Final amount paid, decimal string" },
    currency: { type: "string", description: "ISO 4217 code, e.g. MYR" },
    subtotal: { type: "string" },
    service_charge: { type: "string" },
    sst_amount: { type: "string", description: "SST / GST / tax amount" },
    tax_label: { type: "string", description: 'e.g. "SST 6%"' },
    payment_method: { type: "string" },
    is_einvoice: { type: "boolean" },
    irbm_uin: { type: "string" },
    expense_category: {
      type: "string",
      enum: [
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
        "",
      ],
    },
    language_detected: {
      type: "string",
      description: 'One of: "en", "ms", "zh", "mixed"',
    },
    line_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          quantity: { type: "string" },
          unit_price: { type: "string" },
          amount: { type: "string" },
        },
        required: ["description", "amount"],
        additionalProperties: false,
      },
    },
    notes: { type: "string" },
    confidences: {
      type: "object",
      properties: {
        merchant: { type: "number" },
        date: { type: "number" },
        total: { type: "number" },
        currency: { type: "number" },
        subtotal: { type: "number" },
        service_charge: { type: "number" },
        sst_amount: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  required: [
    "merchant",
    "date",
    "total",
    "currency",
    "expense_category",
    "language_detected",
    "is_einvoice",
    "line_items",
    "confidences",
  ],
  additionalProperties: false,
} as const;

function makeClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

/**
 * Build the message payload. The system prompt is wrapped with cache_control so
 * Anthropic's prompt cache stores it for ~5 minutes. Subsequent extractions
 * within that window pay 0.1x for those tokens instead of 1x.
 */
function buildMessageParams(imageBase64: string, mediaType: MediaType) {
  return {
    model: MODEL,
    max_tokens: 1500,
    // The system prompt is the cache target.
    system: [
      {
        type: "text" as const,
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" as const },
      },
    ],
    tools: [
      {
        name: "extract_receipt",
        description:
          "Return the structured contents of the receipt. You MUST call this tool exactly once.",
        input_schema: TOOL_SCHEMA as unknown as Anthropic.Messages.Tool.InputSchema,
      },
    ] satisfies Anthropic.Messages.Tool[],
    tool_choice: { type: "tool" as const, name: "extract_receipt" },
    messages: [
      {
        role: "user" as const,
        content: [
          {
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: mediaType,
              data: imageBase64,
            },
          },
          {
            type: "text" as const,
            text: "Extract this receipt by calling the extract_receipt tool.",
          },
        ],
      },
    ],
  };
}

// =====================================================================
// Synchronous extraction (used by the eval runner and as the fallback)
// =====================================================================

export async function extractReceiptSync(
  imageBase64: string,
  mediaType: MediaType,
): Promise<{ data: Receipt; cost: CostInfo; latency_ms: number }> {
  const t0 = Date.now();
  const client = makeClient();
  const response = await client.messages.create(buildMessageParams(imageBase64, mediaType));

  // Pull out the tool_use block.
  const toolUse = response.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error("Model did not return a tool_use block.");
  }

  // The SDK's usage object includes cache fields when prompt caching is active.
  // We coerce to a plain shape and let computeCost handle the math.
  const usage = response.usage as unknown as {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  const cost = computeCost({
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_tokens: usage.cache_read_input_tokens,
    cache_write_tokens: usage.cache_creation_input_tokens,
  });

  return {
    data: normaliseReceipt(toolUse.input as Record<string, unknown>),
    cost,
    latency_ms: Date.now() - t0,
  };
}

// =====================================================================
// Streaming extraction — yields partial Receipt objects as tokens arrive
// =====================================================================

export type StreamYield =
  | { type: "partial"; data: Partial<Receipt> }
  | {
      type: "complete";
      data: Receipt;
      cost: CostInfo;
      latency_ms: number;
    };

/**
 * Async generator that streams partial JSON deltas from Claude tool-use and
 * yields a {type:"partial", data} for every successful partial parse, then a
 * final {type:"complete", ...}.
 *
 * We use the `partial-json` package which can parse JSON that ends mid-string
 * or mid-array, returning a best-effort object.
 */
export async function* extractReceiptStream(
  imageBase64: string,
  mediaType: MediaType,
): AsyncGenerator<StreamYield, void, unknown> {
  const t0 = Date.now();
  const client = makeClient();

  const stream = client.messages.stream(buildMessageParams(imageBase64, mediaType));

  let accumulatedJson = "";
  let lastPartialPayload = "";

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "input_json_delta"
    ) {
      accumulatedJson += event.delta.partial_json;

      // Try to parse what we have so far. partial-json tolerates open strings,
      // arrays, and objects.
      let partial: unknown;
      try {
        partial = parsePartial(
          accumulatedJson,
          Allow.ALL,
        );
      } catch {
        continue;
      }
      if (!partial || typeof partial !== "object") continue;

      // Throttle: only yield when the payload actually changed.
      const payload = JSON.stringify(partial);
      if (payload === lastPartialPayload) continue;
      lastPartialPayload = payload;

      yield {
        type: "partial",
        data: normalisePartial(partial as Record<string, unknown>),
      };
    }
  }

  const finalMessage = await stream.finalMessage();
  const toolUse = finalMessage.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error("Stream ended without a tool_use block.");
  }

  const usage = finalMessage.usage as unknown as {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  const cost = computeCost({
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_tokens: usage.cache_read_input_tokens,
    cache_write_tokens: usage.cache_creation_input_tokens,
  });

  yield {
    type: "complete",
    data: normaliseReceipt(toolUse.input as Record<string, unknown>),
    cost,
    latency_ms: Date.now() - t0,
  };
}

// =====================================================================
// Normalisation — coerce model output to our exact Receipt shape with
// sensible defaults so the UI never sees `undefined`.
// =====================================================================

function normalisePartial(raw: Record<string, unknown>): Partial<Receipt> {
  const out: Partial<Receipt> = {};
  for (const k of [
    "merchant",
    "merchant_address",
    "merchant_name_translated",
    "date",
    "total",
    "currency",
    "subtotal",
    "service_charge",
    "sst_amount",
    "tax_label",
    "payment_method",
    "irbm_uin",
    "expense_category",
    "language_detected",
    "notes",
  ] as const) {
    if (typeof raw[k] === "string") (out as Record<string, unknown>)[k] = raw[k];
    else if (typeof raw[k] === "number")
      (out as Record<string, unknown>)[k] = String(raw[k]);
  }
  if (typeof raw.is_einvoice === "boolean") out.is_einvoice = raw.is_einvoice;
  if (Array.isArray(raw.line_items)) {
    out.line_items = raw.line_items
      .filter((li): li is Record<string, unknown> => !!li && typeof li === "object")
      .map((li) => ({
        description: typeof li.description === "string" ? li.description : "",
        quantity:
          typeof li.quantity === "string"
            ? li.quantity
            : typeof li.quantity === "number"
              ? String(li.quantity)
              : "",
        unit_price:
          typeof li.unit_price === "string"
            ? li.unit_price
            : typeof li.unit_price === "number"
              ? String(li.unit_price)
              : "",
        amount:
          typeof li.amount === "string"
            ? li.amount
            : typeof li.amount === "number"
              ? String(li.amount)
              : "",
      }));
  }
  if (raw.confidences && typeof raw.confidences === "object") {
    const c: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw.confidences as Record<string, unknown>)) {
      if (typeof v === "number") c[k] = Math.max(0, Math.min(1, v));
    }
    out.confidences = c as Receipt["confidences"];
  }
  if (typeof out.currency === "string") out.currency = out.currency.toUpperCase();
  return out;
}

function normaliseReceipt(raw: Record<string, unknown>): Receipt {
  const partial = normalisePartial(raw);
  return {
    merchant: partial.merchant ?? "",
    merchant_address: partial.merchant_address ?? "",
    merchant_name_translated: partial.merchant_name_translated ?? "",
    date: partial.date ?? "",
    total: partial.total ?? "",
    currency: partial.currency ?? "",
    subtotal: partial.subtotal ?? "",
    service_charge: partial.service_charge ?? "",
    sst_amount: partial.sst_amount ?? "",
    tax_label: partial.tax_label ?? "",
    payment_method: partial.payment_method ?? "",
    is_einvoice: partial.is_einvoice ?? false,
    irbm_uin: partial.irbm_uin ?? "",
    expense_category: partial.expense_category ?? "",
    language_detected: partial.language_detected ?? "",
    line_items: partial.line_items ?? [],
    notes: partial.notes ?? "",
    confidences: partial.confidences ?? {},
  };
}
