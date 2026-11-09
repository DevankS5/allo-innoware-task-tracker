/* Allo Innoware recurring task tracker. Schemas and enums: single source of truth (docs/02-LLD.md).
 * Rows are addressed by header NAME everywhere; never by column number. */

const SHEETS = {
  DASHBOARD: 'Dashboard', TASK_MASTER: 'Task_Master', TEAM: 'Team', TASK_CYCLES: 'Task_Cycles',
  ALERT_LOG: 'Alert_Log', AUDIT_LOG: 'Audit_Log', HOLIDAYS: 'Holiday_Calendar',
  SETTINGS: 'Settings', ERROR_LOG: 'Error_Log',
};

const HEADERS = {
  [SHEETS.TASK_MASTER]: [
    'Task_ID', 'Is_Active', 'Task_Name', 'Task_Description', 'Assigned_To_Email', 'Manager_Email',
    'Frequency_Type', 'Interval_Days', 'Recurrence_Mode', 'Initial_Due_At', 'Due_Time',
    'Working_Days_Only', 'Non_Working_Day_Policy', 'Priority', 'Required_Proof_Type', 'Proof_Required',
    'Completion_Instructions', 'First_Manager_Alert_Minutes', 'Manager_Ack_SLA_Business_Minutes',
    'Manager_Reminder_Offset_Minutes', 'Escalate_If_Manager_Unacknowledged', 'Escalate_If_Task_Unresolved',
    'Task_Owner_Email', 'Created_At', 'Updated_At', 'Task_Version'],
  [SHEETS.TEAM]: [
    'Member_Email', 'Display_Name', 'Role', 'Manager_Email', 'Is_Active', 'Can_Edit_Task_Master',
    'Can_Acknowledge', 'Notes'],
  [SHEETS.TASK_CYCLES]: [
    'Cycle_ID', 'Cycle_Key', 'Task_ID', 'Cycle_No', 'Task_Name_Snapshot', 'Assigned_To_Email',
    'Assigned_To_Name', 'Manager_Email', 'Due_At', 'Status', 'Priority', 'Required_Proof_Type',
    'Employee_Proof', 'Evidence_URL', 'Employee_Notes', 'Submit_Complete', 'Completed_At',
    'Completed_By_Email', 'Completed_By_Source', 'Recurrence_Mode_Snapshot', 'Manager_Acknowledged',
    'Manager_Ack_At', 'Manager_Ack_By_Email', 'Manager_Ack_Source', 'Manager_Notes',
    'Manager_Ack_Deadline_At', 'Manager_Reminder_Sent_At', 'Leadership_Escalated_At', 'Last_Alert_Stage',
    'Created_At', 'Updated_At', 'Task_Version_Snapshot', 'System_Error', 'Resolved_After_Escalation_At'],
  [SHEETS.ALERT_LOG]: [
    'Alert_ID', 'Dedupe_Key', 'Cycle_ID', 'Task_ID', 'Alert_Stage', 'Recipient_List', 'Subject', 'Status',
    'Created_At', 'Attempted_At', 'Sent_At', 'Retry_Count', 'Unique_Email_Token', 'Error_Message',
    'Digest_Batch_ID'],
  [SHEETS.AUDIT_LOG]: [
    'Event_ID', 'Event_At', 'Event_Type', 'Cycle_ID', 'Task_ID', 'Actor_Email', 'Actor_Source',
    'Old_Status', 'New_Status', 'Event_Details_JSON', 'Execution_ID'],
  [SHEETS.HOLIDAYS]: ['Date', 'Holiday_Name', 'Is_Non_Working', 'Notes'],
  [SHEETS.SETTINGS]: ['Key', 'Value', 'Notes'],
  [SHEETS.ERROR_LOG]: [
    'Error_ID', 'Occurred_At', 'Function_Name', 'Cycle_ID', 'Severity', 'Error_Message', 'Stack_Summary',
    'Execution_ID', 'Resolved', 'Resolution_Notes'],
};

const CYCLES = SHEETS.TASK_CYCLES; // shorthand used throughout

