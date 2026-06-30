/**
 * Google Apps Script for "บัญชีเงินเบียร์"
 * This script serves as the API backend for the Web Application.
 * It handles GET requests to retrieve transactions and POST requests for CRUD operations and email alerts.
 */

// Starting Balance as defined in the requirements
const STARTING_BALANCE = 44540.83;

// Target email addresses for notification
const EMAIL_RECIPIENTS = "apinya04042528@gmail.com, puisena88@gmail.com";
const IMAGE_FOLDER_NAME = "ภาพ";

/**
 * Initialize and get the active spreadsheet.
 * If headers are missing, it initializes the sheet.
 */
function getSheet() {
  const doc = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = doc.getActiveSheet();
  
  // If sheet is empty or has no header, initialize it
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Timestamp", "วันที่", "ประเภท", "จำนวนเงิน", "รายละเอียด", "ผู้บันทึก", "Image URL", "Image File"]);
    // Freeze header row
    sheet.setFrozenRows(1);
  } else {
    ensureImageColumns(sheet);
  }
  return sheet;
}

function ensureImageColumns(sheet) {
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  if (headers.length < 7 || !headers[6]) {
    sheet.getRange(1, 7).setValue("Image URL");
  }
  if (headers.length < 8 || !headers[7]) {
    sheet.getRange(1, 8).setValue("Image File");
  }
}

/**
 * Handle HTTP GET Requests.
 * Fetches all transactions and calculates summaries to return to the frontend.
 */
function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.action === "sheetUrl") {
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        spreadsheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl()
      })).setMimeType(ContentService.MimeType.JSON);
    }
    const sheet = getSheet();
    const rows = sheet.getDataRange().getValues();
    const headers = rows[0];
    const data = [];
    
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    
    // Parse data rows (skipping header)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const transaction = {
        timestamp: row[0] ? row[0].toString() : "",
        date: row[1] ? row[1].toString() : "",
        type: row[2] ? row[2].toString() : "",
        amount: parseFloat(row[3]) || 0,
        details: row[4] ? row[4].toString() : "",
        user: row[5] ? row[5].toString() : "",
        imageUrl: row[6] ? row[6].toString() : "",
        imageName: row[7] ? row[7].toString() : ""
      };
      
      data.push(transaction);
      
      if (transaction.type === "ฝาก") {
        totalDeposits += transaction.amount;
      } else if (transaction.type === "ถอน") {
        totalWithdrawals += transaction.amount;
      }
    }
    
    // Sort transactions by Date (newest first for display) but keep the original database intact
    // We will let the frontend sort it if needed. Here we return in database order.
    
    const currentBalance = STARTING_BALANCE + totalDeposits - totalWithdrawals;
    
    const response = {
      status: "success",
      startingBalance: STARTING_BALANCE,
      currentBalance: currentBalance,
      totalDeposits: totalDeposits,
      totalWithdrawals: totalWithdrawals,
      totalTransactions: data.length,
      spreadsheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl(),
      data: data
    };
    
    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle HTTP POST Requests.
 * Processes add, update, and delete actions.
 */
