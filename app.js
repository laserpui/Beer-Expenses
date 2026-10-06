/**
 * Client-side Logic for "บัญชีเงินเบียร์"
 */

// Application State
const webAppUrl = "https://script.google.com/macros/s/AKfycbw0Ns5NLTiLGu1BY6700VqzUAvYneIJTOZ5GMRSAz3teIgNCm3CRl9P5XfbFF3FsI013g/exec";
let allTransactions = [];
let filteredTransactions = [];
let startingBalance = 0;
let currentPage = 1;
let searchUserEditing = false;
let searchAutofillTimers = [];
const PAGE_SIZE = 50;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Chart Instances
let monthlyChartInstance = null;
let balanceChartInstance = null;

// Edit State
let editingTimestamp = null;
let lastFocusedElement = null;

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
const tablePagination = document.getElementById("table-pagination");
const pageStatus = document.getElementById("page-status");
const btnPagePrev = document.getElementById("btn-page-prev");
const btnPageNext = document.getElementById("btn-page-next");

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
  safeCreateIcons();
  
  // Set current date string
  updateDateDisplay();

  // Do not restore a previous search/filter value when the browser reloads the page.
  armSearchAutofillGuard();
  resetTableFilters();
  scheduleSearchAutofillSweeps();
  
  // Fetch initial data
  fetchData();
  
  // Navigation events
  btnDashboard.addEventListener("click", () => switchView("dashboard"));
  btnAddTransactionNav.addEventListener("click", () => openTransactionModal());
  if (btnOpenSheet) btnOpenSheet.addEventListener("click", handleOpenSheetClick);
  btnAddTransactionTable.addEventListener("click", () => openTransactionModal());
  
  // Mobile toggle sidebar
  mobileToggleBtn.addEventListener("click", () => {
    const isOpen = sidebar.classList.toggle("mobile-open");
    mobileToggleBtn.setAttribute("aria-expanded", String(isOpen));
    mobileToggleBtn.setAttribute("aria-label", isOpen ? "ปิดเมนูหลัก" : "เปิดเมนูหลัก");
  });
  
  // Close sidebar on click item in mobile
  document.querySelectorAll(".menu-item").forEach(item => {
    item.addEventListener("click", () => {
      sidebar.classList.remove("mobile-open");
      mobileToggleBtn.setAttribute("aria-expanded", "false");
      mobileToggleBtn.setAttribute("aria-label", "เปิดเมนูหลัก");
    });
  });
  
  // Modal Cancel events
  btnCloseModal.addEventListener("click", closeTransactionModal);
  btnCancelModal.addEventListener("click", closeTransactionModal);
  transactionModal.addEventListener("click", (event) => {
    if (event.target === transactionModal) closeTransactionModal();
  });
  setupAdminPasswordModal();
  document.addEventListener("keydown", handleGlobalKeydown);
  
  // Modal conditional fields
  txDetailsSelect.addEventListener("change", handleDetailsSelectChange);
  
  // Form submit events
  transactionForm.addEventListener("submit", handleTransactionSubmit);
  
  // Search and Filter table
  searchInput.addEventListener("input", () => {
    currentPage = 1;
    filterAndRenderTable();
  });
  filterType.addEventListener("change", () => {
    currentPage = 1;
    filterAndRenderTable();
  });
  btnPagePrev.addEventListener("click", () => changePage(-1));
  btnPageNext.addEventListener("click", () => changePage(1));
  
  // Table Action Buttons (Edit/Delete using Event Delegation)
  transactionsTbody.addEventListener("click", handleTableActions);
});

// Browsers can restore form controls after DOMContentLoaded when returning from
// the back-forward cache. Clear the dashboard filters again in that case.
window.addEventListener("pageshow", (event) => {
  resetTableFilters();
  scheduleSearchAutofillSweeps();
  if (event.persisted) filterAndRenderTable();
});

window.addEventListener("load", scheduleSearchAutofillSweeps);

