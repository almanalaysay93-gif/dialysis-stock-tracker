# SHARE Google Sheets mirror and stock alerts

The Apps Script creates a private spreadsheet owned by `share@spmcdvo.net`.
Supabase remains the primary database.
The spreadsheet is a one-way mirror, so spreadsheet edits do not change the web app.
The script refreshes the mirror hourly and emails stock alerts to `share@spmcdvo.net`.

## Install under the SHARE account

1. Sign in to Google as `share@spmcdvo.net`.
2. Open <https://script.google.com/home/start> and create a new project.
3. Replace `Code.gs` with the contents of this folder's `Code.gs`.
4. Open Project Settings and enable **Show appsscript.json manifest file in editor**.
5. Replace `appsscript.json` with this folder's manifest.
6. In Project Settings, add the script property `SHEETS_SYNC_SECRET`.
7. Copy its value from the local `apps-script/.env.local` file, if supplied, or from your server configuration.
8. Use the same secret in Vercel's production environment variable `SHEETS_SYNC_SECRET`.
9. Run `setup` and approve the requested Google permissions using the SHARE account.
10. Open the spreadsheet URL shown in the execution log.

Do not deploy this script as a public web app.
The hourly trigger pulls data from the private server endpoint.
Google requires the trigger creator to authorize the script.
See [installable trigger authorization](https://developers.google.com/apps-script/guides/triggers/installable).

If a spreadsheet already exists, set `SPREADSHEET_ID` in Script Properties before running `setup`.
The script refuses a spreadsheet owned by another account.
Use a dedicated spreadsheet because each sync replaces the managed tabs.
Do not share this spreadsheet publicly because treatment sessions contain patient names.

## Mirrored data

The mirror includes Items, Batches, StockTransactions, ConsumptionTemplates, TreatmentSessions, SessionConsumables, PurchaseOrders, PurchaseOrderLines, and Users.
Users excludes password hashes, lockout fields, credentials, and session tokens.
StockSummary shows total stock, usable stock, reorder levels, and stock status.
Alerts lists every current stock condition.
SyncStatus records the last result and snapshot time.
AlertState stores reminder dates.

All source tables come from one consistent, read-only database transaction.
The script validates the complete snapshot before replacing mirrored data.
One Sheets API batch replaces all mirrored tables atomically and clears stale rows.
Text values remain text, including values that begin with `=`.

## Alert rules

- Low stock means usable stock is greater than zero and at or below the item's reorder level.
- Out of stock means usable stock is zero or less.
- Usable stock excludes quarantined batches and batches with an expiry date before the current Manila date.
- Expired alerts include every expired batch with remaining stock, including quarantined batches.
- Inactive items do not generate shortage alerts.
- New conditions generate an email at the next hourly check.
- Unresolved conditions generate one reminder per Manila calendar day.
- Resolved conditions leave AlertState, so a later recurrence generates a new alert.

Emails contain inventory information and no patient names.
Large emails summarize the first 100 alerts of each type and link to the complete Alerts tab.
The script sends no stock email if the snapshot request or validation fails.
Google email quotas can delay alerts.
MailApp reports submission, which does not prove inbox delivery.
An interruption after email submission but before AlertState saves can cause a duplicate on the next run.

## Verify activation

1. Confirm the spreadsheet owner is `share@spmcdvo.net`.
2. Confirm all mirrored tabs exist and their row counts match the source snapshot.
3. Confirm SyncStatus shows `OK` with a recent snapshot time.
4. Confirm one hourly `syncAndAlert` trigger exists in Apps Script.
5. Confirm a real low-stock, out-of-stock, or expired condition appears in Alerts.
6. Confirm the corresponding message arrives at `share@spmcdvo.net`.
7. Run `syncAndAlert` again and confirm the same conditions do not send another email that day.

Do not create fake production stock or alter patient records to test alerts.
Automated local tests cover threshold boundaries, expiry dates, authorization, duplicate prevention, and failed requests.
