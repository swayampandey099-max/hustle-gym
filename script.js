// ==================== SUPABASE CONFIG ====================
const SUPABASE_URL = "https://wqehzuveoqbnwyrjqspb.supabase.co"; 
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxZWh6dXZlb3Fibnd5cmpxc3BiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxOTE1MjQsImV4cCI6MjEwMTc2NzUyNH0.Tghgkh7JJfl-5Bv7MlfYDJJarMPQmspDFZf4t1FteYQ";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DEFAULT_USER = "admin";
const DEFAULT_PASS = "1234";

// ==================== STATE ====================
let members = [];
let currentTab = "members";
let selectedMemberId = null;
let selectedDetailMonth = "";
let addPlanSelected = "cardio";

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

// ==================== SMART DUE DATE & HIGHLIGHT LOGIC ====================

function getMemberPaymentStatus(member) {
  const isMarkedPaid = member.fees?.[todayKey] === "paid";
  if (isMarkedPaid) {
    return { type: "PAID", text: "Paid", colorClass: "chip-ok", days: 0 };
  }

  const isMarkedDueManually = member.fees?.[todayKey] === "due";
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rawJoinDate = member.joinDate || member.joindate;
  if (!rawJoinDate) {
    return { type: "UPCOMING", text: "Unset", colorClass: "chip-default", days: 0 };
  }

  const joinDate = new Date(rawJoinDate);
  const joinDay = joinDate.getDate();

  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
  const targetDay = Math.min(joinDay, lastDay);

  const dueDate = new Date(currentYear, currentMonth, targetDay);
  dueDate.setHours(0, 0, 0, 0);

  const diffTime = today.getTime() - dueDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays > 0 || isMarkedDueManually) {
    const overdueDays = diffDays > 0 ? diffDays : 1;
    return {
      type: "OVERDUE",
      text: `${overdueDays}d Overdue`,
      colorClass: "chip-red",
      days: overdueDays,
      dueDateStr: `${targetDay} ${MONTHS[currentMonth]}`
    };
  } else if (diffDays >= -3 && diffDays <= 0) {
    const daysLeft = Math.abs(diffDays);
    return {
      type: "DUE_SOON",
      text: daysLeft === 0 ? "Due Today" : `Due in ${daysLeft}d`,
      colorClass: "bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold text-[10px]",
      days: diffDays,
      dueDateStr: `${targetDay} ${MONTHS[currentMonth]}`
    };
  } else {
    return {
      type: "UPCOMING",
      text: `Due ${targetDay}th`,
      colorClass: "chip-default",
      days: diffDays,
      dueDateStr: `${targetDay} ${MONTHS[currentMonth]}`
    };
  }
}