function resetTableFilters() {
  searchUserEditing = false;
  searchInput.readOnly = true;
  searchInput.value = "";
  filterType.value = "all";
  currentPage = 1;
}

function armSearchAutofillGuard() {
  searchInput.addEventListener("pointerdown", () => {
    clearUnexpectedSearchValue();
    searchInput.readOnly = false;
  });

  searchInput.addEventListener("keydown", (event) => {
    searchInput.readOnly = false;
    if (!event.ctrlKey && !event.metaKey && !event.altKey &&
        (event.key.length === 1 || event.key === "Backspace" || event.key === "Delete")) {
      searchUserEditing = true;
    }
  });

  searchInput.addEventListener("paste", () => {
    searchUserEditing = true;
    searchInput.readOnly = false;
  });

  searchInput.addEventListener("compositionstart", () => {
    searchUserEditing = true;
    searchInput.readOnly = false;
  });

  searchInput.addEventListener("beforeinput", (event) => {
    if (event.inputType === "insertReplacementText" && !searchUserEditing) {
      event.preventDefault();
      queueMicrotask(clearUnexpectedSearchValue);
      return;
    }
  });

  searchInput.addEventListener("input", () => {
    if (!searchUserEditing) clearUnexpectedSearchValue();
  });

  searchInput.addEventListener("focus", () => {
    clearUnexpectedSearchValue();
    scheduleSearchAutofillSweeps([0, 60, 250, 800, 1500]);
  });

  searchInput.addEventListener("blur", () => {
    searchInput.readOnly = true;
  });

  searchInput.addEventListener("animationstart", (event) => {
    if (event.animationName === "search-autofill-start" && !searchUserEditing) {
      clearUnexpectedSearchValue();
    }
  });
}

function scheduleSearchAutofillSweeps(delays = [0, 60, 250, 800, 1500, 3000]) {
  searchAutofillTimers.forEach(timer => clearTimeout(timer));
  searchAutofillTimers = delays.map(delay => setTimeout(clearUnexpectedSearchValue, delay));
}

function clearUnexpectedSearchValue() {
  if (searchUserEditing || !searchInput.value) return;
  searchInput.value = "";
  currentPage = 1;
  if (allTransactions.length > 0) filterAndRenderTable();
}

/**
 * Switch between Views
 */
