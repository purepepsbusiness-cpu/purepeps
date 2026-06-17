// apps-script-lockout-additions.gs
//
// Reference snippet for adding brute-force lockout tracking to your
// existing Google Apps Script Web App (the one SHEET_API_URL points at).
//
// One-time setup: add a new sheet tab named "LoginAttempts" with columns:
//   Email | Success | Timestamp | IP
//
// Add to your existing doPost(e):
//
//   const data = JSON.parse(e.postData.contents);
//   if (data.type === 'record_login_attempt') {
//     const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('LoginAttempts');
//     sheet.appendRow([data.email, data.success, data.timestamp, data.ip || 'unknown']);
//     return ContentService.createTextOutput(JSON.stringify({ success: true }))
//       .setMimeType(ContentService.MimeType.JSON);
//   }
//
// Add to your existing doGet(e):
//
//   if (e.parameter.type === 'login_attempts') {
//     const email = e.parameter.email;
//     const since = new Date(e.parameter.since);
//     const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('LoginAttempts');
//     const rows = sheet.getDataRange().getValues();
//     const attempts = [];
//     for (let i = 1; i < rows.length; i++) {
//       const row = rows[i];
//       const rowTimestamp = new Date(row[2]);
//       if (row[0] === email && rowTimestamp >= since) {
//         attempts.push({ success: row[1] === true || row[1] === 'TRUE', timestamp: row[2], ip: row[3] });
//       }
//     }
//     return ContentService.createTextOutput(JSON.stringify({ attempts }))
//       .setMimeType(ContentService.MimeType.JSON);
//   }
//
// If you skip this entirely, login still works fine - lockout checks
// fail open (treat every login as "not locked out") when these
// endpoints don't exist.