function sendWhatsAppReminder(member) {
  const planInfo = PLANS[member.plan] || PLANS.cardio;
  const statusInfo = getMemberPaymentStatus(member);

  let msg = `Hi ${member.name}! HUSTLE GYM se aapki monthly fees (₹${planInfo.price}) `;
  if (statusInfo.days > 0) {
    msg += `${statusInfo.days} din se overdue hai (Due Date: ${statusInfo.dueDateStr}). `;
  } else {
    msg += `due hai. `;
  }
  msg += `Kripya karke payment update karayein. Thank you! 💪🏋️‍♂️`;

  const cleanPhone = String(member.phone).replace(/\D/g, "");
  const waUrl = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`;
  window.open(waUrl, "_blank");
}

// ==================== DATABASE API CALLS ====================

async function fetchMembers() {
  const { data, error } = await supabaseClient
    .from('members')
    .select('*');

  if (error) {
    console.error("Supabase Error:", error.message || error);
  } else {
    members = data || [];
    renderViews();
  }
}

async function dbAddMember(newMember) {
  const { error } = await supabaseClient.from('members').insert([newMember]);
  if (error) {
    alert("Error adding member: " + error.message);
  } else {
    await fetchMembers();
    hideAddModal();
  }
}

async function dbUpdateMember(id, updatedFields) {
  const { error } = await supabaseClient.from('members').update(updatedFields).eq('id', id);
  if (error) {
    alert("Error updating member: " + error.message);
  } else {
    await fetchMembers();
  }
}

async function dbDeleteMember(id) {
  const { error } = await supabaseClient.from('members').delete().eq('id', id);
  if (error) {
    alert("Error deleting member: " + error.message);
  } else {
    selectedMemberId = null;
    hideDeleteModal();
    await fetchMembers();
  }
}

// ==================== AUTHENTICATION ====================

function initLogin() {
  const loginForm = document.getElementById("login-form");
  if (!loginForm) return;

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const u = document.getElementById("login-username")?.value.trim();
    const p = document.getElementById("login-password")?.value.trim();
    const err = document.getElementById("auth-error");

    if (u === DEFAULT_USER && p === DEFAULT_PASS) {
      document.getElementById("auth-screen")?.classList.add("hidden");
      document.getElementById("main-app")?.classList.remove("hidden");
      initApp();
    } else {
      err?.classList.remove("hidden");
    }
  });

  document.getElementById("btn-logout")?.addEventListener("click", () => {
    document.getElementById("main-app")?.classList.add("hidden");
    document.getElementById("auth-screen")?.classList.remove("hidden");
  });
}

// ==================== NAVIGATION & RENDER ====================

function updateNavigationUI() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    const tab = btn.dataset.tab;
    const isActive = tab === currentTab && !selectedMemberId;
    const icon = btn.querySelector(".nav-icon");
    const text = btn.querySelector(".nav-text");

    if (isActive) {
      icon?.classList.remove("text-white/60");
      icon?.classList.add("text-[#FF6B6B]");
      text?.classList.remove("text-white/60");
      text?.classList.add("text-[#FF6B6B]");
    } else {
      icon?.classList.remove("text-[#FF6B6B]");
      icon?.classList.add("text-white/60");
      text?.classList.remove("text-[#FF6B6B]");
      text?.classList.add("text-white/60");
    }
  });

  const dueCount = members.filter((m) => {
    const st = getMemberPaymentStatus(m);
    return st.type === "OVERDUE";
  }).length;

  const badge = document.getElementById("due-badge");
  if (badge) {
    if (dueCount > 0) {
      badge.textContent = dueCount;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }

  const bottomNav = document.getElementById("bottom-nav");
  if (bottomNav) {
    selectedMemberId ? bottomNav.classList.add("hidden") : bottomNav.classList.remove("hidden");
  }
}

function renderViews() {
  updateNavigationUI();
  document.querySelectorAll(".view-section").forEach((sec) => sec.classList.add("hidden"));

  if (selectedMemberId) {
    document.getElementById("view-detail")?.classList.remove("hidden");
    renderDetailView();
  } else if (currentTab === "members") {
    document.getElementById("view-members")?.classList.remove("hidden");
    renderMembersView();
  } else if (currentTab === "fees") {
    document.getElementById("view-fees")?.classList.remove("hidden");
    renderFeesView();
  } else if (currentTab === "due") {
    document.getElementById("view-due")?.classList.remove("hidden");
    renderDueView();
  }

  refreshIcons();
}

function createAvatarHTML(name) {
  const initials = (name || "M").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return `
    <div class="w-10 h-10 rounded-xl glass flex items-center justify-center shrink-0 border border-white/10">
      <span class="font-bold text-white text-xs tracking-tight">${initials}</span>
    </div>
  `;
}

function renderMembersView() {
  const countEl = document.getElementById("members-count");
  if (countEl) countEl.textContent = `${members.length} active members`;

  const container = document.getElementById("members-list");
  if (!container) return;

  if (members.length === 0) {
    container.innerHTML = `<p class="text-center py-12 text-xs text-white/40">No members found.</p>`;
    return;
  }

  container.innerHTML = members
    .map((m, i) => {
      const statusInfo = getMemberPaymentStatus(m);
      const present = (m.attendance?.[todayKey] || []).length;
      const planInfo = PLANS[m.plan] || PLANS.cardio;

      const borderGlow = statusInfo.type === "OVERDUE" ? "border-red-500/40 bg-red-950/10" : "border-white/10";

      return `
      <button data-id="${m.id}" class="btn-member-card glass glass-sheen relative w-full rounded-2xl p-3 flex items-center gap-3 active:scale-[0.98] transition text-left border ${borderGlow}">
        <span class="font-mono text-[10px] text-white/40 w-4">${String(i + 1).padStart(2, "0")}</span>
        ${createAvatarHTML(m.name)}
        <div class="flex-1 min-w-0">
          <p class="font-bold text-sm text-white truncate">${m.name}</p>
          <p class="text-white/60 text-[11px] mt-0.5">${present} days present · ${planInfo.label}</p>
        </div>
        <span class="${statusInfo.colorClass}">${statusInfo.text}</span>
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
  if (!container) return;

  container.innerHTML = members
    .map((m) => {
      const status = m.fees?.[todayKey];
      const statusInfo = getMemberPaymentStatus(m);
      const paidStyle = status === "paid" ? 'style="background: linear-gradient(135deg, #22C55E, #15803D)"' : "";
      const dueStyle = status === "due" ? 'style="background: linear-gradient(135deg, #EF4444, #B91C1C)"' : "";
      const planInfo = PLANS[m.plan] || PLANS.cardio;

      return `
      <div class="glass glass-sheen relative rounded-2xl p-3 flex items-center gap-3">
        ${createAvatarHTML(m.name)}
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <p class="font-bold text-sm text-white truncate">${m.name}</p>
            <span class="${statusInfo.colorClass}">${statusInfo.text}</span>
          </div>
          <p class="text-white/60 text-xs mt-0.5 font-mono">₹${planInfo.price} · ${planInfo.label}</p>
        </div>
        <div class="flex gap-1.5 shrink-0">
          <button data-id="${m.id}" data-status="paid" ${paidStyle} class="btn-mark-fee px-2.5 py-1.5 rounded-xl text-[10px] font-bold uppercase transition active:scale-95 ${status === "paid" ? "text-white" : "glass text-white/80"}">
            Paid
          </button>
          <button data-id="${m.id}" data-status="due" ${dueStyle} class="btn-mark-fee px-2.5 py-1.5 rounded-xl text-[10px] font-bold uppercase transition active:scale-95 ${status === "due" ? "text-white" : "glass text-white/80"}">
            Due
          </button>
        </div>
      </div>
    `;
    })
    .join("");

  container.querySelectorAll(".btn-mark-fee").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const status = btn.dataset.status;
      const m = members.find((item) => item.id === id);
      if (m) {
        const updatedFees = { ...(m.fees || {}), [todayKey]: status };
        await dbUpdateMember(id, { fees: updatedFees });
      }
    });
  });
}

