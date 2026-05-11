# Eval set

A small evaluation harness for measuring extraction accuracy. Used both by `npm run eval` (CLI) and by the `/eval` page in the deployed app.

## How it works

1. Drop receipt images into `eval/fixtures/` (`.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`).
2. For each image, create a matching `.json` file in `eval/golden/` with the **same base name** containing the ground-truth labels for whatever fields you care to check.
3. Run `npm run eval` from the repo root, or open `/eval` in the running app and hit "Run eval".

Example:
```
eval/
├── fixtures/
│   ├── zus-coffee-kl.jpg
│   ├── speedmart-bm.png
│   └── starbucks-us.jpg
└── golden/
    ├── zus-coffee-kl.json
    ├── speedmart-bm.json
    └── starbucks-us.json
```

`zus-coffee-kl.json`:
```json
{
  "merchant": "ZUS Coffee",
  "date": "2026-04-02",
  "total": "17.40",
  "currency": "MYR",
  "subtotal": "16.42",
  "sst_amount": "0.98"
}
```

You can label as few or as many fields as you want — the runner only checks the fields present in the golden file.

## Recommended composition (target: 25–50 receipts)

| Bucket | Count | Notes |
| --- | --- | --- |
| English Malaysian | 5 | ZUS, Starbucks KL, AEON, Petronas, Watson's |
| Bahasa Malaysia | 5 | Speedmart 99, Mydin, KK Super Mart |
| Chinese-character F&B | 5 | KL kopitiam, dim sum, Penang hawker |
| Thermal-paper / Grab / FamilyMart | 5 | Crinkled, low-contrast |
| International | 5 | US/EU receipts to confirm we generalise |
| Adversarial | 5 | Crumpled, rotated, blurry, partial |
| With explicit SST line | 5 | Hotels, restaurants, retail |
| With MyInvois QR/IRBM UIN | 5 | If you can find them |

## Matching rules

| Field | Comparison |
| --- | --- |
| `merchant`, `currency` | Case-insensitive trim |
| `date` | Strict equality on `YYYY-MM-DD` |
| `total`, `subtotal`, `service_charge`, `sst_amount` | Numeric equality (12.30 == 12.3) |

Other fields aren't checked by the eval — they're stretch outputs.

## Honesty note

When you publish your numbers, share the failure modes too. Reviewers from a serious automation team will trust a "78% with documented errors" number much more than an unbacked "99%".
