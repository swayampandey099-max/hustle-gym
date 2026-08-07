// ---------- Helpers & Constants ----------
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const daysInMonth = (key) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};

const todayKey = monthKey();
const uid = () => Math.random().toString(36).slice(2, 10);

const PLANS = {
  cardio: { label: "Cardio + Weights", price: 1200 },
  basic: { label: "Weights Only", price: 800 },
};

// Owner Credentials
const DEFAULT_OWNER = {
  username: "hustle_owner",
  password: "hustlegymowner"
};
const AUTH_KEY = "gym_owner_creds";

const seedMembers = () => [
  {
    id: uid(),
    name: "Rohit Sharma",
    phone: "9876543210",
    joinDate: "2026-03-14",
    plan: "cardio",
    fees: { [todayKey]: "paid" },
    attendance: { [todayKey]: [2, 3, 5, 6, 7, 9, 10] },
  },
  {
    id: uid(),
    name: "Ankita Verma",
    phone: "9823456712",
    joinDate: "2025-11-02",
    plan: "basic",
    fees: { [todayKey]: "due" },
    attendance: { [todayKey]: [1, 2, 4] },
  },
  {
    id: uid(),
    name: "Vikram Singh",
    phone: "9911223344",
    joinDate: "2026-06-20",
    plan: "cardio",
    fees: {},
    attendance: { [todayKey]: [1, 2, 3, 4, 6, 7, 8, 9, 11, 12] },
  },
];

// ---------- Application State ----------
let members = [];
let currentTab = "members";
let selectedMemberId = null;
let selectedDetailMonth = todayKey;
let addPlanSelected = "cardio";

// ---------- Owner Auth Management ----------
function initOwnerAuth() {
  if (!localStorage.getItem(AUTH_KEY)) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(DEFAULT_OWNER));
  }
}

function handleAuthSubmit() {
  const usernameInput = document.getElementById("auth-username").value.trim();
  const passwordInput = document.getElementById("auth-password").value.trim();
  const errorEl = document.getElementById("auth-error");

  errorEl.classList.add("hidden");

  if (!usernameInput || !passwordInput) {
    errorEl.textContent = "Please enter both username and password.";
    errorEl.classList.remove("hidden");
    return;
  }

  const savedCreds = JSON.parse(localStorage.getItem(AUTH_KEY) || JSON.stringify(DEFAULT_OWNER));

  if (usernameInput === savedCreds.username && passwordInput === savedCreds.password) {
    document.getElementById("auth-screen").classList.add("hidden");
    initApp();
  } else {
    errorEl.textContent = "Invalid username or password.";
    errorEl.classList.remove("hidden");
  }
}

// ---------- Storage Wrappers ----------
async function loadMembers() {
  try {
    if (window.storage && typeof window.storage.get === "function") {
      const res = await window.storage.get("members", false);
      if (res && res.value) return JSON.parse(res.value);
    } else {
      const res = localStorage.getItem("members");
      if (res) return JSON.parse(res);
    }
  } catch (e) {
    console.error("Storage load error:", e);
  }
  return null;
}

async function saveMembers(data) {
  try {
    if (window.storage && typeof window.storage.set === "function") {
      await window.storage.set("members", JSON.stringify(data), false);
    } else {
      localStorage.setItem("members", JSON.stringify(data));
    }
  } catch (e) {
    console.error("Save failed", e);
  }
}

// ---------- UI Utilities ----------
function createAvatarHTML(name, size = 44) {
  const initials = (name || "M").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const fontSize = Math.round(size * 0.34);
  return `
    <div style="width: ${size}px; height: ${size}px; border-radius: 12px;" class="glass flex items-center justify-center shrink-0">
      <span style="font-size: ${fontSize}px;" class="font-bold text-white tracking-tight">${initials}</span>
    </div>
  `;
}

function attachRippleEffect() {
  document.querySelectorAll(".ripple-surface").forEach((el) => {
    if (el.dataset.rippleBound) return;
    el.dataset.rippleBound = "true";

    el.addEventListener("pointerdown", (e) => {
      const rect = el.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;

      const dot = document.createElement("span");
      const isRed = el.classList.contains("tint-red");
      dot.className = `ripple-dot ${isRed ? "tint-red" : ""}`;
      dot.style.width = dot.style.height = `${size}px`;
      dot.style.left = `${x}px`;
      dot.style.top = `${y}px`;

      el.appendChild(dot);
      setTimeout(() => dot.remove(), 650);
    });
  });
}

