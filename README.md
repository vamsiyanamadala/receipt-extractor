# Receipt → Form

A streaming receipt-extraction app. Drop in an image, watch Claude's vision model fill in a structured form field-by-field, edit anything you want, submit. Built with Malaysian SST, service charge, MYR, and MyInvois e-invoice awareness — plus a real evaluation harness.

Submitted for the **Teleperformance Malaysia AI Intern Build Challenge**, May 2026.

\*\*Live:\*\* https://receipt-extractor-six.vercel.app  

\*\*Demo (90 s):\*\* \_(add after recording)\_

## TL;DR for the reviewer

* **Live streaming UI** — fields populate one-by-one as Claude decodes the JSON, with a flash animation when each is confirmed.
* **Strict structured outputs** via Claude tool-use (`tool\\\_choice: "extract\\\_receipt"`) — guaranteed-shape JSON, no parse failures.
* **Malaysia-aware** — separates SST from service charge from subtotal, normalises `RM` / `MYR` / Ringgit symbol to `MYR`, detects IRBM UIN on MyInvois receipts, handles trilingual (English / Bahasa / Chinese) merchants.
* **Confidence per field** — model returns 0–1 confidence; anything below 0.85 renders with a yellow "review" flag in the UI.
* **Real eval harness** — `npm run eval` runs against `eval/fixtures/`, comparing against `eval/golden/` labels, reporting per-field accuracy, p50/p95 latency, and total cost.
* **Prompt caching** — system prompt is cached with `cache\\\_control: ephemeral`; second-and-later extractions in a 5-minute window pay 0.1× input tokens for the prompt.
* **Duplicate detection** — SHA-256 image hash + `(merchant, date, total)` tuple match against history.
* **Cost telemetry** — every extraction surfaces `$/extraction`, input/output tokens, and cache hit info in the UI.
* **CSV export** shaped for Xero / QuickBooks bank-transaction import.

\---

## Stack

|Layer|Choice|
|-|-|
|Frontend|Next.js 15 App Router · React 19 · TypeScript|
|Styling|Tailwind CSS · Instrument Serif + JetBrains Mono|
|Form|react-hook-form · Zod|
|AI|Anthropic Claude `claude-sonnet-4-6` (vision)|
|Structured out|Tool-use with `tool\\\_choice` + strict input schema|
|Streaming|SSE from `/api/extract`, partial-JSON parser client-side|
|Storage|`localStorage` (per assessment spec: in-memory OK)|
|Eval|`npm run eval` CLI + `/eval` page hitting `/api/eval`|
|Hosting|Vercel — zero-config deploy|

### Why this model?

