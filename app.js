/**
 * Client-side Logic for "บัญชีเงินเบียร์"
 */

// Application State
const webAppUrl = "https://script.google.com/macros/s/AKfycbw0Ns5NLTiLGu1BY6700VqzUAvYneIJTOZ5GMRSAz3teIgNCm3CRl9P5XfbFF3FsI013g/exec";
let allTransactions = [];
let filteredTransactions = [];
let googleSheetUrl = "";
const STARTING_BALANCE = 44540.83;

// Chart Instances
let monthlyChartInstance = null;
let balanceChartInstance = null;

// Edit State
let editingTimestamp = null;

// DOM Elements
const dashboardView = document.getElementById("dashboard-view");
const viewTitle = document.getElementById("view-title");
const currentDateStr = document.getElementById("current-date-str");
const connectionStatusBadge = document.getElementById("connection-status-badge");
const connectionStatusText = document.getElementById("connection-status-text");

// Sidebar Nav Buttons
const btnDashboard = document.getElementById("btn-dashboard");
const btnAddTransactionNav = document.getElementById("btn-add-transaction-nav");
const btnOpenSheet = document.getElementById("btn-open-sheet");
const mobileToggleBtn = document.getElementById("mobile-toggle-btn");
const sidebar = document.querySelector(".sidebar");

// Dashboard Elements
const kpiBalance = document.getElementById("kpi-balance");
const kpiDeposits = document.getElementById("kpi-deposits");
const kpiDepositsCount = document.getElementById("kpi-deposits-count");
const kpiWithdrawals = document.getElementById("kpi-withdrawals");
const kpiWithdrawalsCount = document.getElementById("kpi-withdrawals-count");
const kpiTxCount = document.getElementById("kpi-tx-count");
const transactionsTbody = document.getElementById("transactions-tbody");
const tableCountBadge = document.getElementById("table-count");

// Search & Filter
const searchInput = document.getElementById("search-input");
const filterType = document.getElementById("filter-type");
const btnAddTransactionTable = document.getElementById("btn-add-transaction-table");

// Transaction Modal Elements
const transactionModal = document.getElementById("transaction-modal");
const btnCloseModal = document.getElementById("btn-close-modal");
const btnCancelModal = document.getElementById("btn-cancel-modal");
const transactionForm = document.getElementById("transaction-form");
const modalTitle = document.getElementById("modal-title");
const txTimestampInput = document.getElementById("tx-timestamp");
const txDateInput = document.getElementById("tx-date");
const txTypeInput = document.getElementById("tx-type");
const txAmountInput = document.getElementById("tx-amount");
const txDetailsSelect = document.getElementById("tx-details-select");
const customDetailsGroup = document.getElementById("custom-details-group");
const txDetailsCustom = document.getElementById("tx-details-custom");
const txAttachmentInput = document.getElementById("tx-attachment");

const btnSubmitModal = document.getElementById("btn-submit-modal");
const submitBtnText = document.getElementById("submit-btn-text");
const submitSpinner = document.getElementById("submit-spinner");

// Toast Notification Container
const toastContainer = document.getElementById("toast-container");

// Admin Password Modal Elements
const adminPasswordModal = document.getElementById("admin-password-modal");
const adminModalTitle = document.getElementById("admin-modal-title");
const adminModalMessage = document.getElementById("admin-modal-message");
const adminPasswordInput = document.getElementById("admin-password-input");
const adminPasswordError = document.getElementById("admin-password-error");
const btnCloseAdminModal = document.getElementById("btn-close-admin-modal");
const btnCancelAdminModal = document.getElementById("btn-cancel-admin-modal");
const btnConfirmAdminModal = document.getElementById("btn-confirm-admin-modal");
let adminPasswordResolver = null;