function refreshIcons() {
  if (window.lucide) {
    lucide.createIcons();
  }
}

// ---------- Navigation UI ----------
function updateNavigationUI() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    const tab = btn.dataset.tab;
    const isActive = tab === currentTab && !selectedMemberId;
    const icon = btn.querySelector(".nav-icon");
    const text = btn.querySelector(".nav-text");

    if (isActive) {
      icon?.classList.remove("text-white");
      icon?.classList.add("text-[#FF6B6B]");
      text?.classList.remove("text-white");
      text?.classList.add("text-[#FF6B6B]");
    } else {
      icon?.classList.remove("text-[#FF6B6B]");
      icon?.classList.add("text-white");
      text?.classList.remove("text-[#FF6B6B]");
      text?.classList.add("text-white");
    }
  });

  const dueCount = members.filter((m) => m.fees?.[todayKey] === "due").length;
  const badge = document.getElementById("due-badge");
  if (dueCount > 0) {
    badge.textContent = dueCount;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }

  const bottomNav = document.getElementById("bottom-nav");
  if (selectedMemberId) {
    bottomNav.classList.add("hidden");
  } else {
    bottomNav.classList.remove("hidden");
  }
}

function renderViews() {
  updateNavigationUI();

  document.querySelectorAll(".view-section").forEach((sec) => sec.classList.add("hidden"));

  if (selectedMemberId) {
    document.getElementById("view-detail").classList.remove("hidden");
    renderDetailView();
  } else if (currentTab === "members") {
    document.getElementById("view-members").classList.remove("hidden");
    renderMembersView();
  } else if (currentTab === "fees") {
    document.getElementById("view-fees").classList.remove("hidden");
    renderFeesView();
  } else if (currentTab === "due") {
    document.getElementById("view-due").classList.remove("hidden");
    renderDueView();
  }

  attachRippleEffect();
  refreshIcons();
}

// ---------- Render Views ----------
function renderMembersView() {
  document.getElementById("members-count").textContent = `${members.length} active members`;
  const container = document.getElementById("members-list");

  if (members.length === 0) {
    container.innerHTML = `
      <div class="text-center py-16">
        <i data-lucide="dumbbell" class="w-8 h-8 mx-auto text-white mb-3"></i>
        <p class="text-white text-sm">No members yet. Add your first one.</p>
      </div>`;
    return;
  }

  container.innerHTML = members
    .map((m, i) => {
      const status = m.fees?.[todayKey];
      const present = (m.attendance?.[todayKey] || []).length;
      let chipHTML = '<span class="chip chip-default">Unset</span>';

      if (status === "paid") chipHTML = '<span class="chip chip-ok">Paid</span>';
      if (status === "due") chipHTML = '<span class="chip chip-red">Due</span>';

      const planInfo = PLANS[m.plan] || PLANS.cardio;

      return `
      <button data-id="${m.id}" class="btn-member-card ripple-surface glass glass-sheen relative w-full rounded-2xl p-3.5 flex items-center gap-3 active:scale-[0.98] transition text-left">
        <span class="font-mono text-[11px] text-white w-5">${String(i + 1).padStart(2, "0")}</span>
        ${createAvatarHTML(m.name)}
        <div class="flex-1 min-w-0">
          <p class="font-bold text-white truncate">${m.name}</p>
          <p class="text-white text-xs mt-0.5">${present} days present · ${planInfo.label}</p>
        </div>
        ${chipHTML}
      </button>
    `;
    })
    .join("");

  container.querySelectorAll(".btn-member-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedMemberId = btn.dataset.id;
      selectedDetailMonth = todayKey;
      renderViews();
    });
  });
}

