"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { CONFIDENCE_THRESHOLD } from "@/lib/schema";

export interface ConfidenceFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue"> {
  label: string;
  confidence?: number;
  flash?: number; // a counter that triggers the confirm animation when it changes
}

/**
 * An input wrapped with a label and a confidence indicator. If confidence is
 * below CONFIDENCE_THRESHOLD, the input gets a yellow underline and a small
 * "review" warning pill next to the label.
 *
 * When `flash` changes (e.g. a streaming partial confirms this field), the
 * input briefly flashes green.
 */
export const ConfidenceField = forwardRef<HTMLInputElement, ConfidenceFieldProps>(
  function ConfidenceField(
    { label, confidence, flash, className = "", ...rest },
    ref,
  ) {
    const flagged =
      confidence !== undefined && confidence > 0 && confidence < CONFIDENCE_THRESHOLD;

    // Trigger flash animation when `flash` changes.
    const [flashOn, setFlashOn] = useState(false);
    const prevFlash = useRef(flash);
    useEffect(() => {
      if (flash !== undefined && flash !== prevFlash.current) {
        prevFlash.current = flash;
        setFlashOn(true);
        const t = setTimeout(() => setFlashOn(false), 700);
        return () => clearTimeout(t);
      }
    }, [flash]);

    return (
      <div>
        <div className="field-label">
          <span>{label}</span>
          <div className="flex items-center gap-1.5">
            {confidence !== undefined && confidence > 0 && (
              <span
                className={`font-mono text-[9px] tracking-wide ${
                  flagged ? "text-flag" : "text-ok"
                }`}
                title={`Model confidence: ${(confidence * 100).toFixed(0)}%`}
              >
                {(confidence * 100).toFixed(0)}%
              </span>
            )}
            {flagged && (
              <span
                className="inline-flex items-center gap-1 text-flag font-mono text-[9px] uppercase tracking-wider"
                title="Below 85% confidence — please review"
              >
                <AlertTriangle size={9} strokeWidth={2} />
                review
              </span>
            )}
          </div>
        </div>
        <input
          ref={ref}
          className={`field-input ${flagged ? "field-flag" : "field-ok"} ${
            flashOn ? "flash-confirm" : ""
          } ${className}`}
          {...rest}
        />
      </div>
    );
  },
);
