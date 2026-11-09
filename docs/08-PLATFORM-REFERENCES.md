# 08 — Platform References & Verified Constraints

This reference sheet records the Google platform behaviours that influence the proposed design. These links should be rechecked immediately before deployment because Google may change quotas, trigger behaviour, and Workspace administration features.

## 1. Installable Apps Script triggers

Official documentation: https://developers.google.com/apps-script/guides/triggers/installable

Relevant design implications:

- Installable triggers can respond to spreadsheet edits and time-driven schedules.
- Installable triggers run under the account that created them. Therefore, the designated operations account should install and own production triggers.
- Time-driven executions are not hard real-time. Google notes that scheduled execution can be slightly randomized; the design therefore uses a polling dispatcher and deadline comparisons instead of assuming exact-second execution.
- Trigger handlers should be idempotent because repeated or delayed executions are normal operational possibilities.

## 2. Apps Script user identity

Official documentation: https://developers.google.com/apps-script/reference/base/session

Relevant design implications:

- `Session.getActiveUser().getEmail()` may return a blank string when security policy prevents access to the active user's identity.
- Identity availability depends on execution context and Workspace/domain relationships.
- Do not treat the trigger owner's identity as the identity of the employee who last edited the task row.
- Persist an identity provenance field (`EVENT_USER`, `AUTHENTICATED_UI`, `ASSIGNMENT_PROTECTION_FALLBACK`, or `UNVERIFIED`) alongside the actor email.

## 3. Apps Script quotas and runtime limits

Official documentation: https://developers.google.com/apps-script/guides/services/quotas

Relevant design implications:

- Apps Script services have per-user quotas and limitations that may cause execution failures if exceeded.
- The documentation currently lists a six-minute maximum execution time for ordinary scripts and a limit on the number of triggers per user per script. Email recipient limits vary by consumer vs Google Workspace account.
- Quotas can change. Check current values before go-live and monitor execution history and remaining email quota.
- Batch spreadsheet reads/writes and keep dispatcher executions short.

## 4. Filter views

Official documentation: https://developers.google.com/workspace/sheets/api/guides/filters

Relevant design implications:

- Filters and filter views control which rows are displayed; they do not change the underlying spreadsheet values.
- Named filter views are appropriate for employee-specific convenience views and manager views.
- Filter views are not a row-level security mechanism.

## 5. Protected ranges

Official documentation: https://support.google.com/docs/answer/1218656

Relevant design implications:

- Protected sheets and ranges can restrict who is allowed to edit selected cells or ranges.
- Protection does not hide the contents of those cells from workbook viewers/editors.
- Use protections for write control, and use separate files or an authenticated application if row-level confidentiality is required.

## 6. Properties Service

Official documentation: https://developers.google.com/apps-script/guides/properties

Relevant design implications:

- Script properties can hold application-wide configuration values shared by the script.
- User properties are scoped to the current user.
- Do not store large operational tables in Properties Service; use the spreadsheet for business records and properties only for small script-level configuration/flags.