function renderFeesView() {
  const paid = members.filter((m) => m.fees?.[todayKey] === "paid");
  const pending = members.filter((m) => m.fees?.[todayKey] !== "paid");

  document.getElementById("fees-paid-count").textContent = paid.length;
  document.getElementById("fees-pending-count").textContent = pending.length;

  const container = document.getElementById("fees-list");

  if (members.length === 0) {
    container.innerHTML = `
      <div class="text-center py-16">
        <i data-lucide="wallet" class="w-8 h-8 mx-auto text-white mb-3"></i>
        <p class="text-white text-sm">No members to bill yet.</p>
      </div>`;
    return;
  }

  container.innerHTML = members
    .map((m) => {
      const status = m.fees?.[todayKey];
      const paidStyle = status === "paid" ? 'style="background: linear-gradient(135deg, #22C55E, #15803D)"' : "";
      const dueStyle = status === "due" ? 'style="background: linear-gradient(135deg, #EF4444, #B91C1C)"' : "";
      const planInfo = PLANS[m.plan] || PLANS.cardio;

      return `
      <div class="glass glass-sheen relative rounded-2xl p-3.5 flex items-center gap-3">
        ${createAvatarHTML(m.name, 40)}
        <div class="flex-1 min-w-0">
          <p class="font-bold text-white truncate">${m.name}</p>
          <p class="text-white text-xs mt-0.5 font-mono">₹${planInfo.price} · ${planInfo.label}</p>
        </div>
        <div class="flex gap-2 shrink-0">
          <button data-id="${m.id}" data-status="paid" ${paidStyle} class="btn-mark-fee ripple-surface px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition active:scale-95 ${status === "paid" ? "text-white" : "glass text-white"}">
            Paid
          </button>
          <button data-id="${m.id}" data-status="due" ${dueStyle} class="btn-mark-fee ripple-surface tint-red px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition active:scale-95 ${status === "due" ? "text-white" : "glass text-white"}">
            Due
          </button>
        </div>
      </div>
    `;
    })
    .join("");

  container.querySelectorAll(".btn-mark-fee").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      markFee(btn.dataset.id, btn.dataset.status);
    });
  });
}

function renderDueView() {
  const due = members.filter((m) => m.fees?.[todayKey] === "due");
  document.getElementById("due-summary-text").textContent = `${due.length} member${due.length !== 1 ? "s" : ""} unpaid this month`;

  const container = document.getElementById("due-list");

  if (due.length === 0) {
    container.innerHTML = `
      <div class="text-center py-16">
        <i data-lucide="check-circle-2" class="w-8 h-8 mx-auto text-white mb-3"></i>
        <p class="text-white text-sm">All caught up — nobody's due.</p>
      </div>`;
    return;
  }

  container.innerHTML = due
    .map((m) => {
      const planInfo = PLANS[m.plan] || PLANS.cardio;
      return `
      <div class="glass-red glass-sheen relative rounded-2xl p-4">
        <div class="flex items-center gap-3">
          ${createAvatarHTML(m.name, 44)}
          <div class="flex-1 min-w-0">
            <p class="font-bold text-white truncate">${m.name}</p>
            <p class="text-white text-xs mt-0.5 font-mono">Joined ${m.joinDate}</p>
          </div>
          <span class="chip chip-red">₹${planInfo.price} due</span>
        </div>
        <div class="flex items-center gap-4 mt-3 pt-3 border-t border-white/20">
          <div class="flex items-center gap-1.5 text-white text-xs font-mono">
            <i data-lucide="phone" class="w-3 h-3 text-white"></i> ${m.phone}
          </div>
          <div class="flex items-center gap-1.5 text-white text-xs">
            <i data-lucide="dumbbell" class="w-3 h-3 text-white"></i> ${planInfo.label}
          </div>
        </div>
      </div>
    `;
    })
    .join("");
}