function doPost(e) {
  try {
    // Check if post data exists
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("No data received in request body.");
    }
    
    const requestData = JSON.parse(e.postData.contents);
    const action = requestData.action;
    const sheet = getSheet();
    
    if (action === "add") {
      return addTransaction(sheet, requestData);
    } else if (action === "update") {
      return updateTransaction(sheet, requestData);
    } else if (action === "delete") {
      return deleteTransaction(sheet, requestData);
    } else {
      throw new Error("Invalid action specified: " + action);
    }
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Add a new transaction.
 * Includes duplicate prevention and email notification.
 */
function addTransaction(sheet, data) {
  const timestamp = data.timestamp || new Date().toISOString();
  const date = data.date; // Format: YYYY-MM-DD from client or DD/MM/YYYY
  const type = data.type; // "ฝาก" or "ถอน"
  const amount = parseFloat(data.amount);
  const details = data.details;
  const user = data.user || "";
  
  if (!date || !type || isNaN(amount) || !details) {
    throw new Error("Missing required transaction fields.");
  }
  
  // 1. Duplicate Prevention: Check if the timestamp already exists
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === timestamp) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "duplicate",
        message: "รายการนี้ถูกบันทึกไปแล้วเพื่อป้องกันข้อมูลซ้ำซ้อน"
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  // Also check if someone is double-clicking (same details within last 5 rows and close timestamp)
  // If the last row matches type, amount, date, details, and was written very recently (e.g. within 10 seconds)
  if (rows.length > 1) {
    const lastRowIndex = rows.length - 1;
    const lastRow = rows[lastRowIndex];
    const lastTimestamp = new Date(lastRow[0]).getTime();
    const currentTimestamp = new Date(timestamp).getTime();
    
    if (
      lastRow[1] === date &&
      lastRow[2] === type &&
      parseFloat(lastRow[3]) === amount &&
      lastRow[4] === details &&
      lastRow[5] === user &&
      Math.abs(currentTimestamp - lastTimestamp) < 10000 // 10 seconds
    ) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "duplicate",
        message: "พบการส่งข้อมูลซ้ำในระยะเวลาอันสั้น รายการถูกระงับเพื่อความถูกต้อง"
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  // 2. Save optional image and append transaction row
  const savedImage = saveTransactionImage(data.attachment, date, details);
  const imageUrl = savedImage ? savedImage.url : "";
  const imageName = savedImage ? savedImage.name : "";
  const emailAttachment = savedImage ? savedImage.blob : null;
  sheet.appendRow([timestamp, date, type, amount, details, user, imageUrl, imageName]);
  
  // 3. Calculate new current balance for email
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  const updatedRows = sheet.getDataRange().getValues();
  for (let i = 1; i < updatedRows.length; i++) {
    const rType = updatedRows[i][2];
    const rAmount = parseFloat(updatedRows[i][3]) || 0;
    if (rType === "ฝาก") totalDeposits += rAmount;
    if (rType === "ถอน") totalWithdrawals += rAmount;
  }
  const currentBalance = STARTING_BALANCE + totalDeposits - totalWithdrawals;
  
  // 4. Send Email Notification
  sendEmailNotification(date, type, amount, details, currentBalance, timestamp, emailAttachment);
  
  return ContentService.createTextOutput(JSON.stringify({
    status: "success",
    message: "บันทึกข้อมูลเรียบร้อยแล้ว",
    data: { timestamp, date, type, amount, details, user, currentBalance, imageUrl, imageName }
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Update an existing transaction.
 * Finds row by Timestamp and updates it.
 */
function updateTransaction(sheet, data) {
  const timestamp = data.timestamp;
  const date = data.date;
  const type = data.type;
  const amount = parseFloat(data.amount);
  const details = data.details;
  const user = data.user || "";
  
  if (!timestamp) {
    throw new Error("Missing Timestamp for update transaction.");
  }
  
  const rows = sheet.getDataRange().getValues();
  let rowIndex = -1;
  
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0].toString() === timestamp.toString()) {
      rowIndex = i + 1; // 1-based index in sheets (including headers, row i is sheet row i+1)
      break;
    }
  }
  
  if (rowIndex === -1) {
    throw new Error("ไม่พบรายการที่ต้องการแก้ไขในฐานข้อมูล");
  }
  
  // Update the row
  sheet.getRange(rowIndex, 2).setValue(date); // วันที่
  sheet.getRange(rowIndex, 3).setValue(type); // ประเภท
  sheet.getRange(rowIndex, 4).setValue(amount); // จำนวนเงิน
  sheet.getRange(rowIndex, 5).setValue(details); // รายละเอียด
  sheet.getRange(rowIndex, 6).setValue(user); // ผู้บันทึก
  if (data.attachment && data.attachment.data) {
    const savedImage = saveTransactionImage(data.attachment, date, details);
    if (savedImage) {
      sheet.getRange(rowIndex, 7).setValue(savedImage.url);
      sheet.getRange(rowIndex, 8).setValue(savedImage.name);
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    status: "success",
    message: "แก้ไขข้อมูลเรียบร้อยแล้ว"
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Delete an existing transaction.
 * Finds row by Timestamp and deletes it.
 */
function deleteTransaction(sheet, data) {
  const timestamp = data.timestamp;
  
  if (!timestamp) {
    throw new Error("Missing Timestamp for delete transaction.");
  }
  
  const rows = sheet.getDataRange().getValues();
  let rowIndex = -1;
  
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0].toString() === timestamp.toString()) {
      rowIndex = i + 1; // 1-based index in sheets
      break;
    }
  }
  
  if (rowIndex === -1) {
    throw new Error("ไม่พบรายการที่ต้องการลบในฐานข้อมูล");
  }
  
  // Delete the row
  sheet.deleteRow(rowIndex);
  
  return ContentService.createTextOutput(JSON.stringify({
    status: "success",
    message: "ลบข้อมูลเรียบร้อยแล้ว"
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Send automated email notification.
 */
function sendEmailNotification(date, type, amount, details, currentBalance, timestampStr, attachmentBlob) {
  const formattedAmount = formatCurrency(amount);
  const formattedBalance = formatCurrency(currentBalance);
  
  // Format Date for Email Body (Thai representation)
  // Input date is YYYY-MM-DD, convert to DD/MM/YYYY
  let displayDate = date;
  if (date.includes("-")) {
    const parts = date.split("-");
    displayDate = `${parts[2]}/${parts[1]}/${parseInt(parts[0]) + 543}`;
  }
  
  // Format Timestamp for "บันทึกเมื่อ"
  const recordDate = new Date(timestampStr);
  const tzOffset = 7 * 60; // ICT (Bangkok) UTC+7 in minutes
  const localTime = new Date(recordDate.getTime() + tzOffset * 60 * 1000);
  
  const dd = String(localTime.getUTCDate()).padStart(2, '0');
  const mm = String(localTime.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = localTime.getUTCFullYear() + 543; // Buddhist Era
  const hours = String(localTime.getUTCHours()).padStart(2, '0');
  const minutes = String(localTime.getUTCMinutes()).padStart(2, '0');
  
  const recordTimeStr = `${dd}/${mm}/${yyyy} เวลา ${hours}:${minutes} น.`;
  
  const subject = "แจ้งรายการฝาก–ถอนเงินใหม่";
  
  const body = `วันที่ทำรายการ: ${displayDate}\n\n` +
               `ประเภท:\n${type}\n\n` +
               `จำนวนเงิน:\n${formattedAmount} บาท\n\n` +
               `รายละเอียด:\n${details}\n\n` +
               `ยอดเงินคงเหลือปัจจุบัน:\n${formattedBalance} บาท\n\n` +
               `บันทึกเมื่อ:\n${recordTimeStr}`;
  
  // Build a nice HTML email body as well for a premium feel
  const htmlBody = `
    <div style="font-family: 'Sarabun', 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e1e8ed; border-radius: 12px; background: linear-gradient(135deg, #f5ffff 0%, #ffffea 50%, #ffeafb 100%);">
      <div style="text-align: center; margin-bottom: 20px;">
        <span style="font-size: 48px;">💰</span>
        <h2 style="color: #2c3e50; margin: 10px 0 0 0; font-weight: 700; font-size: 24px;">ระบบบัญชีฝาก–ถอนเงิน (บัญชีเงินเบียร์)</h2>
        <p style="color: #7f8c8d; font-size: 14px; margin: 5px 0 0 0;">มีรายการธุรกรรมใหม่ถูกบันทึกเข้าระบบ</p>
      </div>
      
      <div style="background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(10px); padding: 20px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05); margin-bottom: 20px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #7f8c8d; font-size: 15px; border-bottom: 1px solid #f0f0f0; width: 40%;">📅 วันที่ทำรายการ</td>
            <td style="padding: 8px 0; color: #2c3e50; font-size: 15px; font-weight: bold; border-bottom: 1px solid #f0f0f0; text-align: right;">${displayDate}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #7f8c8d; font-size: 15px; border-bottom: 1px solid #f0f0f0;">🔄 ประเภท</td>
            <td style="padding: 8px 0; color: ${type === 'ฝาก' ? '#27ae60' : '#c0392b'}; font-size: 15px; font-weight: bold; border-bottom: 1px solid #f0f0f0; text-align: right;">
              ${type === 'ฝาก' ? '🟢 ฝากเงิน' : '🔴 ถอนเงิน'}
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #7f8c8d; font-size: 15px; border-bottom: 1px solid #f0f0f0;">💵 จำนวนเงิน</td>
            <td style="padding: 8px 0; color: #2c3e50; font-size: 18px; font-weight: bold; border-bottom: 1px solid #f0f0f0; text-align: right;">${formattedAmount} บาท</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #7f8c8d; font-size: 15px; border-bottom: 1px solid #f0f0f0;">📝 รายละเอียด</td>
            <td style="padding: 8px 0; color: #2c3e50; font-size: 15px; border-bottom: 1px solid #f0f0f0; text-align: right;">${details}</td>
          </tr>
          <tr>
            <td style="padding: 12px 0 8px 0; color: #2c3e50; font-size: 16px; font-weight: bold;">💎 ยอดเงินคงเหลือปัจจุบัน</td>
            <td style="padding: 12px 0 8px 0; color: #2980b9; font-size: 20px; font-weight: bold; text-align: right;">${formattedBalance} บาท</td>
          </tr>
        </table>
      </div>
      
      <div style="text-align: center; color: #95a5a6; font-size: 12px;">
        <p>บันทึกเมื่อ: ${recordTimeStr}</p>
        <p style="margin-top: 15px; border-top: 1px solid #e1e8ed; padding-top: 15px;">ระบบนี้ส่งอีเมลอัตโนมัติ กรุณาอย่าตอบกลับอีเมลฉบับนี้</p>
      </div>
    </div>
  `;
  
  // Send email to all recipients
  const emailOptions = {
    to: EMAIL_RECIPIENTS,
    subject: subject,
    body: body,
    htmlBody: htmlBody
  };
  if (attachmentBlob) {
    emailOptions.attachments = [attachmentBlob];
  }
  MailApp.sendEmail(emailOptions);
}

function saveTransactionImage(attachment, date, details) {
  if (!attachment || !attachment.data) return null;
  const mimeType = attachment.mimeType || "application/octet-stream";
  if (mimeType.indexOf("image/") !== 0) {
    throw new Error("Attachment must be an image file.");
  }

  const extension = getFileExtension(attachment.name, mimeType);
  const baseName = sanitizeFileName(`${date}_${details}`) || "transaction-image";
  const fileName = `${baseName}${extension}`;
  const bytes = Utilities.base64Decode(attachment.data);
  const blob = Utilities.newBlob(bytes, mimeType, fileName);
  const folder = getImageFolder();
  const file = folder.createFile(blob);

  return {
    name: fileName,
    url: file.getUrl(),
    blob: blob
  };
}

function getImageFolder() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const spreadsheetFile = DriveApp.getFileById(spreadsheet.getId());
  const parents = spreadsheetFile.getParents();
  const parentFolder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  const matches = parentFolder.getFoldersByName(IMAGE_FOLDER_NAME);
  return matches.hasNext() ? matches.next() : parentFolder.createFolder(IMAGE_FOLDER_NAME);
}

function sanitizeFileName(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|#%{}~&]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 120);
}

function getFileExtension(fileName, mimeType) {
  const nameMatch = String(fileName || "").match(/\.[A-Za-z0-9]+$/);
  if (nameMatch) return nameMatch[0].toLowerCase();
  const map = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif"
  };
  return map[mimeType] || "";
}
/**
 * Format helper for currency (Thai Baht style: 1,234,567.89)
 */
function formatCurrency(num) {
  return num.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
}
