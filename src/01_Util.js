/* Small helpers shared by every module. */

function isBlank(v) { return v === '' || v === null || v === undefined || (typeof v === 'string' && v.trim() === ''); }
function str(v) { return isBlank(v) ? '' : String(v).trim(); }
function lc(v) { return str(v).toLowerCase(); }
function num(v, dflt) { if (isBlank(v)) return dflt; const n = Number(v); return isNaN(n) ? dflt : n; }
function toBool(v) { return v === true || (typeof v === 'string' && v.trim().toUpperCase() === 'TRUE'); }

function uuid() {
  if (typeof Utilities !== 'undefined' && Utilities.getUuid) return Utilities.getUuid();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  });
}

/** Runs fn under the script lock. Locks are NOT reentrant: only entry points call this, never helpers. */
function withLock(fn, timeoutMs) {
  if (typeof LockService === 'undefined') return fn();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(timeoutMs || 30000)) throw new Error('LOCK_TIMEOUT');
  try { return fn(); } finally { lock.releaseLock(); }
}

/** Outgoing mail seam: GmailMailer in Apps Script, a mock in tests. */
let _mailer = null;
function mailer() { return _mailer || (_mailer = new GmailMailer()); }
function setMailer(m) { _mailer = m; }
class GmailMailer {
  quota() { return MailApp.getRemainingDailyQuota(); }
  send(m) { MailApp.sendEmail({ to: m.to.join(','), cc: m.cc.join(','), subject: m.subject, body: m.body, name: 'Allo Task Tracker' }); }
}

function logLine(s) { if (typeof Logger !== 'undefined') Logger.log(s); else console.log(s); }
