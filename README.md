# Allo Innoware: Recurring Task Tracker

Google Sheets + Apps Script system that tracks recurring operational tasks (daily WhatsApp reports, 7/15/30-day portal tasks), records proof of completion, and alerts managers and leadership on a fixed SLA. The full specification is in [`docs/`](docs/README.md) (HLD, LLD, SLA rules, Apps Script design, test plan).

## How it works

- `Task_Master` defines tasks. `Task_Cycles` is the single ledger: one row per occurrence, keyed deterministically (`Task|DAILY|date`, `Task|INTERVAL|date|time`) so nothing is ever created twice.
- Employees fill proof and tick **Submit_Complete**; managers write an action note and tick **Manager_Acknowledged**. An installable edit trigger validates, records who did it and when, and creates the next cycle.
- A 5-minute dispatcher moves cycles SCHEDULED -> DUE -> OVERDUE and sends: first manager alert (due + 15 min), one reminder (+60 business min), leadership escalation if unacknowledged (+120 business min, capped 18:30), and a next-working-day 11:00 escalation for acknowledged-but-open work. Every send is deduplicated by `Cycle_ID|Stage` in `Alert_Log`.
- Recurrence modes: `DAILY_WORKDAY`, `AFTER_COMPLETION` (completion date + N days), `FIXED_CADENCE` (fixed grid, missed slots skipped).
- Safety: TEST/PRODUCTION switch, `SEND_EMAILS` gate, simulated clock, all test mail routed to one inbox.

## Layout

```
src/            Apps Script (V8) source, pushed with clasp
  00-07         constants, utils, time/calendar, store seam, config, audit, recurrence, cycles
  08-11         completion + acknowledgement, SLA rules, notifications, dispatcher
  13-16         seed data, health check, edit trigger + menu, workbook setup
  9x_Tests_*    self-tests (run in Node and from the sheet menu)
tests/run.js    Node runner (vm sandbox, strict non-reentrant lock mock)
docs/           specification pack
```

All business logic talks to an in-memory store in tests and to the real sheets through the same `tbl(name)` interface in production.

## Test

```bash
npm test
```

34 tests: the 8 assignment scenarios (daily completion, 7/15/30-day cadences, WhatsApp attestation, manager acknowledgement, both escalation paths, timing boundaries incl. Friday -> Monday, idempotency) plus failure cases (duplicate triggers, bad proof, wrong person, mail quota, interrupted send, timezone mismatch, missing next cycle). CI runs the same command.

## Deploy

Needs Node 18+, a Google account, and the Apps Script API enabled at <https://script.google.com/home/usersettings>.

```bash
npm i -g @google/clasp
clasp login
clasp create --type sheets --title "Allo Innoware Task Tracker" --rootDir src
clasp push
```

Then open the new spreadsheet and use the **Tasks** menu in this order:

1. **Set up workbook (first run)**: creates tabs, validation, dashboard, protections, filter views, and seeds example data (`example.com` team, five tasks).
2. Replace seed addresses in `Team` and `Task_Master`; set `TEST_RECIPIENT_EMAIL` and `SEND_EMAILS=TRUE` in `Settings`.
3. **Create Initial Cycles**, then **Run Health Check** (must be clean).
4. **Install/Repair Triggers**, signed in as the operations-owned account (the owner of the triggers sends the mail).
5. Demo: **Set Test Clock** to walk through due -> overdue -> reminder -> escalation without waiting.
6. Go live: `ENVIRONMENT=PRODUCTION`, clear `TEST_NOW_OVERRIDE`, review warnings, re-run the health check.

## Deviations from the spec

- The dispatcher also runs the idempotent initial-cycle creation, so a newly added interval task just works.
- Leadership recipients are derived from active `LEADERSHIP` members in `Team`; there is no separate `LEADERSHIP_EMAILS` setting.
- Extra settings: `WHATSAPP_EVIDENCE_URL_REQUIRED`, `ROW_PROTECTION_ACTIVE`.
- OVERDUE starts at due + grace (`>=`). Reminder and ack timing use the current `Task_Master` parameters.
- Filter view titles use an ASCII hyphen. The dashboard uses the real `TODAY()`, not the simulated clock.
- Manager acknowledgement **fails closed** when the actor cannot be identified (an unverified ack would suppress escalation). Employee completion with an unreadable identity is accepted and recorded as `UNVERIFIED` with a blank email, as the spec allows.
- Unacknowledged and unresolved escalations are independent and can both fire for one cycle.

## Known limits and what was not verified

- **Not run against live Google services.** The engine and all rules are tested in Node. `SheetStore`, the edit trigger on a real sheet, workbook setup, dashboard formulas, range protections and filter views need a first-run check in a real spreadsheet (use the **Run Demo Test Suite** menu item and the demo clock).
- On consumer Gmail accounts `e.user` is often blank, so completions record `UNVERIFIED` and manager acknowledgements are refused. Use Google Workspace accounts, or set `ROW_PROTECTION_ACTIVE=TRUE` only after confirming per-row protections work, which enables the assignment-based fallback identity.
- Employees can edit proof after completion (audit trail records the completion, not later edits).
- Apps Script email quota (100/day consumer, 1,500 Workspace) bounds alert volume; quota failures are logged and retried.