function renderDueView() {
  const dueMembers = members.filter((m) => {
    const st = getMemberPaymentStatus(m);
    return st.type === "OVERDUE";
  });

  document.getElementById("due-summary-text").textContent = `${dueMembers.length} member(s) overdue for fees`;

  const container = document.getElementById("due-list");
  if (!container) return;

  if (dueMembers.length === 0) {
    container.innerHTML = `<p class="text-center py-12 text-xs text-white/40">Awesome! Sabhi members ki fees clear hai.</p>`;
    return;
  }

  container.innerHTML = dueMembers
    .map((m) => {
      const planInfo = PLANS[m.plan] || PLANS.cardio;
      const statusInfo = getMemberPaymentStatus(m);
      const joinDateStr = m.joinDate || m.joindate || "N/A";

      return `
      <div class="glass-red glass-sheen relative rounded-2xl p-4 space-y-3 border border-red-500/30">
        <div class="flex items-center gap-3">
          ${createAvatarHTML(m.name)}
          <div class="flex-1 min-w-0">
            <p class="font-bold text-sm text-white truncate">${m.name}</p>
            <p class="text-white/60 text-xs mt-0.5 font-mono">Joined ${joinDateStr}</p>
          </div>
          <span class="chip chip-red font-bold">${statusInfo.text}</span>
        </div>
        <div class="flex items-center justify-between pt-2 border-t border-white/10 text-xs font-mono text-white/80">
          <span class="text-red-300 font-bold">₹${planInfo.price} (${planInfo.label})</span>
          <button data-id="${m.id}" class="btn-send-wa px-3 py-1.5 rounded-xl bg-emerald-600/30 text-emerald-300 hover:bg-emerald-600 hover:text-white font-bold text-[11px] flex items-center gap-1.5 transition">
            <i data-lucide="message-circle" class="w-3.5 h-3.5"></i> WhatsApp
          </button>
        </div>
      </div>
    `;
    })
    .join("");

  container.querySelectorAll(".btn-send-wa").forEach((btn) => {
    btn.addEventListener("click", () => {
      const m = members.find((item) => item.id === btn.dataset.id);
      if (m) sendWhatsAppReminder(m);
    });
  });
}

function renderDetailView() {
  const member = members.find((m) => m.id === selectedMemberId);
  if (!member) return;

  const initials = member.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const planInfo = PLANS[member.plan] || PLANS.cardio;
  const statusInfo = getMemberPaymentStatus(member);

  document.getElementById("detail-avatar").querySelector("span").textContent = initials;
  document.getElementById("detail-name").textContent = member.name;
  document.getElementById("detail-plan-chip").textContent = `${planInfo.label} · ₹${planInfo.price}`;

  const phoneEl = document.getElementById("detail-phone");
  phoneEl.textContent = member.phone;
  phoneEl.href = `tel:${member.phone}`;

  document.getElementById("detail-joined").textContent = member.joinDate || member.joindate || "N/A";

  const [y, m] = selectedDetailMonth.split("-");
  const monthName = `${MONTHS[Number(m) - 1]} ${y}`;
  document.getElementById("detail-fee-month").textContent = `${monthName} Fee`;

  const feeStatus = member.fees?.[selectedDetailMonth];
  const feeStatusText = document.getElementById("detail-fee-status");
  const btnPaid = document.getElementById("btn-set-paid");
  const btnDue = document.getElementById("btn-set-due");

  btnPaid.removeAttribute("style");
  btnDue.removeAttribute("style");

  if (feeStatus === "paid") {
    feeStatusText.textContent = "PAID";
    feeStatusText.className = "text-emerald-400 font-bold";
    btnPaid.style.background = "linear-gradient(135deg, #22C55E, #15803D)";
  } else if (feeStatus === "due" || statusInfo.type === "OVERDUE") {
    feeStatusText.textContent = `DUE (${statusInfo.text})`;
    feeStatusText.className = "text-red-400 font-bold";
    btnDue.style.background = "linear-gradient(135deg, #EF4444, #B91C1C)";
  } else {
    feeStatusText.textContent = "NOT SET";
    feeStatusText.className = "text-white/50 font-bold";
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
      const bgStyle = isPresent ? 'style="background: linear-gradient(135deg, #FF6B6B, #D32F2F)"' : "";
      return `
      <button data-day="${day}" ${bgStyle} class="btn-attendance-day aspect-square rounded-xl flex items-center justify-center text-xs font-mono font-bold transition active:scale-90 ${isPresent ? "text-white shadow-lg" : "glass text-white/70 hover:text-white"}">
        ${day}
      </button>
    `;
    })
    .join("");

  gridContainer.querySelectorAll(".btn-attendance-day").forEach((btn) => {
    btn.addEventListener("click", () => toggleAttendanceDay(Number(btn.dataset.day)));
  });
}