`claude-sonnet-4-6` (Anthropic's current default Sonnet, released 17 Feb 2026) leads independent vision benchmarks for document/OCR — TokenMix Research Lab's April 2026 study reports **95.2 % document accuracy** and **97.6 % field-level extraction** on receipt-like tasks, beating GPT-5.4 and Gemini 3.1 Pro. At $3/$15 per MTok with 1M-token context, it's the right balance for an audience that values document accuracy.

Considered and rejected:

* **Claude Opus 4.7** — better, but \~5× cost. Worth it for adversarial cases (small print, low contrast); plan is to route only those to Opus.
* **Claude Haiku 4.5** — cheaper / faster but lower accuracy on Malaysian receipts in my testing. Good fallback target.
* **GPT-5.4 / Gemini 3.1 Pro** — competitive accuracy but I'm in the Anthropic ecosystem already and Claude's structured-output tool-use is the cleanest of the three.
* **Fine-tuned Donut / LayoutLMv3** — better long-tail accuracy but requires a custom training set per merchant template. Wrong shape for a horizontal product.

\---

## Architecture

```
┌────────────┐ multipart/form-data ┌──────────────────────┐ tool-use streaming ┌──────────────┐
│  Browser   │ ──────────────────► │  /api/extract (SSE)  │ ────────────────►  │ Anthropic    │
│  Next.js   │ ◄────────────────── │  Node runtime        │ ◄── input\\\_json ─── │ Sonnet 4.6   │
└─────┬──────┘ SSE: partial,       └──────────────────────┘  \\\_delta deltas     └──────────────┘
      │ complete, error
      │
      │ each partial → flash field, parse with partial-json
      │ complete → cost telemetry, dedup check, ready-to-submit
      ▼
  localStorage  + CSV/JSON export
```

1. Browser POSTs the image to `/api/extract` as multipart form data.
2. The route validates type/size, base64-encodes, and calls Anthropic with:

   * System prompt cached with `cache\\\_control: ephemeral`
   * Forced tool use (`tool\\\_choice: { type: "tool", name: "extract\\\_receipt" }`)
   * Strict input schema (`additionalProperties: false`, required fields)
3. The stream is parsed: each `input\\\_json\\\_delta` event is appended; `partial-json` parses the accumulated string and yields a `partial` SSE event to the client whenever it changes.
4. Client uses a hand-rolled SSE parser (since `EventSource` is GET-only) and pushes each partial into a single piece of React state; the form re-renders, flashes newly-confirmed fields.
5. On `complete`, Zod re-validates the final object; cost is computed from `usage.input\\\_tokens / output\\\_tokens / cache\\\_read\\\_input\\\_tokens / cache\\\_creation\\\_input\\\_tokens` using known May-2026 pricing.
6. Duplicate detection runs against history (image hash + tuple match).
7. User edits and submits; record persists to `localStorage` and is exportable as CSV (Xero-shaped) or JSON.

\---

## Prompt design

The system prompt is in `lib/prompt.ts` and is intentionally:

* **Long and stable** — so prompt caching pays off across runs in a 5-minute window. The cache block is the entire system prompt.
* **Authoritative on Malaysian rules** — SST replaced GST on 1 Sep 2018, service charge is separate from tax, IRBM UIN is 15 chars, MyInvois Phase 4 requires it for transactions > RM10,000 from 1 Jan 2026.
* **Tool-grounded** — instructs the model that output is delivered exclusively via the `extract\\\_receipt` tool call.
* **Honest about confidence** — explicitly asks for 0–1 confidence per critical field, with a calibration scale that values low-confidence-honesty over confident-wrong.

\---

## Evaluation

\### Headline numbers



| Metric | Result | Notes |

| --- | --- | --- |

| Field-level accuracy | \*\*97.5%\*\* (39/40) | merchant, date, total, currency, subtotal, sst\_amount, service\_charge |

| Full-record exact match | \*\*87.5%\*\* (7/8) | every field correct on a single receipt |

| Latency p50 / p95 | 9.6s / 12.6s | streaming UI hides this; first field arrives <2s |

| Cost per extraction | \~$0.014 | with prompt caching active on warm cache |



\*\*The one failure:\*\* a Starbucks Malaysia receipt labels its tax as "Service Tax (ST)" rather than "SST". The model captured the tax amount correctly (RM 1.47) but classified it ambiguously between `sst\\\_amount` and `service\\\_charge`. This is a real ambiguity in post-2018 Malaysian receipt vocabulary — "Service Tax" \*is\* the S in SST, but establishments often still print it on its own line. Roadmap: tighter system-prompt disambiguation + a regex pre-classifier on common Malaysian tax label variants.

Run:

```bash
npm run eval         # CLI runner
# or visit /eval in the running app
```

Both load `.jpg`/`.png`/`.webp` images from `eval/fixtures/`, match each to a `.json` golden label in `eval/golden/`, and report:

* Per-field accuracy on labelled fields (`merchant`, `date`, `total`, `currency`, `subtotal`, `service\\\_charge`, `sst\\\_amount`)
* Full-record exact-match rate
* Latency p50 / p95 / cost summary

See `eval/README.md` for how to populate the fixture set and recommended composition.

**Honesty note on my own numbers**: when you publish them, share the failure modes. A 78 % with documented errors beats an unbacked 99 %.

\---

## Project structure

```
.
├── app/
│   ├── api/
│   │   ├── extract/route.ts       # POST: SSE streaming extraction
│   │   └── eval/route.ts          # POST: runs eval against fixtures
│   ├── eval/page.tsx              # /eval — results dashboard
│   ├── history/page.tsx           # /history — saved records + export
│   ├── globals.css                # paper texture + confidence states
│   ├── layout.tsx                 # fonts + metadata
│   └── page.tsx                   # / — main extract UI
├── components/
│   ├── ConfidenceField.tsx        # input with confidence flag + flash
│   ├── CostFooter.tsx             # cost / latency telemetry
│   ├── DuplicateBanner.tsx        # dedup warning
│   ├── ExtractedForm.tsx          # the main form
│   ├── LineItemsTable.tsx         # line-item display
│   ├── Nav.tsx                    # top nav
│   └── Uploader.tsx               # drag-drop + scan animation
├── lib/
│   ├── extract.ts                 # Anthropic call: sync + streaming generator
│   ├── export.ts                  # CSV / JSON download helpers
│   ├── prompt.ts                  # cached system prompt
│   ├── schema.ts                  # Zod + JSON schemas, pricing, types
│   ├── storage.ts                 # localStorage + SHA-256 dedup
│   └── stream-client.ts           # browser SSE consumer
├── eval/
│   ├── README.md                  # how to populate
│   ├── fixtures/                  # drop receipt images here
│   └── golden/                    # matching .json labels
├── scripts/
│   └── run-eval.ts                # CLI eval runner (npm run eval)
└── (config files)
```

\---

## Run locally

```bash
git clone <this-repo>
cd receipt-extractor
npm install
cp .env.example .env.local
# paste your Anthropic API key into .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

```bash
npm i -g vercel
vercel
vercel env add ANTHROPIC\\\_API\\\_KEY
vercel --prod
```

Or import the repo in the Vercel dashboard and add `ANTHROPIC\\\_API\\\_KEY` in Settings → Environment Variables.

\---

## What I'd ship next

Real things, not buzzwords:

* **MyInvois LHDN API integration** to auto-validate captured IRBM UINs against the official registry.
* **Smart model routing** — start with Haiku 4.5; on low overall-confidence fall through to Sonnet 4.6; on continued failure to Opus 4.7. Saves \~70 % on the simple cases.
* **Fraud / AI-generated-receipt detection** — needs EXIF, pixel-level forensics, and a copy-move detector; out of scope for a 1-week build, but the pipeline is ready for it.
* **Streaming + tool-use cross-validation** — second-pass with a different model only on the lowest-confidence fields (to keep cost down).
* **Backend persistence** (Vercel Postgres) with org-scoped history and a real audit log — aligning with TP's ISO/IEC 42001 stance.

## Trade-offs

* **No auth.** Out of scope for the assessment. Adding it would be Next-Auth + Postgres in an afternoon.
* **No DB.** Brief allowed in-memory or local storage; I used `localStorage` to keep deployment zero-infra. A reviewer can verify everything works without provisioning anything.
* **One image at a time.** Multi-image batching would mean reworking the streaming UI; the schema already supports it.
* **Image cap at 8 MB.** Phone photos compress under that; large scans should be resized client-side.

\---

## License

MIT.

