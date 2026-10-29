// Run setup() as share@spmcdvo.net after setting SHEETS_SYNC_SECRET in Script Properties.
var OWNER_EMAIL = 'share@spmcdvo.net';
var SNAPSHOT_URL = 'https://dialysis-stock-tracker.vercel.app/api/integrations/sheets/snapshot';
var TABLE_NAMES = ['Items', 'Batches', 'StockTransactions', 'ConsumptionTemplates',
  'TreatmentSessions', 'SessionConsumables', 'PurchaseOrders', 'PurchaseOrderLines', 'Users', 'StockSummary', 'Alerts'];

function setup() {
  assertAccount_();
  var props = PropertiesService.getScriptProperties();
  if ((props.getProperty('SHEETS_SYNC_SECRET') || '').length < 32) {
    throw new Error('Set SHEETS_SYNC_SECRET in Script Properties first.');
  }
  if (!props.getProperty('SPREADSHEET_ID')) {
    var created = SpreadsheetApp.create('SPMC Dialysis Stock Tracker - Data and Alerts');
    created.setSpreadsheetTimeZone('Asia/Manila');
    props.setProperty('SPREADSHEET_ID', created.getId());
  }
  syncAndAlert();
  // Keep existing automation until the initial sync succeeds.
  var triggers = ScriptApp.getProjectTriggers().filter(function(t) {
    return t.getHandlerFunction() === 'syncAndAlert';
  });
  if (!triggers.length) ScriptApp.newTrigger('syncAndAlert').timeBased().everyHours(1).create();
  triggers.slice(1).forEach(function(t) { ScriptApp.deleteTrigger(t); });
  console.log('Sheet: https://docs.google.com/spreadsheets/d/' + props.getProperty('SPREADSHEET_ID') + '/edit');
}

function assertAccount_() {
  if (Session.getEffectiveUser().getEmail().toLowerCase() !== OWNER_EMAIL) {
    throw new Error('Run this script as ' + OWNER_EMAIL + '.');
  }
}

function syncAndAlert() {
  assertAccount_();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  var book;
  try {
    var props = PropertiesService.getScriptProperties();
    var secret = props.getProperty('SHEETS_SYNC_SECRET') || '';
    var id = props.getProperty('SPREADSHEET_ID');
    if (secret.length < 32 || !id) throw new Error('Run setup after setting Script Properties.');
    book = SpreadsheetApp.openById(id);
    var owner = DriveApp.getFileById(id).getOwner();
    if (!owner || owner.getEmail().toLowerCase() !== OWNER_EMAIL) throw new Error('The sheet must be owned by ' + OWNER_EMAIL + '.');
    var response = UrlFetchApp.fetch(SNAPSHOT_URL, {
      headers: { Authorization: 'Bearer ' + secret }, muteHttpExceptions: true, followRedirects: false
    });
    if (response.getResponseCode() !== 200) throw new Error('Snapshot request failed: HTTP ' + response.getResponseCode());
    var snapshot = JSON.parse(response.getContentText());
    validateSnapshot_(snapshot, new Date());
    var stateSheet = getSheet_(book, 'AlertState');
    var previous = readAlertState_(stateSheet);
    var due = dueAlerts_(snapshot.alerts, previous, snapshot.businessDate);
    var metadata = {};
    snapshot.tables.forEach(function(table) {
      var tab = getSheet_(book, table.name);
      metadata[table.name] = { id: tab.getSheetId(), rows: tab.getMaxRows(), columns: tab.getMaxColumns(),
        usedRows: tab.getLastRow(), usedColumns: tab.getLastColumn() };
    });
    var requests = snapshotRequests_(snapshot.tables, metadata);
    // One atomic batch replaces all mirrored tables, including removal of stale rows.
    Sheets.Spreadsheets.batchUpdate({ requests: requests }, id);
    SpreadsheetApp.flush();
    writeStatus_(book, 'SYNCED', snapshot.generatedAt, 'Alert evaluation pending');
    if (due.length) {
      if (MailApp.getRemainingDailyQuota() < 1) throw new Error('Email quota exhausted. Alerts remain pending.');
      MailApp.sendEmail({ to: OWNER_EMAIL, name: 'SPMC Dialysis Stock Tracker',
        subject: '[Dialysis Stock] ' + due.length + ' stock alert(s) - ' + snapshot.businessDate,
        body: alertBody_(due, snapshot, book.getUrl()) });
    }
    // Mark sent only after MailApp succeeds. Keep unresolved alerts for daily reminders.
    var stateRows = snapshot.alerts.map(function(alert) {
      var sentDay = due.some(function(a) { return a.key === alert.key; }) ? snapshot.businessDate : (previous[alert.key] || '');
      return [alert.key, sentDay];
    });
    replaceSmallTable_(stateSheet, [['key', 'lastSentBusinessDate']].concat(stateRows));
    writeStatus_(book, 'OK', snapshot.generatedAt, due.length + ' alert(s) emailed to ' + OWNER_EMAIL);
  } catch (error) {
    if (book) writeStatus_(book, 'ERROR', '', 'Sync or email failed. Check Apps Script Executions. Existing data may be from the last successful sync.');
    // Never log the snapshot, secret, patient names, or response body.
    console.error('Sync or email failed. No alerts are marked as sent for the failed operation.');
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function validateSnapshot_(snapshot, now) {
  if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.tables) || !Array.isArray(snapshot.alerts)) {
    throw new Error('Invalid snapshot.');
  }
  var age = now.getTime() - Date.parse(snapshot.generatedAt);
  if (!isFinite(age) || age < -60000 || age > 600000) throw new Error('Stale snapshot.');
  if (snapshot.businessDate !== Utilities.formatDate(new Date(snapshot.generatedAt), 'Asia/Manila', 'yyyy-MM-dd')) {
    throw new Error('Invalid business date.');
  }
  var names = snapshot.tables.map(function(t) { return t.name; }).sort();
  if (JSON.stringify(names) !== JSON.stringify(TABLE_NAMES.slice().sort())) throw new Error('Incomplete snapshot.');
  snapshot.tables.forEach(function(table) {
    if (!Array.isArray(table.headers) || !table.headers.length || !Array.isArray(table.rows) ||
        new Set(table.headers).size !== table.headers.length ||
        table.headers.some(function(h) { return typeof h !== 'string' || /password|secret|token|lockedUntil|failedLogins/i.test(h); })) {
      throw new Error('Invalid or unsafe table columns.');
    }
    table.rows.forEach(function(row) {
      if (!Array.isArray(row) || row.length !== table.headers.length || row.some(function(cell) {
        return cell !== null && !['string', 'number', 'boolean'].includes(typeof cell) ||
          typeof cell === 'number' && !isFinite(cell) || typeof cell === 'string' && cell.length > 50000;
      })) throw new Error('Invalid table row.');
    });
  });
  var keys = {};
  snapshot.alerts.forEach(function(alert) {
    if (!alert || typeof alert.key !== 'string' || keys[alert.key] ||
        !['low_stock', 'out_of_stock', 'expired'].includes(alert.type) ||
        typeof alert.item !== 'string' || typeof alert.details !== 'string') throw new Error('Invalid stock alert.');
    keys[alert.key] = true;
  });
}