async function toggleAttendanceDay(day) {
  if (!selectedMemberId) return;
  const member = members.find((m) => m.id === selectedMemberId);
  if (!member) return;

  const presentDays = new Set(member.attendance?.[selectedDetailMonth] || []);
  presentDays.has(day) ? presentDays.delete(day) : presentDays.add(day);

  const sortedDays = Array.from(presentDays).sort((a, b) => a - b);
  const updatedAttendance = { ...(member.attendance || {}), [selectedDetailMonth]: sortedDays };

  await dbUpdateMember(selectedMemberId, { attendance: updatedAttendance });
}

// ==================== MODALS & EVENTS ====================

function showAddModal() {
  document.getElementById("input-name").value = "";
  document.getElementById("input-phone").value = "";
  document.getElementById("input-join-date").value = new Date().toISOString().slice(0, 10);
  document.getElementById("modal-add").classList.remove("hidden");
}

function hideAddModal() {
  document.getElementById("modal-add").classList.add("hidden");
}

function showDeleteModal() {
  document.getElementById("modal-delete").classList.remove("hidden");
}

function hideDeleteModal() {
  document.getElementById("modal-delete").classList.add("hidden");
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function bindEvents() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentTab = btn.dataset.tab;
      selectedMemberId = null;
      renderViews();
    });
  });

  document.getElementById("btn-back-detail")?.addEventListener("click", () => {
    selectedMemberId = null;
    renderViews();
  });

  document.getElementById("btn-set-paid")?.addEventListener("click", async () => {
    const member = members.find((m) => m.id === selectedMemberId);
    if (member) {
      const updatedFees = { ...(member.fees || {}), [selectedDetailMonth]: "paid" };
      await dbUpdateMember(selectedMemberId, { fees: updatedFees });
    }
  });

  document.getElementById("btn-set-due")?.addEventListener("click", async () => {
    const member = members.find((m) => m.id === selectedMemberId);
    if (member) {
      const updatedFees = { ...(member.fees || {}), [selectedDetailMonth]: "due" };
      await dbUpdateMember(selectedMemberId, { fees: updatedFees });
    }
  });

  document.getElementById("btn-open-add")?.addEventListener("click", showAddModal);
  document.getElementById("btn-close-add")?.addEventListener("click", hideAddModal);

  document.querySelectorAll(".plan-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      addPlanSelected = btn.dataset.plan;
      document.querySelectorAll(".plan-option").forEach((b) => b.classList.remove("border-[#FF6B6B]"));
      btn.classList.add("border-[#FF6B6B]");
    });
  });

  document.getElementById("btn-submit-add")?.addEventListener("click", async () => {
    const name = document.getElementById("input-name").value.trim();
    const phone = document.getElementById("input-phone").value.trim();
    const joinDate = document.getElementById("input-join-date").value;

    if (!name || !phone || !joinDate) return alert("All fields are required!");

    await dbAddMember({
      id: uid(),
      name,
      phone,
      plan: addPlanSelected,
      joinDate,
      fees: {},
      attendance: {},
    });
  });

  document.getElementById("btn-delete-member")?.addEventListener("click", showDeleteModal);
  document.getElementById("btn-cancel-delete")?.addEventListener("click", hideDeleteModal);
  document.getElementById("btn-confirm-delete")?.addEventListener("click", async () => {
    if (selectedMemberId) await dbDeleteMember(selectedMemberId);
  });
}

function initApp() {
  bindEvents();
  fetchMembers();
}

document.addEventListener("DOMContentLoaded", () => {
  initLogin();
  refreshIcons();
});
