/* Storage seam. Business logic only talks to tbl(name): rows() / append(obj) / update(rowNo, patch).
 * SheetStore backs it with Google Sheets, MemStore with arrays (used by the self-tests, in Node and in Apps Script).
 * Blank cell == '' in both. Rows come back as objects keyed by header name, plus __row (1-based sheet row). */

class MemStore {
  constructor() {
    this.data = {}; Object.keys(HEADERS).forEach(n => { this.data[n] = []; });
    this.spreadsheetTz = 'Asia/Kolkata'; this.scriptTz = 'Asia/Kolkata';
  }
  table(name) {
    const self = this, headers = HEADERS[name];
    return {
      headers,
      rows() { return self.data[name].map((r, i) => Object.assign({}, r, { __row: i + 2 })); },
      append(obj) {
        const rec = {}; headers.forEach(h => { rec[h] = obj[h] === undefined ? '' : obj[h]; });
        self.data[name].push(rec); return Object.assign({}, rec, { __row: self.data[name].length + 1 });
      },
      update(row, patch) {
        const rec = self.data[name][row - 2];
        Object.keys(patch).forEach(k => { if (headers.indexOf(k) < 0) throw new Error('Unknown column ' + k); rec[k] = patch[k]; });
      },
    };
  }
  clear(name) { this.data[name] = []; }
  timezones() { return { spreadsheet: this.spreadsheetTz, script: this.scriptTz }; }
  url() { return 'https://docs.google.com/spreadsheets/d/TEST'; }
  rowLink(name, row) { return this.url() + '#' + name + '!A' + row; }
  checkHeaders() { return []; }
}

class SheetStore {
  constructor(ss) { this._ss = ss || null; }
  get ss() { return this._ss || (this._ss = SpreadsheetApp.getActive()); }
  sheet(name) { const s = this.ss.getSheetByName(name); if (!s) throw new Error('Missing sheet: ' + name); return s; }

  // Last row with data in column A. getLastRow() is unusable: checkbox/validation cells count as content.
  lastRow(sh) {
    const col = sh.getRange(1, 1, sh.getMaxRows(), 1).getValues();
    for (let i = col.length - 1; i >= 1; i--) if (!isBlank(col[i][0])) return i + 1;
    return 1;
  }

  table(name) {
    const self = this, headers = HEADERS[name];
    return {
      headers,
      // ponytail: reads the whole tab per call; fine for a few hundred cycles, add a per-execution cache if it grows
      rows() {
        const sh = self.sheet(name), last = self.lastRow(sh); if (last < 2) return [];
        const out = [];
        sh.getRange(2, 1, last - 1, headers.length).getValues().forEach((v, i) => {
          if (isBlank(v[0])) return;
          const o = { __row: i + 2 }; headers.forEach((h, j) => { o[h] = v[j]; }); out.push(o);
        });
        return out;
      },
      append(obj) {
        const sh = self.sheet(name), r = self.lastRow(sh) + 1;
        sh.getRange(r, 1, 1, headers.length).setValues([headers.map(h => (obj[h] === undefined ? '' : obj[h]))]);
        const saved = Object.assign({}, obj, { __row: r });
        if (name === SHEETS.TASK_CYCLES) self.afterCycleAppend(sh, r, obj);
        return saved;
      },
      // Patched cells only: a whole-row write would clobber an employee typing in another column.
      update(row, patch) {
        const sh = self.sheet(name);
        Object.keys(patch).forEach(k => {
          const c = headers.indexOf(k); if (c < 0) throw new Error('Unknown column ' + k);
          sh.getRange(row, c + 1).setValue(patch[k]);
        });
      },
    };
  }

  afterCycleAppend(sh, r, obj) {
    const col = n => HEADERS[SHEETS.TASK_CYCLES].indexOf(n) + 1;
    sh.getRange(r, col('Submit_Complete')).insertCheckboxes();
    sh.getRange(r, col('Manager_Acknowledged')).insertCheckboxes();
    if (!cfgBool('ROW_PROTECTION_ACTIVE')) return;
    const admins = [cfg('AUTOMATION_OWNER_EMAIL')].concat(teamMembers().filter(m => m.Role === 'ADMIN' && toBool(m.Is_Active)).map(m => str(m.Member_Email)));
    [[sh.getRange(r, col('Employee_Proof'), 1, 4), obj.Assigned_To_Email, 'employee input'],
     [sh.getRange(r, col('Manager_Acknowledged'), 1, 5), obj.Manager_Email, 'manager action']].forEach(([range, who, label]) => {
      try {
        const p = range.protect().setDescription(label + ' ' + obj.Cycle_ID);
        p.removeEditors(p.getEditors()); p.setDomainEdit(false);
        admins.concat([str(who)]).filter(e => e).forEach(e => { try { p.addEditor(e); } catch (x) { /* non-Google address */ } });
      } catch (e) { logError('afterCycleAppend', e, obj.Cycle_ID, 'WARN'); }
    });
  }

  clear(name) {
    const sh = this.sheet(name), n = sh.getMaxRows() - 1;
    if (n > 0) { const r = sh.getRange(2, 1, n, HEADERS[name].length); r.clearContent(); r.clearDataValidations(); }
  }
  timezones() { return { spreadsheet: this.ss.getSpreadsheetTimeZone(), script: Session.getScriptTimeZone() }; }
  url() { return this.ss.getUrl(); }
  rowLink(name, row) { return this.ss.getUrl() + '#gid=' + this.sheet(name).getSheetId() + '&range=A' + row; }

  /** Problems with missing tabs / headers that differ from the LLD. */
  checkHeaders() {
    const problems = [];
    Object.keys(HEADERS).forEach(name => {
      const sh = this.ss.getSheetByName(name);
      if (!sh) { problems.push('Missing tab: ' + name); return; }
      const have = sh.getRange(1, 1, 1, HEADERS[name].length).getValues()[0].map(str);
      HEADERS[name].forEach((h, i) => { if (have[i] !== h) problems.push(name + ' column ' + (i + 1) + ' should be "' + h + '" but is "' + have[i] + '"'); });
    });
    if (!this.ss.getSheetByName(SHEETS.DASHBOARD)) problems.push('Missing tab: ' + SHEETS.DASHBOARD);
    return problems;
  }
}

let _store = null;
function db() { return _store || (_store = new SheetStore()); }
function setStore(s) { _store = s; }
function tbl(name) { return db().table(name); }
