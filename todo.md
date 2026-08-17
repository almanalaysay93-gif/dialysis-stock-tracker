# Dialysis Stock Tracker — TODO

## Data layer
- [x] Schema: items (name, category enum exact 8 values, UoM, min/reorder levels)
- [x] Schema: batches (lot number, expiry date, qty received/remaining, FEFO)
- [x] Schema: stock transactions (in/out, reason enum exact 4 values, lot ref, user, timestamp)
- [x] Schema: consumption sessions (patient, chair, shift, date, session type HD/PD)
- [x] Schema: consumption template per session type + session line items
- [x] Run migrations on DB
- [x] Seed realistic sample data (items, batches, transactions, sessions)

## Features
- [x] Item catalog: add / edit / delete with exact categories
- [x] Batch/lot tracking with FEFO rotation on issue
- [x] Stock-in (goods receipt): supplier, qty, lot, expiry; auto on-hand update
- [x] Stock-out (manual issue): reason issued/adjusted/written off/returned; deducts stock, picks FEFO batch
- [x] Current stock dashboard: real-time on-hand, low-stock indicators, near-expiry & expired flags
- [x] Expiry alerts: 30/60/90-day thresholds, configurable; expired = quarantine flag
- [x] Daily consumption: log consumables per session (patient, chair, shift, date); template auto-populates by HD/PD
- [x] Stock transaction history audit log (timestamp, user, type, qty, lot)
- [x] Consumption reports: daily + weekly summaries, per session / per shift / per category

## UI / polish
- [x] Elegant premium design system (fonts, palette, spacing) in index.css
- [x] Dashboard layout with sidebar navigation
- [x] Dashboard overview page with KPI cards and charts
- [x] Loading states, empty states, form validation
- [x] Toasts + confirmation dialogs for destructive actions

## Quality
- [x] Vitest tests for transactions, FEFO deduction, expiry alerts
- [x] Type-check and full test pass
- [x] Visual verification via screenshots
- [x] Checkpoint + deliver

## Gap fixes (round 2)
- [x] Make Daily/Weekly/Custom tabs actually set the report query date range
- [x] Add per-category breakdown to consumption reports
- [x] Add confirmation dialog before item delete (and quarantine-related actions)
- [x] Add FEFO ordering vitest (earliest-expiring batch deducted first across multiple lots)
- [x] Checkpoint + deliver

## Bug fixes (production report)
- [x] Fix production dashboard errors: sessions page fired one sessions.get query per session (16 in one batch), overwhelming the DB under burst load; rows existed but queries failed intermittently
- [x] Harden session data fetching: new sessions.listWithLines endpoint fetches sessions + lines in 2 queries; Reports page uses batched getSessionConsumablesByIds (N+1 eliminated)
- [x] Verify on live DB, run tests, checkpoint

## Rebrand — SPMC Kidney & Transplant Institute identity
- [x] Upload SPMC_SKTI logo as static asset and reference in app (sidebar header, mobile header)
- [x] Update color scheme in index.css from logo palette (navy #2A3B8F, crimson #B01E2D, teal #2E9E9D, green gradient)
- [x] Add glassmorphism design system (glass cards, frosted sidebar/backdrop blur, translucent surfaces)
- [x] Larger icons (h-5→h-6/7) and larger text scale (base 15-16px, bigger headings) across all pages
- [x] Add gradient background to app; verify on all pages (dashboard, items, transactions, consumption, sessions, reports)
- [x] Type-check, tests pass, visual verification, checkpoint

## Delivery calendar & stock metrics (user request)
- [x] Purchase orders table (supplier, items, expected delivery date, status: ordered/delivered/cancelled, notes)
- [x] Migration applied + db helpers (create/list/update POs)
- [x] Stock metrics: days-of-supply per item (onHand / avg daily consumption over last 14 days), next delivery date, last delivery date
- [x] Calendar view page: month grid showing deliveries (POs), low-stock days, expiry events; prev/next month navigation
- [x] Purchase Orders page: create dialog, pending deliveries banner, receive-all flow that marks delivered + auto stock-in with auto lot numbers + updates line quantityReceived
- [x] Calendar page widgets: deliveries/expiries/low-stock counts + stock coverage table with at-risk flags (will run out before next delivery)
- [x] Server procedures: purchaseOrders router (list, create, update, delete), stockMetrics, calendar events
- [x] Tests for PO creation/delivery, days-of-supply calculation
- [x] Type-check, screenshots, checkpoint

## FIFO stock rotation (user request)
- [x] Review existing batch table (receivedAt / expiry) and design FIFO ordering (earliest received date first; tie-break by expiry)
- [x] Add `rotation.list` endpoint in routers.ts: batches grouped with items, sorted first-in-first-out, with freshness indicators
- [x] Build /rotation "Stock Rotation" page: FIFO tables per category + overall, showing oldest stock to use first, remaining shelf life, and flags for stale/aging stock
- [x] Register route + sidebar nav entry, type-check, vitest coverage for FIFO ordering
- [x] Screenshots, checkpoint + deliver
