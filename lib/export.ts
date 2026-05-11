import type { SavedRecord } from "./schema";

/** Trigger a browser download of a string blob. */
function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(v: string | number | boolean): string {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Export records to a CSV format that imports cleanly into Xero "Spend Money"
 * or QuickBooks "Expenses" bank-transactions imports.
 *
 * Column order picked to match Xero's expected bank-transaction CSV
 * (Date, Amount, Payee, Description, Reference).
 */
export function exportXeroCsv(records: SavedRecord[]) {
  const rows: string[][] = [];
  rows.push([
    "Date",
    "Amount",
    "Payee",
    "Description",
    "Reference",
    "Currency",
    "Subtotal",
    "ServiceCharge",
    "SST",
    "Category",
    "PaymentMethod",
    "IsEInvoice",
    "IRBM_UIN",
    "Notes",
  ]);
  for (const r of records) {
    rows.push([
      r.date,
      r.total,
      r.merchant,
      r.line_items.map((li) => li.description).filter(Boolean).join("; "),
      r.id.slice(0, 8),
      r.currency,
      r.subtotal,
      r.service_charge,
      r.sst_amount,
      r.expense_category,
      r.payment_method,
      r.is_einvoice ? "true" : "false",
      r.irbm_uin,
      r.notes,
    ].map(csvEscape));
  }
  const csv = rows.map((r) => r.join(",")).join("\n");
  download(`receipts-${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv");
}

export function exportJson(records: SavedRecord[]) {
  download(
    `receipts-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(records, null, 2),
    "application/json",
  );
}
