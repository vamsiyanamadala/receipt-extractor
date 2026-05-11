"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, X, FileImage } from "lucide-react";

interface UploaderProps {
  imageUrl: string | null;
  status: "idle" | "extracting" | "done" | "error" | "saved";
  onSelect: (file: File) => void;
  onClear: () => void;
}

export function Uploader({ imageUrl, status, onSelect, onClear }: UploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) return;
      onSelect(file);
    },
    [onSelect],
  );

  if (imageUrl) {
    return (
      <div className="receipt-card receipt-perforated relative p-4 sm:p-6 sticky top-6">
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-dashed border-line">
          <div className="flex items-center gap-2">
            <FileImage size={14} className="text-ink-muted" />
            <span className="font-mono text-[11px] uppercase tracking-wider text-ink-muted">
              receipt.img
            </span>
          </div>
          <button
            onClick={onClear}
            className="text-ink-muted hover:text-accent transition-colors p-1 -m-1 cursor-pointer"
            aria-label="Remove image"
          >
            <X size={16} />
          </button>
        </div>

        <div className="relative overflow-hidden bg-white border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Uploaded receipt"
            className="block w-full h-auto max-h-[560px] object-contain"
          />
          {status === "extracting" && (
            <>
              <div className="absolute inset-0 bg-accent/5 pointer-events-none" />
              <div
                className="absolute inset-x-0 h-[2px] bg-accent shadow-[0_0_12px_2px_rgba(212,80,42,0.6)] animate-scan-line pointer-events-none"
                style={{ top: 0 }}
              />
            </>
          )}
        </div>

        {status === "extracting" && (
          <div className="mt-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-accent">
            <span className="inline-block w-1.5 h-1.5 bg-accent animate-pulse-soft" />
            <span>analyzing · streaming fields…</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <label
      htmlFor="receipt-file"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`receipt-card receipt-perforated relative block p-10 sm:p-14 cursor-pointer transition-colors duration-200 ${
        dragOver ? "border-accent bg-paper-dark" : "hover:border-ink-soft"
      }`}
    >
      <input
        id="receipt-file"
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div className="flex flex-col items-center text-center">
        <div className="w-14 h-14 border border-line flex items-center justify-center mb-6 bg-paper-dark/50">
          <Upload size={20} className="text-ink-soft" strokeWidth={1.5} />
        </div>

        <p className="font-serif text-2xl sm:text-3xl text-ink mb-2 leading-tight">
          Drop a receipt
        </p>
        <p className="font-mono text-[11px] uppercase tracking-wider text-ink-muted mb-6">
          jpeg · png · webp · gif &nbsp;·&nbsp; max 8mb
        </p>

        <span className="btn-primary pointer-events-none">Choose image</span>

        <p className="mt-8 max-w-[28ch] font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted leading-relaxed">
          Try a Malaysian receipt — sst and service charge get their own fields
        </p>
      </div>
    </label>
  );
}