const ENUMS = {
  Frequency_Type: ['DAILY', 'INTERVAL'],
  Recurrence_Mode: ['DAILY_WORKDAY', 'AFTER_COMPLETION', 'FIXED_CADENCE'],
  Non_Working_Day_Policy: ['NEXT_WORKING_DAY', 'KEEP_DATE'],
  Priority: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'],
  Required_Proof_Type: ['TICKET_ID', 'WHATSAPP_ATTESTATION', 'URL_OR_NOTE', 'NONE'],
  Role: ['EMPLOYEE', 'MANAGER', 'LEADERSHIP', 'ADMIN'],
};

const STATUS = { SCHEDULED: 'SCHEDULED', DUE: 'DUE', OVERDUE: 'OVERDUE', COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED' };
const OPEN_STATUSES = [STATUS.SCHEDULED, STATUS.DUE, STATUS.OVERDUE];

const STAGE = {
  FIRST: 'MANAGER_FIRST_ALERT', REMINDER: 'MANAGER_REMINDER',
  UNACK: 'LEADERSHIP_UNACK_ESCALATION', UNRESOLVED: 'LEADERSHIP_UNRESOLVED_ESCALATION',
};

const SOURCE = {
  EVENT_USER: 'EVENT_USER', AUTHENTICATED_UI: 'AUTHENTICATED_UI',
  FALLBACK: 'ASSIGNMENT_PROTECTION_FALLBACK', UNVERIFIED: 'UNVERIFIED',
};

const MAX_ALERT_RETRIES = 3;        // FAILED sends are retried this many times, then left for an admin
const AMBIGUOUS_AFTER_MIN = 10;     // a SENDING alert older than this is an interrupted send -> AMBIGUOUS

// [Key, default Value, Notes]. Values stay TEXT in the sheet (column formatted as plain text).
const SETTINGS_DEFAULTS = [
  ['TIMEZONE', 'Asia/Kolkata', 'Business timezone; must equal spreadsheet and script timezone'],
  ['WORKDAY_START', '09:30', 'SLA business window start (HH:mm)'],
  ['WORKDAY_END', '18:30', 'SLA business window end (HH:mm)'],
  ['DEFAULT_DUE_TIME', '17:00', 'Used when a task has no Due_Time'],
  ['DEFAULT_FIRST_ALERT_MINUTES', '15', 'Grace after due time before the first manager alert'],
  ['DEFAULT_MANAGER_ACK_BUSINESS_MINUTES', '120', 'Manager acknowledgement SLA (business minutes)'],
  ['DEFAULT_MANAGER_REMINDER_BUSINESS_MINUTES', '60', 'One reminder after this many business minutes'],
  ['UNRESOLVED_ESCALATION_TIME', '11:00', 'Next working day; escalates acknowledged-but-open work'],
  ['DISPATCH_INTERVAL_MINUTES', '5', 'Dispatcher frequency: 1, 5, 10, 15 or 30'],
  ['ENVIRONMENT', 'TEST', 'TEST or PRODUCTION'],
  ['TEST_NOW_OVERRIDE', '', 'TEST only. Simulated clock, e.g. 2026-11-10 17:16 (business timezone)'],
  ['TEST_RECIPIENT_EMAIL', '', 'TEST only. All outgoing mail is routed here'],
  ['SEND_EMAILS', 'FALSE', 'Must be TRUE for any email to leave. Production needs an explicit change'],
  ['AUTOMATION_OWNER_EMAIL', '', 'Operations-owned account that owns the triggers'],
  ['WHATSAPP_EVIDENCE_URL_REQUIRED', 'FALSE', 'TRUE = WhatsApp attestation also needs Evidence_URL'],
  ['ROW_PROTECTION_ACTIVE', 'FALSE', 'TRUE = protect each new cycle row per employee/manager AND allow assignment fallback identity. Set only after verifying protections work'],
  ['LAST_HEALTH_CHECK_AT', '', 'System: last successful dispatcher pass'],
  ['TRIGGERS_INSTALLED_BY', '', 'System: account that installed triggers'],
  ['TRIGGERS_INSTALLED_AT', '', 'System: install timestamp'],
];
