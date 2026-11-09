/* Business calendar. Local dates are 'YYYY-MM-DD' strings ("ymd"); instants are Date objects.
 * All arithmetic goes through these helpers so the simulated clock and the timezone are honoured everywhere. */

function tz() { return cfg('TIMEZONE', 'Asia/Kolkata'); }

/** Wall-clock parts of an instant in the business timezone. */
function localParts(date) {
  let s;
  if (typeof Utilities !== 'undefined' && Utilities.formatDate) s = Utilities.formatDate(date, tz(), 'yyyy-MM-dd HH:mm');
  else {
    const p = {};
    new Intl.DateTimeFormat('en-CA', { timeZone: tz(), hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(date).forEach(x => { p[x.type] = x.value; });
    s = p.year + '-' + p.month + '-' + p.day + ' ' + p.hour + ':' + p.minute;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(s);
  return { ymd: m[1] + '-' + m[2] + '-' + m[3], y: +m[1], m: +m[2], d: +m[3], hh: +m[4], mi: +m[5], mins: +m[4] * 60 + +m[5] };
}

function ymdParts(ymd) { const a = ymd.split('-').map(Number); return { y: a[0], m: a[1], d: a[2] }; }
function ymdAdd(ymd, n) { const p = ymdParts(ymd); return new Date(Date.UTC(p.y, p.m - 1, p.d + n)).toISOString().slice(0, 10); }
function ymdDow(ymd) { const p = ymdParts(ymd); return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); } // 0 = Sunday
function ymdDiff(a, b) { const x = ymdParts(a), y = ymdParts(b); return Math.round((Date.UTC(y.y, y.m - 1, y.d) - Date.UTC(x.y, x.m - 1, x.d)) / 864e5); }

/** 'H:mm' text (or a Sheets time Date / day-fraction) -> minutes after midnight, NaN if unusable. */
function parseHHmm(v) {
  if (v instanceof Date) return v.getHours() * 60 + v.getMinutes(); // Sheets time cell; keep time columns plain text to avoid surprises
  if (typeof v === 'number') return Math.round(v * 1440);
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(v)); if (!m || +m[1] > 24 || +m[2] > 59) return NaN;
  return +m[1] * 60 + +m[2];
}

/** The instant at local ymd + HH:mm (string or minutes). Works for any IANA zone, DST included. */
function fromLocal(ymd, hhmm) {
  const mins = typeof hhmm === 'number' ? hhmm : parseHHmm(hhmm);
  if (isNaN(mins)) throw new Error('Bad time value: ' + hhmm);
  const p = ymdParts(ymd), want = Date.UTC(p.y, p.m - 1, p.d, Math.floor(mins / 60), mins % 60);
  let guess = want;
  for (let i = 0; i < 3; i++) {
    const l = localParts(new Date(guess)), got = Date.UTC(l.y, l.m - 1, l.d, l.hh, l.mi);
    if (got === want) break; guess += want - got;
  }
  return new Date(guess);
}

/** Accepts a Date, 'YYYY-MM-DD HH:mm' (business timezone) or anything Date can parse. null for blank. */
function toDate(v) {
  if (v instanceof Date) return v;
  if (isBlank(v)) return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?$/.exec(String(v).trim());
  const d = m ? fromLocal(m[1], m[2]) : new Date(String(v));
  if (isNaN(d.getTime())) throw new Error('Bad date value: ' + v);
  return d;
}

function fmtLocal(date) { if (!date) return ''; const l = localParts(date); return l.ymd + ' ' + String(l.hh).padStart(2, '0') + ':' + String(l.mi).padStart(2, '0') + ' (' + tz() + ')'; }
function fmtDuration(ms) {
  const m = Math.max(0, Math.floor(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60);
  return (d ? d + 'd ' : '') + (h || d ? h + 'h ' : '') + (m % 60) + 'm';
}

/** The one clock. TEST + TEST_NOW_OVERRIDE gives a simulated "now"; never call new Date() elsewhere. */
function getEffectiveNow() {
  if (cfg('ENVIRONMENT') === 'TEST' && !isBlank(cfgRaw('TEST_NOW_OVERRIDE'))) return toDate(cfgRaw('TEST_NOW_OVERRIDE'));
  return new Date();
}

function holidays() {
  if (!_holidays) {
    _holidays = {};
    tbl(SHEETS.HOLIDAYS).rows().forEach(r => {
      const d = toDate(r.Date); if (d) _holidays[localParts(d).ymd] = toBool(r.Is_Non_Working);
    });
  }
  return _holidays;
}

/** Holiday_Calendar row wins (TRUE = closed, FALSE = working override); otherwise Monday to Friday. */
function isWorkingDay(ymd) {
  const h = holidays()[ymd]; if (h !== undefined) return !h;
  const dow = ymdDow(ymd); return dow >= 1 && dow <= 5;
}
function nextWorkingDate(ymd) { // strictly after ymd
  for (let i = 1; i <= 366; i++) { const d = ymdAdd(ymd, i); if (isWorkingDay(d)) return d; }
  throw new Error('No working day within a year of ' + ymd + '; check Holiday_Calendar');
}
function rollForward(ymd) { return isWorkingDay(ymd) ? ymd : nextWorkingDate(ymd); } // ymd itself if working

/** Consumes business minutes (WORKDAY_START..WORKDAY_END on working days) starting at an instant. */
function addBusinessMinutes(start, minutes) {
  const ws = parseHHmm(cfg('WORKDAY_START', '09:30')), we = parseHHmm(cfg('WORKDAY_END', '18:30'));
  let cur = start, left = minutes;
  for (let i = 0; i < 400; i++) {
    const ymd = localParts(cur).ymd;
    if (!isWorkingDay(ymd)) { cur = fromLocal(nextWorkingDate(ymd), ws); continue; }
    const open = fromLocal(ymd, ws), close = fromLocal(ymd, we);
    if (cur < open) cur = open;
    if (cur >= close) { cur = fromLocal(nextWorkingDate(ymd), ws); continue; }
    const avail = (close - cur) / 60000;
    if (left <= avail) return new Date(cur.getTime() + left * 60000);
    left -= avail; cur = fromLocal(nextWorkingDate(ymd), ws);
  }
  throw new Error('addBusinessMinutes did not converge; check WORKDAY_START/END and Holiday_Calendar');
}