function renderDetailView() {
  const member = members.find((m) => m.id === selectedMemberId);
  if (!member) return;

  const initials = member.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const planInfo = PLANS[member.plan] || PLANS.cardio;

  document.getElementById("detail-avatar").querySelector("span").textContent = initials;
  document.getElementById("detail-name").textContent = member.name;
  document.getElementById("detail-plan-chip").textContent = `${planInfo.label} · ₹${planInfo.price}`;
  document.getElementById("detail-phone").textContent = member.phone;
  document.getElementById("detail-joined").textContent = member.joinDate;

  const [y, m] = selectedDetailMonth.split("-");
  const monthName = `${MONTHS[Number(m) - 1]} ${y}`;
  document.getElementById("detail-fee-month").textContent = monthName;

  const feeStatus = member.fees?.[selectedDetailMonth];
  const feeStatusText = document.getElementById("detail-fee-status");
  const btnPaid = document.getElementById("btn-set-paid");
  const btnDue = document.getElementById("btn-set-due");

  btnPaid.removeAttribute("style");
  btnDue.removeAttribute("style");

  const paidIcon = btnPaid.querySelector("i, svg");
  const dueIcon = btnDue.querySelector("i, svg");

  if (paidIcon) paidIcon.setAttribute("class", "w-[18px] h-[18px] text-white");
  if (dueIcon) dueIcon.setAttribute("class", "w-[18px] h-[18px] text-white");

  if (feeStatus === "paid") {
    feeStatusText.textContent = "Paid";
    feeStatusText.className = "text-[#86EFAC] font-bold";
    btnPaid.style.background = "linear-gradient(135deg, #22C55E, #15803D)";
  } else if (feeStatus === "due") {
    feeStatusText.textContent = "Due";
    feeStatusText.className = "text-[#FCA5A5] font-bold";
    btnDue.style.background = "linear-gradient(135deg, #EF4444, #B91C1C)";
  } else {
    feeStatusText.textContent = "Not set";
    feeStatusText.className = "text-white font-bold";
  }

  const dim = daysInMonth(selectedDetailMonth);
  const presentDays = member.attendance?.[selectedDetailMonth] || [];

  document.getElementById("attendance-month-label").textContent = monthName;
  document.getElementById("attendance-count").textContent = presentDays.length;
  document.getElementById("attendance-days-total").textContent = dim;

  const gridContainer = document.getElementById("attendance-grid");
  gridContainer.innerHTML = Array.from({ length: dim }, (_, i) => i + 1)
    .map((day) => {
      const isPresent = presentDays.includes(day);
      const bgStyle = isPresent ? 'style="background: linear-gradient(135deg, #EF4444, #991B1B)"' : "";
      return `
      <button data-day="${day}" ${bgStyle} class="btn-attendance-day ripple-surface aspect-square rounded-lg flex items-center justify-center text-xs font-mono font-bold transition active:scale-90 ${isPresent ? "text-white shadow-[0_2px_8px_rgba(220,38,38,0.4)]" : "glass text-white"}">
        ${day}
      </button>
    `;
    })
    .join("");

  gridContainer.querySelectorAll(".btn-attendance-day").forEach((btn) => {
    btn.addEventListener("click", () => {
      toggleAttendanceDay(Number(btn.dataset.day));
    });
  });
}

// ---------- Data Action Logic ----------
function markFee(id, status) {
  members = members.map((m) => (m.id === id ? { ...m, fees: { ...m.fees, [todayKey]: status } } : m));
  saveMembers(members);
  renderViews();
}

function setDetailFee(status) {
  if (!selectedMemberId) return;
  members = members.map((m) => (m.id === selectedMemberId ? { ...m, fees: { ...m.fees, [selectedDetailMonth]: status } } : m));
  saveMembers(members);
  renderViews();
}

function toggleAttendanceDay(day) {
  if (!selectedMemberId) return;
  const member = members.find((m) => m.id === selectedMemberId);
  if (!member) return;

  const presentDays = new Set(member.attendance?.[selectedDetailMonth] || []);
  if (presentDays.has(day)) {
    presentDays.delete(day);
  } else {
    presentDays.add(day);
  }

  const sortedDays = Array.from(presentDays).sort((a, b) => a - b);
  members = members.map((m) => (m.id === selectedMemberId ? { ...m, attendance: { ...m.attendance, [selectedDetailMonth]: sortedDays } } : m));
  saveMembers(members);
  renderViews();
}

function shiftMonth(delta) {
  const [y, m] = selectedDetailMonth.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  selectedDetailMonth = monthKey(d);
  renderViews();
}

function deleteCurrentMember() {
  if (!selectedMemberId) return;
  members = members.filter((m) => m.id !== selectedMemberId);
  saveMembers(members);
  selectedMemberId = null;
  hideDeleteModal();
  renderViews();
}

function addMember(newMember) {
  members = [newMember, ...members];
  saveMembers(members);
  hideAddModal();
  renderViews();
}

// ---------- Modals Logic ----------
function showAddModal() {
  document.getElementById("input-name").value = "";
  document.getElementById("input-phone").value = "";
  document.getElementById("input-join-date").value = new Date().toISOString().slice(0, 10);
  document.getElementById("add-error").classList.add("hidden");

  addPlanSelected = "cardio";
  updatePlanSelectionUI();

  document.getElementById("modal-add").classList.remove("hidden");
}

function hideAddModal() {
  document.getElementById("modal-add").classList.add("hidden");
}

