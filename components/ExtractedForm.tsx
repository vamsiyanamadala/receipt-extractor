"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, RotateCcw, Sparkles } from "lucide-react";
import { ReceiptSchema, type Receipt } from "@/lib/schema";
import { ConfidenceField } from "./ConfidenceField";
import { LineItemsTable } from "./LineItemsTable";

const EMPTY: Receipt = {
  merchant: "",
  merchant_address: "",
  merchant_name_translated: "",
  date: "",
  total: "",
  currency: "",
  subtotal: "",
  service_charge: "",
  sst_amount: "",
  tax_label: "",
  payment_method: "",
  is_einvoice: false,
  irbm_uin: "",
  expense_category: "",
  language_detected: "",
  line_items: [],
  notes: "",
  confidences: {},
};

const CATEGORIES = [
  "",
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
] as const;

export type FormStatus = "idle" | "extracting" | "done" | "error" | "saved";

interface ExtractedFormProps {
  /** The current data — updated continuously during streaming. */
  data: Receipt | null;
  status: FormStatus;
  error: string | null;
  /** Counter that increments each streaming partial; drives flash animation. */
  streamTick: number;
  onSubmit: (data: Receipt) => void;
  onReset: () => void;
}

export function ExtractedForm({
  data,
  status,
  error,
  streamTick,
  onSubmit,
  onReset,
}: ExtractedFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Receipt>({
    resolver: zodResolver(ReceiptSchema),
    defaultValues: EMPTY,
  });

  // Track which fields have been confirmed by the latest streaming update so
  // we can flash them. We use the streamTick + the field's current value as a
  // simple change detector.
  const flashCounters = useRef<Record<string, number>>({});
  const prevValues = useRef<Partial<Receipt>>({});

  // Sync incoming data into the form whenever it changes. We always reset to
  // the latest data so streaming partials propagate into the inputs.
  useEffect(() => {
    if (!data) return;
    reset(data, { keepDirtyValues: true });
    // Detect which scalar fields newly received a value to drive flash.
    const tracked: (keyof Receipt)[] = [
      "merchant",
      "date",
      "total",
      "currency",
      "subtotal",
      "service_charge",
      "sst_amount",
      "expense_category",
    ];
    for (const k of tracked) {
      const prev = prevValues.current[k];
      const curr = data[k];
      if (curr && curr !== prev && curr !== "") {
        flashCounters.current[k] = (flashCounters.current[k] ?? 0) + 1;
      }
      (prevValues.current as Record<string, unknown>)[k] = curr;
    }
  }, [data, reset]);

  const confidences = data?.confidences ?? {};

  // ----- Empty state (no upload yet) -----
  if (status === "idle") {
    return (
      <div className="receipt-card receipt-perforated p-8 sm:p-10 h-full flex flex-col">
        <Header label="output" />
        <div className="flex-1 flex items-center justify-center text-center min-h-[320px]">
          <p className="font-serif italic text-xl text-ink-muted max-w-[28ch] leading-snug">
            Upload a receipt — fields will populate live as Claude reads it.
          </p>
        </div>
      </div>
    );
  }

  // ----- Error state -----
  if (status === "error") {
    return (
      <div className="receipt-card receipt-perforated p-8 sm:p-10 h-full flex flex-col">
        <Header label="error" />
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-5 min-h-[320px]">
          <p className="font-serif text-xl text-ink leading-snug max-w-[36ch]">
            {error ?? "Something went wrong while extracting."}
          </p>
          <button onClick={onReset} className="btn-ghost">
            <RotateCcw size={14} /> Try again
          </button>
        </div>
      </div>
    );
  }

  // ----- Saved state -----
  if (status === "saved") {
    return (
      <div className="receipt-card receipt-perforated p-8 sm:p-10 h-full flex flex-col">
        <Header label="saved" />
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-5 min-h-[320px] animate-fade-in">
          <div className="w-14 h-14 border border-ok text-ok flex items-center justify-center">
            <Check size={22} strokeWidth={1.5} />
          </div>
          <p className="font-serif text-2xl text-ink leading-snug">
            Saved to history.
          </p>
          <p className="font-mono text-[11px] uppercase tracking-wider text-ink-muted">
            view all in the history tab
          </p>
          <button onClick={onReset} className="btn-ghost mt-2">
            <RotateCcw size={14} /> New receipt
          </button>
        </div>
      </div>
    );
  }

  // ----- Form (extracting OR done) -----
  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="receipt-card receipt-perforated p-8 sm:p-10 flex flex-col gap-6"
    >
      <FormHeader status={status} data={data} streamTick={streamTick} />

      {/* Required four (assessment) */}
      <Section label="required">
        <div className="grid grid-cols-1 gap-5 stagger">
          <ConfidenceField
            label="Merchant"
            placeholder="—"
            confidence={confidences.merchant}
            flash={flashCounters.current.merchant}
            {...register("merchant")}
          />
          {data?.merchant_name_translated && (
            <div className="-mt-3 font-mono text-[11px] text-ink-muted">
              alt: {data.merchant_name_translated}
            </div>
          )}
          <ConfidenceField
            label="Date"
            placeholder="YYYY-MM-DD"
            confidence={confidences.date}
            flash={flashCounters.current.date}
            {...register("date")}
          />
          <div className="grid grid-cols-[1fr_auto] gap-6">
            <ConfidenceField
              label="Total"
              inputMode="decimal"
              placeholder="0.00"
              confidence={confidences.total}
              flash={flashCounters.current.total}
              {...register("total")}
            />
            <div className="w-24">
              <ConfidenceField
                label="Currency"
                placeholder="MYR"
                maxLength={8}
                confidence={confidences.currency}
                flash={flashCounters.current.currency}
                className="text-right uppercase"
                {...register("currency", {
                  setValueAs: (v: string) =>
                    typeof v === "string" ? v.toUpperCase() : v,
                })}
              />
            </div>
          </div>
        </div>
        <FieldError message={errors.merchant?.message || errors.total?.message} />
      </Section>

      {/* Malaysian / breakdown */}
      <Section label="breakdown">
        <div className="grid grid-cols-3 gap-5">
          <ConfidenceField
            label="Subtotal"
            inputMode="decimal"
            placeholder="0.00"
            confidence={confidences.subtotal}
            flash={flashCounters.current.subtotal}
            {...register("subtotal")}
          />
          <ConfidenceField
            label="Service charge"
            inputMode="decimal"
            placeholder="0.00"
            confidence={confidences.service_charge}
            flash={flashCounters.current.service_charge}
            {...register("service_charge")}
          />
          <ConfidenceField
            label={data?.tax_label || "Tax / SST"}
            inputMode="decimal"
            placeholder="0.00"
            confidence={confidences.sst_amount}
            flash={flashCounters.current.sst_amount}
            {...register("sst_amount")}
          />
        </div>

        <div className="grid grid-cols-2 gap-5 mt-5">
          <div>
            <label className="field-label" htmlFor="payment_method">
              Payment method
            </label>
            <input
              id="payment_method"
              type="text"
              placeholder="—"
              className="field-input"
              {...register("payment_method")}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="expense_category">
              Category
            </label>
            <select
              id="expense_category"
              className="field-input font-serif appearance-none cursor-pointer"
              {...register("expense_category")}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c || "—"}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      {/* e-Invoice */}
      {(data?.is_einvoice || data?.irbm_uin) && (
        <Section label="malaysia e-invoice">
          <div className="flex items-center gap-3 mb-3">
            <span className="pill-accent">
              <Sparkles size={10} strokeWidth={1.75} /> myinvois detected
            </span>
            {data?.language_detected && (
              <span className="pill-ink">{data.language_detected}</span>
            )}
          </div>
          <div>
            <label className="field-label" htmlFor="irbm_uin">
              IRBM UIN
            </label>
            <input
              id="irbm_uin"
              type="text"
              placeholder="—"
              className="field-input font-mono text-sm"
              {...register("irbm_uin")}
            />
          </div>
        </Section>
      )}

      {/* Line items */}
      {data?.line_items && data.line_items.length > 0 && (
        <Section label="line items">
          <LineItemsTable items={data.line_items} />
        </Section>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between gap-3 pt-4 mt-2 border-t border-dashed border-line">
        <button
          type="button"
          onClick={onReset}
          className="font-mono text-[11px] uppercase tracking-wider text-ink-muted hover:text-ink transition-colors cursor-pointer"
        >
          ← New receipt
        </button>
        <button
          type="submit"
          disabled={isSubmitting || status === "extracting"}
          className="btn-primary"
        >
          {isSubmitting ? "Saving…" : status === "extracting" ? "Extracting…" : "Submit"}
        </button>
      </div>
    </form>
  );
}