function switchView(viewName) {
  if (viewName === "dashboard") {
    btnDashboard.classList.add("active");
    dashboardView.classList.add("active");
    viewTitle.textContent = "สรุปภาพรวมบัญชี";
    if (allTransactions.length > 0) {
      setTimeout(() => {
        try {
          renderCharts(allTransactions);
        } catch (error) {
          console.error("Chart Render Error:", error);
        }
      }, 100);
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
    const resData = await fetchJsonWithRetry(webAppUrl, {
      method: "GET",
      redirect: "follow"
    }, { attempts: 3, timeoutMs: 12000 });
    
    if (resData.status === "success") {
      allTransactions = resData.data || [];
      startingBalance = Number(resData.startingBalance) || 0;
      
      // Update badge
      updateConnectionStatus(true);
      
      // Update numbers
      updateKPIs(resData);
      
      // Sort in descending order of date for recent list in table
      filteredTransactions = [...allTransactions];
      filterAndRenderTable();
      
      // A chart-library failure must not make valid Sheet data look offline.
      try {
        renderCharts(allTransactions);
      } catch (chartError) {
        console.error("Chart Render Error:", chartError);
        showToast("โหลดข้อมูลสำเร็จ แต่ไม่สามารถแสดงกราฟได้", "warning");
      }
      
    } else {
      throw new Error(resData.message || "Failed to load database records.");
    }
  } catch (error) {
    console.error("Fetch Data Error:", error);
    updateConnectionStatus(false);
    showEmptyTableMessage("เกิดข้อผิดพลาดในการดึงข้อมูล โปรดตรวจสอบ URL หรือเครือข่าย", true);
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
    const detailsMatch = String(t.details || "").toLowerCase().includes(query);
    const userMatch = String(t.user || "").toLowerCase().includes(query);
    const amountMatch = String(t.amount ?? "").includes(query);
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
  
  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  renderTable(filteredTransactions);
}

/**
 * Render list of transactions in table body
 */
function renderTable(txList) {
  tableCountBadge.textContent = `${txList.length} รายการ`;
  
  if (txList.length === 0) {
    tablePagination.hidden = true;
    transactionsTbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-8 text-muted">ไม่พบข้อมูลรายการธุรกรรม</td>
      </tr>
    `;
    return;
  }

  const totalPages = Math.ceil(txList.length / PAGE_SIZE);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageItems = txList.slice(pageStart, pageStart + PAGE_SIZE);
  tablePagination.hidden = totalPages <= 1;
  pageStatus.textContent = `หน้า ${currentPage} จาก ${totalPages}`;
  btnPagePrev.disabled = currentPage <= 1;
  btnPageNext.disabled = currentPage >= totalPages;
  
  let html = "";
  pageItems.forEach(t => {
    const isDeposit = t.type === "ฝาก";
    const badgeClass = isDeposit ? "deposit" : "withdrawal";
    const amountClass = isDeposit ? "text-deposit font-bold" : "text-withdrawal font-bold";
    const displayDate = formatThaiDate(t.date);
    
    html += `
      <tr>
        <td>${escapeHtml(displayDate)}</td>
        <td>
          <span class="type-badge ${badgeClass}">
            ${isDeposit ? "➕ ฝาก" : "➖ ถอน"}
          </span>
        </td>
        <td class="${amountClass} text-right">${formatCurrency(t.amount)}</td>
        <td>${escapeHtml(t.details)}</td>
        <td class="text-center">${renderImageLink(t)}</td>
        <td>
          <div class="action-buttons-wrap">
            <button class="action-btn edit-btn" data-timestamp="${escapeAttribute(t.timestamp)}" title="แก้ไขรายการ" aria-label="แก้ไขรายการวันที่ ${escapeAttribute(displayDate)}">
              <i data-lucide="edit-2"></i>
            </button>
            <button class="action-btn delete-btn" data-timestamp="${escapeAttribute(t.timestamp)}" title="ลบรายการ" aria-label="ลบรายการวันที่ ${escapeAttribute(displayDate)}">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  });
  
  transactionsTbody.innerHTML = html;
  
  // Re-initialize Lucide icons in table
  safeCreateIcons();
}

function changePage(direction) {
  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const nextPage = Math.min(totalPages, Math.max(1, currentPage + direction));
  if (nextPage === currentPage) return;
  currentPage = nextPage;
  renderTable(filteredTransactions);
  document.querySelector(".table-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Helper to show table spinner
 */
function showTableLoadingSpinner() {
  tablePagination.hidden = true;
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
function showEmptyTableMessage(msg, allowRetry = false) {
  tablePagination.hidden = true;
  transactionsTbody.innerHTML = `
    <tr>
      <td colspan="6" class="text-center py-8 text-muted">
        <div class="empty-state">
          <span style="font-size: 2.5rem;">⚠️</span>
          <p class="mt-2 font-bold">${escapeHtml(msg)}</p>
          ${allowRetry ? '<button type="button" class="btn btn-secondary btn-sm retry-btn mt-2">ลองเชื่อมต่อใหม่</button>' : ""}
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
  if (typeof Chart === "undefined") {
    throw new Error("Chart.js is unavailable");
  }
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
  let runningBalance = startingBalance;
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
      datasets: [{ label: "ยอดเงินคงเหลือ", data: [startingBalance], borderColor: "rgba(92, 107, 192, 0.3)", tension: 0.1 }]
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
  lastFocusedElement = document.activeElement;
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
  transactionModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  setTimeout(() => txDateInput.focus(), 50);
}

/**
 * Open Modal Form for Edit
 */
function openEditTransactionModal(timestamp) {
  const transaction = allTransactions.find(t => t.timestamp === timestamp);
  if (!transaction) return;
  
  lastFocusedElement = document.activeElement;
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
  transactionModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  setTimeout(() => txDateInput.focus(), 50);
}

/**
 * Close Modal Form
 */
function closeTransactionModal() {
  transactionModal.classList.remove("active");
  transactionModal.setAttribute("aria-hidden", "true");
  if (!adminPasswordModal.classList.contains("active")) document.body.classList.remove("modal-open");
  editingTimestamp = null;
  document.getElementById("tx-password").value = "";
  restoreLastFocus();
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
  
  // The passcode is verified by Apps Script; never trust a client-side comparison.
  const passwordInput = document.getElementById("tx-password");
  if (!passwordInput.value) {
    showToast("กรุณากรอกรหัสเข้าใช้งาน", "warning");
    passwordInput.focus();
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
  if (!details || details.length > 250) {
    showToast("รายละเอียดต้องมี 1–250 ตัวอักษร", "warning");
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
    user: "",
    password: passwordInput.value,
    requestId: createRequestId()
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
    const resData = await fetchJsonWithRetry(webAppUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain"
      },
      body: JSON.stringify(payload),
      redirect: "follow"
    }, { attempts: 2, timeoutMs: 20000 });
    
    if (resData.status === "success") {
      showToast(resData.message || "บันทึกรายการเรียบร้อยแล้ว", "success");
      if (resData.warning) showToast(resData.warning, "warning");
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
  const retryBtn = e.target.closest(".retry-btn");
  if (retryBtn) {
    fetchData();
    return;
  }
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
    const password = await requestAdminPassword({
      title: "ยืนยันการลบรายการ",
      message: "กรอกรหัส Admin เพื่อลบรายการนี้"
    });
    if (!password) return;
    
    const displayDate = formatThaiDate(matchedTx.date);
    const confirmMessage = `คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้?\n\n` +
                           `📅 วันที่: ${displayDate}\n` +
                           `🔄 ประเภท: ${matchedTx.type}\n` +
                           `💵 จำนวนเงิน: ${formatCurrency(matchedTx.amount)} บาท\n` +
                           `📝 รายละเอียด: ${matchedTx.details}`;
    
    if (confirm(confirmMessage)) {
      await executeDelete(timestamp, password);
    }
  }
}

/**
 * Send DELETE request to API
 */
async function executeDelete(timestamp, password) {
  if (!webAppUrl) return;
  
  showToast("กำลังส่งคำขอลบรายการ...", "info");
  
  try {
    const resData = await fetchJsonWithRetry(webAppUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain"
      },
      body: JSON.stringify({
        action: "delete",
        timestamp: timestamp,
        password: password,
        requestId: createRequestId()
      }),
      redirect: "follow"
    }, { attempts: 2, timeoutMs: 20000 });
    
    if (resData.status === "success") {
      showToast(resData.message || "ลบรายการเรียบร้อยแล้ว", "success");
      if (resData.warning) showToast(resData.warning, "warning");
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
    return Promise.resolve(null);
  }
  if (adminPasswordResolver) resolveAdminPassword(null);
  lastFocusedElement = document.activeElement;
  adminModalTitle.textContent = title || "ยืนยันรหัส Admin";
  adminModalMessage.textContent = message || "กรอกรหัสเพื่อดำเนินการต่อ";
  adminPasswordInput.value = "";
  adminPasswordError.classList.add("hidden");
  adminPasswordModal.classList.add("active");
  adminPasswordModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  setTimeout(() => adminPasswordInput.focus(), 80);
  safeCreateIcons();

  return new Promise((resolve) => {
    adminPasswordResolver = resolve;
  });
}

function submitAdminPassword() {
  const password = adminPasswordInput.value;
  if (password) {
    resolveAdminPassword(password);
    return;
  }
  adminPasswordError.textContent = "กรุณากรอกรหัส Admin";
  adminPasswordError.classList.remove("hidden");
  adminPasswordInput.select();
}

function resolveAdminPassword(result) {
  if (!adminPasswordResolver) return;
  const resolver = adminPasswordResolver;
  adminPasswordResolver = null;
  adminPasswordModal.classList.remove("active");
  adminPasswordModal.setAttribute("aria-hidden", "true");
  if (!transactionModal.classList.contains("active")) document.body.classList.remove("modal-open");
  adminPasswordInput.value = "";
  resolver(result);
  restoreLastFocus();
}
function renderImageLink(transaction) {
  if (!transaction.imageUrl) return "-";
  const title = transaction.imageName || "เปิดรูปภาพ";
  return `
    <a class="image-link" href="${escapeAttribute(transaction.imageUrl)}" target="_blank" rel="noopener" title="${escapeAttribute(title)}" aria-label="${escapeAttribute(title)}">
      <i data-lucide="image"></i>
    </a>
  `;
}

async function handleOpenSheetClick() {
  const password = await requestAdminPassword({
    title: "เปิด Google Sheet",
    message: "กรอกรหัส Admin เพื่อเปิดไฟล์ Google Sheet"
  });
  if (!password) return;

  const sheetWindow = window.open("about:blank", "_blank");
  try {
    const sheetUrl = await resolveGoogleSheetUrl(password);
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

async function resolveGoogleSheetUrl(password) {
  const data = await fetchJsonWithRetry(webAppUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "sheetUrl", password, requestId: createRequestId() }),
    redirect: "follow"
  }, { attempts: 2, timeoutMs: 15000 });
  if (data.status !== "success") throw new Error(data.message || "ไม่สามารถยืนยันสิทธิ์ได้");
  return data.spreadsheetUrl || "";
}

async function getAttachmentPayload() {
  if (!txAttachmentInput || !txAttachmentInput.files || txAttachmentInput.files.length === 0) {
    return null;
  }
  const file = txAttachmentInput.files[0];
  if (!file.type || !file.type.startsWith("image/")) {
    throw new Error("กรุณาแนบไฟล์รูปภาพเท่านั้น");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("ไฟล์รูปภาพต้องมีขนาดไม่เกิน 5 MB");
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createRequestId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

async function fetchJsonWithRetry(url, options = {}, { attempts = 3, timeoutMs = 12000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) {
        const error = new Error(`HTTP error! status: ${response.status}`);
        error.retryable = response.status >= 500;
        throw error;
      }
      return await response.json();
    } catch (error) {
      lastError = error.name === "AbortError" ? new Error("หมดเวลารอการตอบกลับจากเซิร์ฟเวอร์") : error;
      const retryable = error.name === "AbortError" || error instanceof TypeError || error.retryable;
      if (!retryable || attempt === attempts) break;
      await new Promise(resolve => setTimeout(resolve, 500 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function safeCreateIcons() {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

function handleGlobalKeydown(event) {
  const activeModal = adminPasswordModal.classList.contains("active")
    ? adminPasswordModal
    : transactionModal.classList.contains("active")
      ? transactionModal
      : null;
  if (!activeModal) return;

  if (event.key === "Escape") {
    event.preventDefault();
    if (activeModal === adminPasswordModal) resolveAdminPassword(null);
    else if (!btnSubmitModal.disabled) closeTransactionModal();
    return;
  }

  if (event.key === "Tab") trapFocus(event, activeModal);
}

function trapFocus(event, modal) {
  const focusable = [...modal.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
  )].filter(element => element.offsetParent !== null);
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function restoreLastFocus() {
  if (lastFocusedElement && document.contains(lastFocusedElement)) {
    lastFocusedElement.focus();
  }
  lastFocusedElement = null;
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
  
  const icon = document.createElement("i");
  icon.setAttribute("data-lucide", iconName);
  const messageElement = document.createElement("div");
  messageElement.className = "toast-message";
  messageElement.textContent = String(message ?? "");
  toast.append(icon, messageElement);
  
  toastContainer.appendChild(toast);
  safeCreateIcons();
  
  // Trigger slide and fade out
  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3500);
}