/* ==========================================================================
   Initialization & Event Listeners
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  // Initialize Lucide Icons
  lucide.createIcons();
  
  // Set current date string
  updateDateDisplay();
  
  // Fetch initial data
  fetchData();
  
  // Navigation events
  btnDashboard.addEventListener("click", () => switchView("dashboard"));
  btnAddTransactionNav.addEventListener("click", () => openTransactionModal());
  if (btnOpenSheet) btnOpenSheet.addEventListener("click", handleOpenSheetClick);
  btnAddTransactionTable.addEventListener("click", () => openTransactionModal());
  
  // Mobile toggle sidebar
  mobileToggleBtn.addEventListener("click", () => {
    sidebar.classList.toggle("mobile-open");
  });
  
  // Close sidebar on click item in mobile
  document.querySelectorAll(".menu-item").forEach(item => {
    item.addEventListener("click", () => {
      sidebar.classList.remove("mobile-open");
    });
  });
  
  // Modal Cancel events
  btnCloseModal.addEventListener("click", closeTransactionModal);
  btnCancelModal.addEventListener("click", closeTransactionModal);
  setupAdminPasswordModal();
  
  // Modal conditional fields
  txDetailsSelect.addEventListener("change", handleDetailsSelectChange);
  
  // Form submit events
  transactionForm.addEventListener("submit", handleTransactionSubmit);
  
  // Search and Filter table
  searchInput.addEventListener("input", filterAndRenderTable);
  filterType.addEventListener("change", filterAndRenderTable);
  
  // Table Action Buttons (Edit/Delete using Event Delegation)
  transactionsTbody.addEventListener("click", handleTableActions);
});

/**
 * Switch between Views
 */
function switchView(viewName) {
  if (viewName === "dashboard") {
    btnDashboard.classList.add("active");
    dashboardView.classList.add("active");
    viewTitle.textContent = "สรุปภาพรวมบัญชี";
    if (allTransactions.length > 0) {
      setTimeout(() => renderCharts(allTransactions), 100);
    }
  }
}

/**
 * Display current date in Thai format
 */
function updateDateDisplay() {
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const today = new Date();
  // Format Thai Localized Date
  const dateStr = today.toLocaleDateString('th-TH', options);
  currentDateStr.textContent = dateStr;
}

/**
 * Set Connection Status Badge
 */
function updateConnectionStatus(isOnline) {
  if (isOnline) {
    connectionStatusBadge.className = "connection-status online";
    connectionStatusText.textContent = "เชื่อมต่อเรียบร้อย";
  } else {
    connectionStatusBadge.className = "connection-status offline";
    connectionStatusText.textContent = "ไม่ได้เชื่อมต่อ";
  }
}

/* ==========================================================================
   Data Fetching & Calculation
   ========================================================================== */

/**
 * Fetch all transaction data from the Google Apps Script Web App
 */
