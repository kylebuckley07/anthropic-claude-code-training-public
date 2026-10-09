# SPEC · NWP-101 — Payments export: let ops choose columns and scope

> Written before any code. Generated with `/spec`, then edited by a human.
> Load it as context when you build: `@docs/specs/NWP-101-export-options.md`

**Ticket:** [NWP-101](../tickets/NWP-101.md)
**Author:** Kyle Buckley, with Claude Code
**Status:** reviewed

## Problem

Ops exports the payments table several times a day, but every file carries every column, including the card last four, and only the current filter. Dana's team spends 3 to 4 hours a month cleaning files by hand before they go to merchants, and last quarter an unedited file nearly went to the wrong merchant.

## Current state

- `build-battle/merchant-console/src/app/payments/page.tsx` — server page that shows 20 rows per page. Export is a plain `<a>` to `/api/payments/export?<current query>`. It builds its own `PaymentFilters` rather than calling `parseFilters`.
- `build-battle/merchant-console/src/app/api/payments/export/route.ts` — calls `parseFilters`, then `filterPayments` and `sortPayments` from `src/data/queries.ts` with no paging, so it already exports every matching row. Columns and scope are fixed.
- `build-battle/merchant-console/src/data/queries.ts` — the one query builder: `parseFilters` (allowlist), `filterPayments`, `sortPayments`, `paginate`, `queryPayments`.
- `build-battle/merchant-console/src/lib/csv.ts` — `EXPORT_COLUMNS` (10 columns), `toCsv(payments, columns = EXPORT_COLUMNS)` already takes a column list, `exportFilename(date)` gives `payments-YYYY-MM-DD.csv`.
- `build-battle/merchant-console/src/lib/money.ts` — `formatMoney(minorUnits, currency)`; `toCsv` already calls it once per amount cell, and `currency` is already its own column.
- `build-battle/merchant-console/src/components/Drawer.tsx` — slide-in panel built on Radix dialog, with title, body and footer parts. There is no Dialog or Checkbox component.
- Ticket vs code: the ticket says "do not interpolate them into SQL". There is no SQL here (the store is in memory), but the same rule applies to the column list and the filename.

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| "Money is integer minor units… Format once, at the edge, next to its currency code." | `merchant-console/CLAUDE.md` | Cents drift, or a reformatted string gets reparsed |
| "One query builder. Payment filtering goes through the builder behind `GET /api/payments`." | `merchant-console/CLAUDE.md` | Two filters disagree on which rows exist |
| "Anything from the client — column names, currencies, limits, statuses — is checked against an allowlist before it reaches a query, a filename, or the store." | `merchant-console/CLAUDE.md` | Arbitrary text in filenames or columns |
| "Column names arrive from the client, so validate them server-side." | Ticket notes | Same as above |
| "Building this in the browser exports the current page only." | Ticket notes | Export silently drops rows |
| "NWP-101 changes which columns ship, not how a cell is written" | `src/lib/csv.test.ts` header | Existing escaping tests break |

## Approach

Keep the export on the server. The route gains two parameters, `columns` (comma-separated) and `scope` (`filtered` or `all`). Both are checked against allowlists in `src/lib/csv.ts` before use; anything unknown or an empty column list returns 400 with a plain message. With no `columns`, the default set is every column except `last4`. `scope=all` passes empty params through `parseFilters`, so it still uses the one query builder. The filename label comes only from checked values: `all`, the status name, or `filtered`. On the page, Export opens the existing Drawer with a labelled checkbox per column, a scope choice showing each row count, and a Download link built from those choices. Counts come from the server page: the filtered `total` it already computes, and `queryPayments({}).total` for all payments.

**Considered and rejected:** building the CSV in the browser from the rows on screen. That exports one page of 20 rows, which is the bug the ticket warns about. Also rejected: a new centered Dialog component; the existing Drawer already handles focus and Escape.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/lib/csv.ts` | Change | `DEFAULT_EXPORT_COLUMNS`, `parseExportColumns`, scope label in `exportFilename` |
| `src/app/api/payments/export/route.ts` | Change | Read and check `columns` and `scope`, 400 on bad input |
| `src/app/payments/export-dialog.tsx` | Add | The options panel |
| `src/app/payments/page.tsx` | Change | Replace the Export link with the panel, pass counts |
| `src/lib/csv.test.ts` | Change | Tests for column selection and filename |

## Plan

1. **Helpers and route** — done when: `/api/payments/export?columns=id,amount&scope=all` returns two columns for every payment, and `columns=id,password` returns 400.
2. **Panel** — done when: Export opens the panel with last four unticked, both counts showing, and Download greyed out with nothing ticked.
3. **Tests** — done when: `npm test` passes with the new cases in `src/lib/csv.test.ts`.

## Verification

| Acceptance criterion | How it is proven |
| --- | --- |
| Choose columns, last four off by default | Unit tests on `parseExportColumns` and `DEFAULT_EXPORT_COLUMNS`; panel opens with last four unticked |
| Scope, current filter default, row count visible | Panel shows both counts; a disputed-only file has as many rows as the panel says |
| Filename reflects scope and date | Unit test on `exportFilename`; downloaded file named like `payments-disputed-2026-10-09.csv` |
| Amounts in minor units, formatted once, currency in its own column | Existing amount and escaping tests pass unchanged |
| No columns disables Download | Untick all: button disabled; the server also rejects an empty list (unit test) |

## Risks

- A hand-edited URL could ask for odd columns. Mitigated by the allowlist and the 400.
- Duplicate column names in the request would repeat a column. The parser drops repeats.

## Out of scope

- Amount sort compares as text (`sortPayments`); tracked separately.
- Date-range filters on the Payments page.
- Persistence (NWP-203).

## Open questions

- None blocking. Merchant and search filters show as `filtered` in the filename, by design, so free text never lands in a filename.
