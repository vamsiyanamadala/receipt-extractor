"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Uploader } from "@/components/Uploader";
import { ExtractedForm, type FormStatus } from "@/components/ExtractedForm";
import { CostFooter } from "@/components/CostFooter";
import { DuplicateBanner } from "@/components/DuplicateBanner";
import { Nav } from "@/components/Nav";
import { streamExtraction } from "@/lib/stream-client";
import { findDuplicate, hashFile, loadHistory, saveRecord } from "@/lib/storage";
import type { CostInfo, Receipt, SavedRecord } from "@/lib/schema";

export default function Page() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<FormStatus>("idle");
  const [data, setData] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cost, setCost] = useState<CostInfo | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [streamTick, setStreamTick] = useState(0);
  const [duplicate, setDuplicate] = useState<SavedRecord | null>(null);

  const objectUrlRef = useRef<string | null>(null);
  const imageHashRef = useRef<string>("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const handleClear = useCallback(() => {
    abortRef.current?.abort();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    imageHashRef.current = "";
    setImageUrl(null);
    setData(null);
    setError(null);
    setCost(null);
    setLatencyMs(null);
    setDuplicate(null);
    setStatus("idle");
  }, []);

  const handleSelect = useCallback(async (file: File) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;

    setImageUrl(url);
    setData(null);
    setError(null);
    setCost(null);
    setLatencyMs(null);
    setDuplicate(null);
    setStatus("extracting");

    // Hash the image while extraction runs.
    hashFile(file).then((hash) => {
      imageHashRef.current = hash;
      // Strong dedup check on hash even before extraction finishes.
      const hist = loadHistory();
      const exact = hist.find((r) => r.image_hash === hash);
      if (exact) setDuplicate(exact);
    });

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    await streamExtraction(
      file,
      {
        onPartial: (partial) => {
          setData((prev) => {
            const next = { ...(prev ?? makeEmpty()), ...partial };
            return next as Receipt;
          });
          setStreamTick((t) => t + 1);
        },
        onComplete: (final, costInfo, lat) => {
          setData(final);
          setCost(costInfo);
          setLatencyMs(lat);
          setStatus("done");
          // Run the tuple-based dedup check now that we have a merchant/date/total.
          const hist = loadHistory();
          const dup = findDuplicate(hist, imageHashRef.current, {
            merchant: final.merchant,
            date: final.date,
            total: final.total,
          });
          if (dup && !duplicate) setDuplicate(dup);
        },
        onError: (err) => {
          setError(err);
          setStatus("error");
        },
      },
      abortRef.current.signal,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = useCallback(
    (final: Receipt) => {
      if (!cost) return;
      const rec = saveRecord(final, imageHashRef.current, cost);
      // eslint-disable-next-line no-console
      console.log("[receipt-extractor] saved", rec);
      setStatus("saved");
    },
    [cost],
  );

  return (
    <main className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 py-8 sm:py-12">
      <Nav />

      <Header />

      {duplicate && (
        <DuplicateBanner match={duplicate} onDismiss={() => setDuplicate(null)} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start">
        <Uploader
          imageUrl={imageUrl}
          status={status}
          onSelect={handleSelect}
          onClear={handleClear}
        />
        <div>
          <ExtractedForm
            data={data}
            status={status}
            error={error}
            streamTick={streamTick}
            onSubmit={handleSave}
            onReset={handleClear}
          />
          {(status === "done" || status === "saved") && (
            <CostFooter cost={cost} latencyMs={latencyMs} />
          )}
        </div>
      </div>

      <Footer />
    </main>
  );
}

function Header() {
  return (
    <header className="mb-8 sm:mb-12">
      <h1 className="font-serif text-5xl sm:text-6xl md:text-7xl leading-[0.95] tracking-tight text-ink">
        Drop a receipt.
        <br />
        <em className="italic text-accent">Get a form.</em>
      </h1>
      <p className="mt-5 max-w-prose font-sans text-base text-ink-soft leading-relaxed">
        Streaming receipt extraction with Claude Sonnet 4.6 vision. Fields
        populate live as the model reads. Built with Malaysian SST, service
        charge, MYR, and MyInvois e-invoice detection — plus a real evaluation
        harness you can run with{" "}
        <code className="font-mono text-sm bg-paper-dark px-1.5 py-0.5 border border-line">
          npm run eval
        </code>
        .
      </p>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-16 sm:mt-24 pt-8 border-t border-dashed border-line flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
        next.js 15 · claude sonnet 4.6 vision · structured outputs · vercel
      </p>
      <a
        href="https://github.com/"
        target="_blank"
        rel="noreferrer"
        className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted hover:text-accent transition-colors"
      >
        source on github →
      </a>
    </footer>
  );
}

function makeEmpty(): Receipt {
  return {
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
}