async function fetchData() {
  if (!webAppUrl) {
    updateConnectionStatus(false);
    showEmptyTableMessage("กรุณาตั้งค่าเชื่อมต่อกับ Google Sheet ในหน้าตั้งค่า");
    return;
  }
  
  showTableLoadingSpinner();
  
  try {
    const response = await fetch(webAppUrl, {
      method: "GET",
      redirect: "follow"
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const resData = await response.json();
    
    if (resData.status === "success") {
      allTransactions = resData.data || [];
      googleSheetUrl = resData.spreadsheetUrl || googleSheetUrl;
      
      // Update badge
      updateConnectionStatus(true);
      
      // Update numbers
      updateKPIs(resData);
      
      // Sort in descending order of date for recent list in table
      filteredTransactions = [...allTransactions];
      filterAndRenderTable();
      
      // Render visual charts
      renderCharts(allTransactions);
      
    } else {
      throw new Error(resData.message || "Failed to load database records.");
    }
  } catch (error) {
    console.error("Fetch Data Error:", error);
    updateConnectionStatus(false);
    showEmptyTableMessage("เกิดข้อผิดพลาดในการดึงข้อมูล โปรดตรวจสอบความถูกต้องของ URL หรือเครือข่าย");
    showToast(`ดึงข้อมูลไม่สำเร็จ: ${error.message}`, "error");
  }
}

/**
 * Update the KPI stats cards
 */
function updateKPIs(data) {
  const depositsList = allTransactions.filter(t => t.type === "ฝาก");
  const withdrawalsList = allTransactions.filter(t => t.type === "ถอน");
  
  // Animate changes or update directly
  animateNumber("kpi-balance", data.currentBalance);
  animateNumber("kpi-deposits", data.totalDeposits);
  animateNumber("kpi-withdrawals", data.totalWithdrawals);
  animateNumber("kpi-tx-count", data.totalTransactions);
  
  kpiDepositsCount.textContent = `${depositsList.length} รายการ`;
  kpiWithdrawalsCount.textContent = `${withdrawalsList.length} รายการ`;
}

/**
 * Helper to animate numerical count-ups nicely
 */
function animateNumber(elementId, targetValue) {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  // Format Thai currency text directly
  const formatted = formatCurrency(targetValue);
  element.textContent = formatted;
}

/* ==========================================================================
   Table Operations (Search, Filter, Actions)
   ========================================================================== */

/**
 * Filter the transactions list based on search and type dropdown, then draw the table
 */
function filterAndRenderTable() {
  const query = searchInput.value.toLowerCase().trim();
  const typeFilter = filterType.value;
  
  filteredTransactions = allTransactions.filter(t => {
    // 1. Search Query matches Details, User, or Amount
    const detailsMatch = t.details.toLowerCase().includes(query);
    const userMatch = t.user.toLowerCase().includes(query);
    const amountMatch = t.amount.toString().includes(query);
    const datePartsMatch = formatThaiDate(t.date).includes(query);
    
    const searchMatch = detailsMatch || userMatch || amountMatch || datePartsMatch;
    
    // 2. Type matches dropdown filter
    let typeMatch = true;
    if (typeFilter === "deposit") {
      typeMatch = t.type === "ฝาก";
    } else if (typeFilter === "withdrawal") {
      typeMatch = t.type === "ถอน";
    }
    
    return searchMatch && typeMatch;
  });
  
  // Sort transactions (we want newest transactions first for the table list)
  // Let's sort based on date, then timestamp descending
  filteredTransactions.sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    if (dateA.getTime() !== dateB.getTime()) {
      return dateB.getTime() - dateA.getTime(); // Newest date first
    }
    // If dates are identical, use the timestamp to determine order
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
  
  renderTable(filteredTransactions);
}

/**
 * Render list of transactions in table body
 */
function renderTable(txList) {
  tableCountBadge.textContent = `${txList.length} รายการ`;
  
  if (txList.length === 0) {
    transactionsTbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-8 text-muted">ไม่พบข้อมูลรายการธุรกรรม</td>
      </tr>
    `;
    return;
  }
  
  let html = "";
  txList.forEach(t => {
    const isDeposit = t.type === "ฝาก";
    const badgeClass = isDeposit ? "deposit" : "withdrawal";
    const amountClass = isDeposit ? "text-deposit font-bold" : "text-withdrawal font-bold";
    const displayDate = formatThaiDate(t.date);
    
    html += `
      <tr>
        <td>${displayDate}</td>
        <td>
          <span class="type-badge ${badgeClass}">
            ${isDeposit ? "➕ ฝาก" : "➖ ถอน"}
          </span>
        </td>
        <td class="${amountClass} text-right">${formatCurrency(t.amount)}</td>
        <td>${t.details}</td>
        <td class="text-center">${renderImageLink(t)}</td>
        <td>
          <div class="action-buttons-wrap">
            <button class="action-btn edit-btn" data-timestamp="${t.timestamp}" title="แก้ไขรายการ">
              <i data-lucide="edit-2"></i>
            </button>
            <button class="action-btn delete-btn" data-timestamp="${t.timestamp}" title="ลบรายการ">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  });
  
  transactionsTbody.innerHTML = html;
  
  // Re-initialize Lucide icons in table
  lucide.createIcons();
}

/**
 * Helper to show table spinner
 */
function showTableLoadingSpinner() {
  transactionsTbody.innerHTML = `
    <tr>
      <td colspan="6" class="text-center py-8 text-muted">
        <div class="loading-spinner-wrap">
          <div class="spinner"></div>
          <p class="mt-2">กำลังโหลดรายการธุรกรรมจาก Google Sheet...</p>
        </div>
      </td>
    </tr>
  `;
}

/**
 * Helper to show error message inside table
 */
function showEmptyTableMessage(msg) {
  transactionsTbody.innerHTML = `
    <tr>
      <td colspan="6" class="text-center py-8 text-muted">
        <div class="empty-state">
          <span style="font-size: 2.5rem;">⚠️</span>
          <p class="mt-2 font-bold">${msg}</p>
        </div>
      </td>
    </tr>
  `;
}

/* ==========================================================================
   Chart Visualizations (Chart.js)
   ========================================================================== */

/**
 * Render visual charts: Monthly Deposits vs Withdrawals & Cumulative Balance Trend
 */
function renderCharts(dataList) {
  // If charts already exist, destroy them before drawing to prevent canvas reuse errors
  if (monthlyChartInstance) monthlyChartInstance.destroy();
  if (balanceChartInstance) balanceChartInstance.destroy();
  
  if (dataList.length === 0) {
    drawEmptyCharts();
    return;
  }
  
  // Sort oldest first for chronological data processing
  const chronologicalData = [...dataList].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  // --- 1. Monthly Chart Processing ---
  const monthlyData = {};
  
  // Define Thai Month Short Names
  const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  
  chronologicalData.forEach(t => {
    if (!t.date) return;
    const dateObj = new Date(t.date);
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {
        label: `${TH_MONTHS[month]} ${String(year + 543).substring(2)}`,
        deposit: 0,
        withdrawal: 0
      };
    }
    
    if (t.type === "ฝาก") {
      monthlyData[monthKey].deposit += t.amount;
    } else if (t.type === "ถอน") {
      monthlyData[monthKey].withdrawal += t.amount;
    }
  });
  
  const sortedMonthKeys = Object.keys(monthlyData).sort();
  const monthlyLabels = sortedMonthKeys.map(k => monthlyData[k].label);
  const monthlyDeposits = sortedMonthKeys.map(k => monthlyData[k].deposit);
  const monthlyWithdrawals = sortedMonthKeys.map(k => monthlyData[k].withdrawal);
  
  // Draw Monthly Bar Chart
  const ctxMonthly = document.getElementById("monthlyChart").getContext("2d");
  monthlyChartInstance = new Chart(ctxMonthly, {
    type: "bar",
    data: {
      labels: monthlyLabels.length > 0 ? monthlyLabels : [getThaiMonthYearStr(new Date())],
      datasets: [
        {
          label: "เงินฝาก (บาท)",
          data: monthlyDeposits.length > 0 ? monthlyDeposits : [0],
          backgroundColor: "rgba(38, 166, 154, 0.6)",
          borderColor: "rgba(38, 166, 154, 1)",
          borderWidth: 1.5,
          borderRadius: 6,
        },
        {
          label: "เงินถอน (บาท)",
          data: monthlyWithdrawals.length > 0 ? monthlyWithdrawals : [0],
          backgroundColor: "rgba(239, 83, 80, 0.6)",
          borderColor: "rgba(239, 83, 80, 1)",
          borderWidth: 1.5,
          borderRadius: 6,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top",
          labels: { font: { family: "Sarabun" } }
        },
        tooltip: {
          titleFont: { family: "Sarabun" },
          bodyFont: { family: "Sarabun" }
        }
      },
      scales: {
        x: { ticks: { font: { family: "Sarabun" } } },
        y: { ticks: { font: { family: "Sarabun" } } }
      }
    }
  });
  
  // --- 2. Balance Trend Line Chart Processing ---
  let runningBalance = STARTING_BALANCE;
  const balancePoints = [runningBalance];
  const balanceLabels = ["เงินตั้งต้น"];
  
  chronologicalData.forEach(t => {
    if (t.type === "ฝาก") {
      runningBalance += t.amount;
    } else if (t.type === "ถอน") {
      runningBalance -= t.amount;
    }
    balancePoints.push(runningBalance);
    balanceLabels.push(formatThaiDateShort(t.date));
  });
  
  // Draw Balance Line Chart
  const ctxBalance = document.getElementById("balanceChart").getContext("2d");
  
  // Create beautiful background gradient for lines
  const gradientFill = ctxBalance.createLinearGradient(0, 0, 0, 250);
  gradientFill.addColorStop(0, "rgba(92, 107, 192, 0.35)");
  gradientFill.addColorStop(1, "rgba(92, 107, 192, 0.0)");
  
  balanceChartInstance = new Chart(ctxBalance, {
    type: "line",
    data: {
      labels: balanceLabels,
      datasets: [{
        label: "ยอดเงินคงเหลือ (บาท)",
        data: balancePoints,
        borderColor: "rgba(92, 107, 192, 1)",
        borderWidth: 3,
        pointBackgroundColor: "rgba(92, 107, 192, 1)",
        pointHoverRadius: 7,
        tension: 0.3,
        fill: true,
        backgroundColor: gradientFill
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          titleFont: { family: "Sarabun" },
          bodyFont: { family: "Sarabun" },
          callbacks: {
            label: function(context) {
              return ` คงเหลือ: ${formatCurrency(context.raw)} บาท`;
            }
          }
        }
      },
      scales: {
        x: { ticks: { font: { family: "Sarabun" } } },
        y: { ticks: { font: { family: "Sarabun" } } }
      }
    }
  });
}