function updatePlanSelectionUI() {
  document.querySelectorAll(".plan-option").forEach((btn) => {
    const planKey = btn.dataset.plan;
    const priceText = btn.querySelector(".plan-price");
    const checkIcon = btn.querySelector(".check-icon");

    if (planKey === addPlanSelected) {
      btn.className = "plan-option ripple-surface text-left rounded-2xl p-4 transition relative glass-red";
      priceText.className = "plan-price font-mono font-bold text-xl text-[#FCA5A5]";
      checkIcon.classList.remove("hidden");
    } else {
      btn.className = "plan-option ripple-surface text-left rounded-2xl p-4 transition relative glass";
      priceText.className = "plan-price font-mono font-bold text-xl text-white";
      checkIcon.classList.add("hidden");
    }
  });
}

function showDeleteModal() {
  const member = members.find((m) => m.id === selectedMemberId);
  if (!member) return;
  document.getElementById("delete-title").textContent = `Remove ${member.name}?`;
  document.getElementById("modal-delete").classList.remove("hidden");
}

function hideDeleteModal() {
  document.getElementById("modal-delete").classList.add("hidden");
}

// ---------- Event Listeners Setup ----------
function bindEvents() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentTab = btn.dataset.tab;
      selectedMemberId = null;
      renderViews();
    });
  });

  document.getElementById("btn-back-detail").addEventListener("click", () => {
    selectedMemberId = null;
    renderViews();
  });

  document.getElementById("btn-set-paid").addEventListener("click", () => setDetailFee("paid"));
  document.getElementById("btn-set-due").addEventListener("click", () => setDetailFee("due"));

  document.getElementById("btn-month-prev").addEventListener("click", () => shiftMonth(-1));
  document.getElementById("btn-month-next").addEventListener("click", () => shiftMonth(1));

  document.getElementById("btn-open-add").addEventListener("click", showAddModal);
  document.getElementById("btn-close-add").addEventListener("click", hideAddModal);
  document.getElementById("modal-add-overlay").addEventListener("click", hideAddModal);

  document.querySelectorAll(".plan-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      addPlanSelected = btn.dataset.plan;
      updatePlanSelectionUI();
    });
  });

  document.getElementById("input-phone").addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/[^\d]/g, "");
  });

  document.getElementById("btn-submit-add").addEventListener("click", () => {
    const name = document.getElementById("input-name").value.trim();
    const phone = document.getElementById("input-phone").value.trim();
    const joinDate = document.getElementById("input-join-date").value;
    const errorEl = document.getElementById("add-error");
    const errorMsgEl = document.getElementById("add-error-msg");

    if (!name) {
      errorMsgEl.textContent = "Enter member's name.";
      errorEl.classList.remove("hidden");
      return;
    }
    if (!/^\d{7,15}$/.test(phone)) {
      errorMsgEl.textContent = "Enter a valid phone number.";
      errorEl.classList.remove("hidden");
      return;
    }
    if (!joinDate) {
      errorMsgEl.textContent = "Pick a date of join.";
      errorEl.classList.remove("hidden");
      return;
    }

    addMember({
      id: uid(),
      name,
      phone,
      plan: addPlanSelected,
      joinDate,
      fees: {},
      attendance: {},
    });
  });

  document.getElementById("btn-delete-member").addEventListener("click", showDeleteModal);
  document.getElementById("btn-cancel-delete").addEventListener("click", hideDeleteModal);
  document.getElementById("modal-delete-overlay").addEventListener("click", hideDeleteModal);
  document.getElementById("btn-confirm-delete").addEventListener("click", deleteCurrentMember);
}

// ---------- App Initialization ----------
async function initApp() {
  const loadedData = await loadMembers();
  members = loadedData && loadedData.length ? loadedData : seedMembers();

  const loadingScreen = document.getElementById("loading-screen");
  if (loadingScreen) loadingScreen.classList.add("hidden");

  document.getElementById("main-container").classList.remove("hidden");

  bindEvents();
  renderViews();
}

document.addEventListener("DOMContentLoaded", () => {
  initOwnerAuth();

  // Hide loading spinner so auth window is interactive
  const loadingScreen = document.getElementById("loading-screen");
  if (loadingScreen) {
    loadingScreen.classList.add("hidden");
  }

  const authForm = document.getElementById("auth-form");
  if (authForm) {
    authForm.addEventListener("submit", (e) => {
      e.preventDefault();
      handleAuthSubmit();
    });
  }
});