// ---------- Subcomponents ----------

function Header({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between mb-6 pb-4 border-b border-dashed border-line">
      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted">
        {label}
      </span>
    </div>
  );
}

function FormHeader({
  status,
  data,
  streamTick,
}: {
  status: FormStatus;
  data: Receipt | null;
  streamTick: number;
}) {
  const fieldsFilled = useMemo(() => {
    if (!data) return 0;
    return [data.merchant, data.date, data.total, data.currency].filter(
      (v) => typeof v === "string" && v.length > 0,
    ).length;
  }, [data, streamTick]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex items-center justify-between pb-4 border-b border-dashed border-line">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted">
          extracted · editable
        </span>
        {status === "extracting" && (
          <span className="inline-block w-1.5 h-1.5 bg-accent animate-pulse-soft" />
        )}
      </div>
      <div className="flex items-center gap-2">
        {status === "extracting" && (
          <span className="font-mono text-[10px] tracking-wider text-ink-muted">
            {fieldsFilled}/4 fields
          </span>
        )}
        {status === "done" && (
          <span className="pill-ok">
            <Check size={10} strokeWidth={2} /> ready
          </span>
        )}
      </div>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted mb-3">
        {label}
      </h2>
      {children}
    </section>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-accent">
      {message}
    </p>
  );
}