/**
 * Draw empty default charts
 */
function drawEmptyCharts() {
  const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const dateObj = new Date();
  const currentMonthLabel = `${TH_MONTHS[dateObj.getMonth()]} ${String(dateObj.getFullYear() + 543).substring(2)}`;
  
  const ctxMonthly = document.getElementById("monthlyChart").getContext("2d");
  monthlyChartInstance = new Chart(ctxMonthly, {
    type: "bar",
    data: {
      labels: [currentMonthLabel],
      datasets: [
        { label: "เงินฝาก (บาท)", data: [0], backgroundColor: "rgba(38, 166, 154, 0.2)" },
        { label: "เงินถอน (บาท)", data: [0], backgroundColor: "rgba(239, 83, 80, 0.2)" }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { font: { family: "Sarabun" } } } }
    }
  });
  
  const ctxBalance = document.getElementById("balanceChart").getContext("2d");
  balanceChartInstance = new Chart(ctxBalance, {
    type: "line",
    data: {
      labels: ["เงินตั้งต้น"],
      datasets: [{ label: "ยอดเงินคงเหลือ", data: [STARTING_BALANCE], borderColor: "rgba(92, 107, 192, 0.3)", tension: 0.1 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });
}

/* ==========================================================================
   Modal Form & CRUD Actions
   ========================================================================== */

/**
 * Open Modal Form for Add
 */
function openTransactionModal() {
  // Clear any existing edit state
  editingTimestamp = null;
  txTimestampInput.value = "";
  transactionForm.reset();
  
  // Clear password field
  document.getElementById("tx-password").value = "";
  if (txAttachmentInput) txAttachmentInput.value = "";
  
  // Set default current date (local timezone YYYY-MM-DD format for date inputs)
  const tzOffset = 7 * 60; // ICT
  const localToday = new Date(Date.now() + tzOffset * 60 * 1000);
  txDateInput.value = localToday.toISOString().substring(0, 10);
  
  customDetailsGroup.classList.add("hidden");
  txDetailsCustom.removeAttribute("required");
  
  modalTitle.innerHTML = `<span class="modal-header-icon">➕</span> บันทึกธุรกรรมใหม่`;
  submitBtnText.textContent = "บันทึกรายการ";
  
  // Set UI focus and trigger modal layout
  transactionModal.classList.add("active");
}

/**
 * Open Modal Form for Edit
 */
function openEditTransactionModal(timestamp) {
  const transaction = allTransactions.find(t => t.timestamp === timestamp);
  if (!transaction) return;
  
  editingTimestamp = timestamp;
  txTimestampInput.value = timestamp;
  
  // Clear password field
  document.getElementById("tx-password").value = "";
  if (txAttachmentInput) txAttachmentInput.value = "";
  
  // Populate form
  txDateInput.value = transaction.date;
  txTypeInput.value = transaction.type;
  txAmountInput.value = transaction.amount;
  
  // Determine if it was custom details or in dropdown
  const commonDetails = ["เงินประจำเดือนของแม่"];
  if (commonDetails.includes(transaction.details)) {
    txDetailsSelect.value = transaction.details;
    customDetailsGroup.classList.add("hidden");
    txDetailsCustom.value = "";
    txDetailsCustom.removeAttribute("required");
  } else {
    txDetailsSelect.value = "อื่นๆ";
    customDetailsGroup.classList.remove("hidden");
    txDetailsCustom.value = transaction.details;
    txDetailsCustom.setAttribute("required", "");
  }
  

  
  modalTitle.innerHTML = `<span class="modal-header-icon">📝</span> แก้ไขรายละเอียดธุรกรรม`;
  submitBtnText.textContent = "บันทึกการแก้ไข";
  
  transactionModal.classList.add("active");
}

/**
 * Close Modal Form
 */
function closeTransactionModal() {
  transactionModal.classList.remove("active");
  editingTimestamp = null;
}

/**
 * Handle details drop-down change
 */
function handleDetailsSelectChange() {
  if (txDetailsSelect.value === "อื่นๆ") {
    customDetailsGroup.classList.remove("hidden");
    txDetailsCustom.setAttribute("required", "");
    txDetailsCustom.focus();
  } else {
    customDetailsGroup.classList.add("hidden");
    txDetailsCustom.removeAttribute("required");
    txDetailsCustom.value = "";
  }
}

/**
 * Handle Add/Edit Form Submit
 */
async function handleTransactionSubmit(e) {
  e.preventDefault();
  
  // Verify passcode
  const passwordInput = document.getElementById("tx-password");
  if (passwordInput.value !== "Admin1234") {
    showToast("รหัสเข้าใช้งานไม่ถูกต้อง ไม่สามารถทำรายการได้", "error");
    return;
  }
  
  if (!webAppUrl) {
    showToast("ไม่พบ URL สำหรับเชื่อมต่อฐานข้อมูล", "error");
    return;
  }
  
  // Lock form inputs
  setFormLoading(true);
  
  // Build payload
  const type = txTypeInput.value;
  const amount = parseFloat(txAmountInput.value);
  const date = txDateInput.value;

  
  let details = txDetailsSelect.value;
  if (details === "อื่นๆ") {
    details = txDetailsCustom.value.trim();
  }
  
  // Validation check
  if (isNaN(amount) || amount <= 0) {
    showToast("กรุณากรอกจำนวนเงินให้ถูกต้อง (มากกว่า 0)", "warning");
    setFormLoading(false);
    return;
  }
  
  // Format numbers to 2 decimals
  const roundedAmount = parseFloat(amount.toFixed(2));
  
  const payload = {
    date: date,
    type: type,
    amount: roundedAmount,
    details: details,
    user: ""
  };
  
  if (editingTimestamp) {
    // Edit mode
    payload.action = "update";
    payload.timestamp = editingTimestamp;
  } else {
    // Add mode
    payload.action = "add";
    // Generate client timestamp (acts as primary key)
    payload.timestamp = new Date().toISOString();
  }
  
  try {
    const attachment = await getAttachmentPayload();
    if (attachment) payload.attachment = attachment;
    const response = await fetch(webAppUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain"
      },
      body: JSON.stringify(payload),
      redirect: "follow"
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const resData = await response.json();
    
    if (resData.status === "success") {
      showToast(resData.message || "บันทึกรายการเรียบร้อยแล้ว", "success");
      closeTransactionModal();
      // Fetch fresh data
      fetchData();
    } else if (resData.status === "duplicate") {
      showToast(resData.message, "warning");
    } else {
      throw new Error(resData.message || "เกิดข้อผิดพลาดในการทำธุรกรรม");
    }
  } catch (error) {
    console.error("Submit Transaction Error:", error);
    showToast(`ทำรายการไม่สำเร็จ: ${error.message}`, "error");
  } finally {
    setFormLoading(false);
  }
}

/**
 * Handle Edit/Delete Actions via Event Delegation
 */
async function handleTableActions(e) {
  // Find action button clicked
  const editBtn = e.target.closest(".edit-btn");
  const deleteBtn = e.target.closest(".delete-btn");
  
  if (editBtn) {
    const timestamp = editBtn.getAttribute("data-timestamp");
    openEditTransactionModal(timestamp);
  }
  
  if (deleteBtn) {
    const timestamp = deleteBtn.getAttribute("data-timestamp");
    const matchedTx = allTransactions.find(t => t.timestamp === timestamp);
    if (!matchedTx) return;
    
    // Verify passcode
    const isAuthorized = await requestAdminPassword({
      title: "ยืนยันการลบรายการ",
      message: "กรอกรหัส Admin เพื่อลบรายการนี้"
    });
    if (!isAuthorized) return;
    
    const displayDate = formatThaiDate(matchedTx.date);
    const confirmMessage = `คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้?\n\n` +
                           `📅 วันที่: ${displayDate}\n` +
                           `🔄 ประเภท: ${matchedTx.type}\n` +
                           `💵 จำนวนเงิน: ${formatCurrency(matchedTx.amount)} บาท\n` +
                           `📝 รายละเอียด: ${matchedTx.details}`;
    
    if (confirm(confirmMessage)) {
      await executeDelete(timestamp);
    }
  }
}

/**
 * Send DELETE request to API
 */
async function executeDelete(timestamp) {
  if (!webAppUrl) return;
  
  showToast("กำลังส่งคำขอลบรายการ...", "info");
  
  try {
    const response = await fetch(webAppUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain"
      },
      body: JSON.stringify({
        action: "delete",
        timestamp: timestamp
      }),
      redirect: "follow"
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const resData = await response.json();
    
    if (resData.status === "success") {
      showToast(resData.message || "ลบรายการเรียบร้อยแล้ว", "success");
      fetchData(); // Refresh
    } else {
      throw new Error(resData.message || "ลบข้อมูลล้มเหลว");
    }
  } catch (error) {
    console.error("Delete Error:", error);
    showToast(`ไม่สามารถลบรายการได้: ${error.message}`, "error");
  }
}

/**
 * Set modal form loading state
 */
function setFormLoading(isLoading) {
  if (isLoading) {
    // Show spinner & disable button
    submitSpinner.classList.remove("hidden");
    btnSubmitModal.setAttribute("disabled", "disabled");
    btnCancelModal.setAttribute("disabled", "disabled");
    btnCloseModal.setAttribute("disabled", "disabled");
    if (txAttachmentInput) txAttachmentInput.setAttribute("disabled", "disabled");
  } else {
    submitSpinner.classList.add("hidden");
    btnSubmitModal.removeAttribute("disabled");
    btnCancelModal.removeAttribute("disabled");
    btnCloseModal.removeAttribute("disabled");
    if (txAttachmentInput) txAttachmentInput.removeAttribute("disabled");
  }
}



function setupAdminPasswordModal() {
  if (!adminPasswordModal) return;
  btnCloseAdminModal.addEventListener("click", () => resolveAdminPassword(false));
  btnCancelAdminModal.addEventListener("click", () => resolveAdminPassword(false));
  btnConfirmAdminModal.addEventListener("click", submitAdminPassword);
  adminPasswordInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitAdminPassword();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      resolveAdminPassword(false);
    }
  });
  adminPasswordModal.addEventListener("click", (event) => {
    if (event.target === adminPasswordModal) resolveAdminPassword(false);
  });
}