function snapshotRequests_(tables, metadata) {
  var requests = [];
  tables.forEach(function(table) {
    var tab = metadata[table.name];
    var values = [table.headers].concat(table.rows);
    var rows = Math.max(values.length, tab.usedRows, 2);
    var columns = Math.max(table.headers.length, tab.usedColumns);
    if (rows > tab.rows || columns > tab.columns) requests.push({ updateSheetProperties: {
      properties: { sheetId: tab.id, gridProperties: { rowCount: Math.max(rows, tab.rows), columnCount: Math.max(columns, tab.columns) } },
      fields: 'gridProperties.rowCount,gridProperties.columnCount' } });
    requests.push({ updateCells: {
      range: { sheetId: tab.id, startRowIndex: 0, endRowIndex: rows, startColumnIndex: 0, endColumnIndex: columns },
      rows: values.map(function(row) { return { values: row.map(function(value) {
        if (value === null || value === undefined) return {};
        return { userEnteredValue: typeof value === 'number' ? { numberValue: value } :
          typeof value === 'boolean' ? { boolValue: value } : { stringValue: String(value) } };
      }) }; }), fields: 'userEnteredValue' } });
    requests.push({ updateSheetProperties: { properties: { sheetId: tab.id, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } });
  });
  return requests;
}

function dueAlerts_(alerts, previous, day) {
  return alerts.filter(function(alert) { return previous[alert.key] !== day; });
}

function alertBody_(alerts, snapshot, url) {
  var groups = { out_of_stock: 'OUT OF STOCK', low_stock: 'LOW STOCK', expired: 'EXPIRED BATCHES' };
  var lines = ['SPMC Dialysis Stock Tracker', 'Stock check: ' + snapshot.businessDate + ' (Asia/Manila)', ''];
  Object.keys(groups).forEach(function(type) {
    var matching = alerts.filter(function(alert) { return alert.type === type; });
    if (!matching.length) return;
    lines.push(groups[type]);
    matching.slice(0, 100).forEach(function(alert) { lines.push('- ' + alert.item + ': ' + alert.details); });
    if (matching.length > 100) lines.push('Plus ' + (matching.length - 100) + ' more. See the Alerts tab for the full list.');
    lines.push('');
  });
  lines.push('Usable stock excludes expired and quarantined batches.',
    'Review stock and arrange replenishment or disposal under local procedures.', '',
    'Spreadsheet: ' + url, 'Web app: https://dialysis-stock-tracker.vercel.app', '',
    'New alert conditions are emailed at the next hourly check. Unresolved conditions receive one reminder per calendar day.');
  return lines.join('\n');
}

function getSheet_(book, name) {
  return book.getSheetByName(name) || book.insertSheet(name);
}

function readAlertState_(sheet) {
  var state = {};
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach(function(row) {
    if (row[0]) state[String(row[0])] = String(row[1]);
  });
  return state;
}

function replaceSmallTable_(sheet, values) {
  var metadata = {};
  metadata[sheet.getName()] = { id: sheet.getSheetId(), rows: sheet.getMaxRows(), columns: sheet.getMaxColumns(),
    usedRows: sheet.getLastRow(), usedColumns: sheet.getLastColumn() };
  Sheets.Spreadsheets.batchUpdate({ requests: snapshotRequests_([{ name: sheet.getName(), headers: values[0], rows: values.slice(1) }], metadata) }, sheet.getParent().getId());
}

function writeStatus_(book, status, generatedAt, message) {
  replaceSmallTable_(getSheet_(book, 'SyncStatus'), [
    ['status', 'snapshotGeneratedAt', 'checkedAt', 'message'], [status, generatedAt, new Date().toISOString(), message]
  ]);
}