function requestAdminPassword({ title, message }) {
  if (!adminPasswordModal) {
    showToast("ไม่พบหน้าต่างยืนยันรหัส Admin", "error");
    return Promise.resolve(false);
  }
  if (adminPasswordResolver) resolveAdminPassword(false);
  adminModalTitle.textContent = title || "ยืนยันรหัส Admin";
  adminModalMessage.textContent = message || "กรอกรหัสเพื่อดำเนินการต่อ";
  adminPasswordInput.value = "";
  adminPasswordError.classList.add("hidden");
  adminPasswordModal.classList.add("active");
  setTimeout(() => adminPasswordInput.focus(), 80);
  lucide.createIcons();

  return new Promise((resolve) => {
    adminPasswordResolver = resolve;
  });
}

function submitAdminPassword() {
  if (adminPasswordInput.value === "Admin1234") {
    resolveAdminPassword(true);
    return;
  }
  adminPasswordError.classList.remove("hidden");
  adminPasswordInput.select();
}

function resolveAdminPassword(result) {
  if (!adminPasswordResolver) return;
  const resolver = adminPasswordResolver;
  adminPasswordResolver = null;
  adminPasswordModal.classList.remove("active");
  resolver(result);
}
function renderImageLink(transaction) {
  if (!transaction.imageUrl) return "-";
  const title = transaction.imageName || "เปิดรูปภาพ";
  return `
    <a class="image-link" href="${escapeAttribute(transaction.imageUrl)}" target="_blank" rel="noopener" title="${escapeAttribute(title)}">
      <i data-lucide="image"></i>
    </a>
  `;
}

async function handleOpenSheetClick() {
  const isAuthorized = await requestAdminPassword({
    title: "เปิด Google Sheet",
    message: "กรอกรหัส Admin เพื่อเปิดไฟล์ Google Sheet"
  });
  if (!isAuthorized) return;

  const sheetWindow = window.open("about:blank", "_blank");
  try {
    const sheetUrl = await resolveGoogleSheetUrl();
    if (!sheetUrl) {
      if (sheetWindow) sheetWindow.close();
      showToast("ยังไม่พบลิงก์ Google Sheet กรุณาตรวจสอบว่า Apps Script อัปเดตเป็นเวอร์ชันล่าสุดแล้ว", "warning");
      return;
    }
    if (sheetWindow) {
      sheetWindow.location.href = sheetUrl;
    } else {
      window.open(sheetUrl, "_blank", "noopener");
    }
  } catch (error) {
    if (sheetWindow) sheetWindow.close();
    console.error("Open Sheet Error:", error);
    showToast(`เปิด Google Sheet ไม่สำเร็จ: ${error.message}`, "error");
  }
}

async function resolveGoogleSheetUrl() {
  if (googleSheetUrl) return googleSheetUrl;
  const separator = webAppUrl.includes("?") ? "&" : "?";
  const response = await fetch(`${webAppUrl}${separator}action=sheetUrl&t=${Date.now()}`, {
    method: "GET",
    redirect: "follow"
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  if (data.status === "success" && data.spreadsheetUrl) {
    googleSheetUrl = data.spreadsheetUrl;
    return googleSheetUrl;
  }
  return "";
}

async function getAttachmentPayload() {
  if (!txAttachmentInput || !txAttachmentInput.files || txAttachmentInput.files.length === 0) {
    return null;
  }
  const file = txAttachmentInput.files[0];
  if (!file.type || !file.type.startsWith("image/")) {
    throw new Error("กรุณาแนบไฟล์รูปภาพเท่านั้น");
  }
  const dataUrl = await readFileAsDataUrl(file);
  return {
    name: file.name,
    mimeType: file.type,
    data: dataUrl.split(",")[1]
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("อ่านไฟล์รูปภาพไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });
}

function escapeAttribute(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
/* ==========================================================================
   Helper Utilities
   ========================================================================== */

/**
 * Format currency numbers with Baht formatting (e.g. 44,540.83)
 */
function formatCurrency(num) {
  if (typeof num !== "number") num = parseFloat(num) || 0;
  return num.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Format date YYYY-MM-DD or long date string into DD/MM/YYYY Thai Buddhist Year
 */
function formatThaiDate(dateStr) {
  if (!dateStr) return "-";
  
  // Parse YYYY-MM-DD directly to avoid timezone shift
  if (dateStr.includes("-")) {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0]);
      const month = parts[1];
      const day = parts[2];
      return `${day}/${month}/${year + 543}`;
    }
  }
  
  // Fallback to standard JS Date parsing (for long strings from Sheets)
  const dateObj = new Date(dateStr);
  if (!isNaN(dateObj.getTime())) {
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const beYear = dateObj.getFullYear() + 543;
    return `${day}/${month}/${beYear}`;
  }
  
  return dateStr;
}

/**
 * Format date YYYY-MM-DD or long date string to DD/MM BE short format (e.g., 14/06/69)
 */
function formatThaiDateShort(dateStr) {
  if (!dateStr) return "";
  
  // Parse YYYY-MM-DD directly
  if (dateStr.includes("-")) {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0]);
      const month = parts[1];
      const day = parts[2];
      const beYearShort = String(year + 543).substring(2);
      return `${day}/${month}/${beYearShort}`;
    }
  }
  
  // Fallback to standard JS Date parsing
  const dateObj = new Date(dateStr);
  if (!isNaN(dateObj.getTime())) {
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const beYearShort = String(dateObj.getFullYear() + 543).substring(2);
    return `${day}/${month}/${beYearShort}`;
  }
  
  return dateStr;
}

/**
 * Convert Date Object to "Month YY" in Thai (e.g. "มิ.ย. 69")
 */
function getThaiMonthYearStr(dateObj) {
  const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const m = dateObj.getMonth();
  const y = dateObj.getFullYear() + 543;
  return `${TH_MONTHS[m]} ${String(y).substring(2)}`;
}

/**
 * Show custom toast notifications
 */
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  
  let iconName = "info";
  if (type === "success") iconName = "check-circle";
  if (type === "error") iconName = "alert-triangle";
  if (type === "warning") iconName = "alert-circle";
  
  toast.innerHTML = `
    <i data-lucide="${iconName}"></i>
    <div class="toast-message">${message}</div>
  `;
  
  toastContainer.appendChild(toast);
  lucide.createIcons();
  
  // Trigger slide and fade out
  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3500);
}
