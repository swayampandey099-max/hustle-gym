// ==================== SUPABASE CONFIG ====================
const SUPABASE_URL = "https://wqehzuveoqbnwyrjqspb.supabase.co"; 
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxZWh6dXZlb3Fibnd5cmpxc3BiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxOTE1MjQsImV4cCI6MjEwMTc2NzUyNH0.Tghgkh7JJfl-5Bv7MlfYDJJarMPQmspDFZf4t1FteYQ";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const bcryptLib = window.dcodeIO?.bcrypt || window.bcrypt;

// ==================== STATE ====================
let members = [];
let currentTab = "members";
let selectedMemberId = null;
let selectedDetailMonth = "";
let addPlanSelected = "cardio";
let loggedInUser = null; 

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
  custom: { label: "Custom Plan", price: 0 }
};

// ==================== BILLING CALCULATOR ====================
function calculateBillingTotal() {
  let basePrice = PLANS[addPlanSelected]?.price || 1200;
  
  if (addPlanSelected === 'custom') {
    const customPriceInput = document.getElementById("input-custom-price")?.value;
    basePrice = customPriceInput ? parseFloat(customPriceInput) : 0;
  }

  const durationMonths = parseInt(document.getElementById("select-duration")?.value || "1");
  const discountPercent = parseInt(document.getElementById("select-discount")?.value || "0");

  const originalTotal = basePrice * durationMonths;
  const discountAmount = (originalTotal * discountPercent) / 100;
  const finalTotal = Math.round(originalTotal - discountAmount);

  const lblOriginal = document.getElementById("lbl-original-price");
  const lblDiscount = document.getElementById("lbl-discount-tag");
  const lblFinal = document.getElementById("lbl-final-price");

  if (lblOriginal) lblOriginal.textContent = `₹${originalTotal}`;
  if (lblDiscount) lblDiscount.textContent = `(${discountPercent}% OFF)`;
  if (lblFinal) lblFinal.textContent = `₹${finalTotal}`;

  return { originalTotal, discountPercent, finalTotal, durationMonths };
}

// ==================== DUE DATE LOGIC ====================
function getMemberPaymentStatus(member) {
  const isMarkedPaid = member.fees?.[todayKey] === "paid";
  if (isMarkedPaid) return { type: "PAID", text: "Paid", colorClass: "chip-ok", days: 0 };

  const isMarkedDueManually = member.fees?.[todayKey] === "due";
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rawJoinDate = member.joinDate || member.joindate;
  if (!rawJoinDate) return { type: "UPCOMING", text: "Unset", colorClass: "chip-default", days: 0 };

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
    return { type: "OVERDUE", text: `${overdueDays}d Overdue`, colorClass: "chip-red", days: overdueDays, dueDateStr: `${targetDay} ${MONTHS[currentMonth]}` };
  } else if (diffDays >= -3 && diffDays <= 0) {
    const daysLeft = Math.abs(diffDays);
    return { type: "DUE_SOON", text: daysLeft === 0 ? "Due Today" : `Due in ${daysLeft}d`, colorClass: "bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold text-[10px]", days: diffDays, dueDateStr: `${targetDay} ${MONTHS[currentMonth]}` };
  } else {
    return { type: "UPCOMING", text: `Due ${targetDay}th`, colorClass: "chip-default", days: diffDays, dueDateStr: `${targetDay} ${MONTHS[currentMonth]}` };
  }
}

function sendWhatsAppReminder(member) {
  const planInfo = PLANS[member.plan] || { label: member.plan, price: member.total_price || 1200 };
  const statusInfo = getMemberPaymentStatus(member);
  let msg = `Hi ${member.name}! HUSTLE GYM se aapki fees (₹${member.total_price || planInfo.price}) `;
  msg += statusInfo.days > 0 ? `${statusInfo.days} din se overdue hai (Due Date: ${statusInfo.dueDateStr}). ` : `due hai. `;
  msg += `Kripya karke payment update karayein. Thank you! 💪🏋️‍♂️`;

  const cleanPhone = String(member.phone).replace(/\D/g, "");
  window.open(`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`, "_blank");
}

// ==================== DATABASE API CALLS ====================
async function fetchMembers() {
  const { data, error } = await supabaseClient.from('members').select('*');
  if (error) console.error("Supabase Error:", error.message || error);
  else { members = data || []; renderViews(); }
}

async function dbAddMember(newMember) {
  const { error } = await supabaseClient.from('members').insert([newMember]);
  if (error) alert("Error adding member: " + error.message);
  else { await fetchMembers(); document.getElementById("modal-add").classList.add("hidden"); }
}

async function dbUpdateMember(id, updatedFields) {
  const { error } = await supabaseClient.from('members').update(updatedFields).eq('id', id);
  if (error) alert("Error updating member: " + error.message);
  else await fetchMembers();
}

async function dbDeleteMember(id) {
  const { error } = await supabaseClient.from('members').delete().eq('id', id);
  if (error) alert("Error deleting member: " + error.message);
  else { selectedMemberId = null; document.getElementById("modal-delete").classList.add("hidden"); await fetchMembers(); }
}

// ==================== AUTHENTICATION & SECURE CREDENTIALS ====================
function initLogin() {
  const loginForm = document.getElementById("login-form");
  if (!loginForm) return;

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const u = document.getElementById("login-username").value.trim();
    const p = document.getElementById("login-password").value;
    const err = document.getElementById("auth-error");

    err.classList.add("hidden");

    try {
      const { data, error } = await supabaseClient
        .from('admin_users')
        .select('*')
        .eq('username', u)
        .single();

      if (error || !data) throw new Error("Invalid User");
      
      const isValid = bcryptLib.compareSync(p, data.password_hash);
      
      if (isValid) {
        loggedInUser = u;
        document.getElementById("auth-screen").classList.add("hidden");
        document.getElementById("main-app").classList.remove("hidden");
        document.getElementById("login-password").value = '';
        initApp();
      } else {
        throw new Error("Invalid Password");
      }
    } catch (e) {
      err.classList.remove("hidden");
    }
  });

  document.getElementById("btn-logout")?.addEventListener("click", () => {
    document.getElementById("main-app").classList.add("hidden");
    document.getElementById("auth-screen").classList.remove("hidden");
    loggedInUser = null;
  });
}

function initAdminReset() {
  const modalReset = document.getElementById('modal-reset');
  document.getElementById('btn-open-reset').addEventListener('click', () => {
    document.getElementById('input-new-user').value = loggedInUser || '';
    document.getElementById('input-new-pass').value = '';
    modalReset.classList.remove('hidden');
  });

  document.getElementById('btn-close-reset').addEventListener('click', () => modalReset.classList.add('hidden'));

  document.getElementById('form-reset-creds').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newU = document.getElementById('input-new-user').value.trim();
    const newP = document.getElementById('input-new-pass').value;

    if(!newU || !newP) return alert('Username and Password required');

    const salt = bcryptLib.genSaltSync(10);
    const newHash = bcryptLib.hashSync(newP, salt);

    const { error } = await supabaseClient
      .from('admin_users')
      .update({ username: newU, password_hash: newHash })
      .eq('username', loggedInUser);

    if (error) {
      alert("Failed to update credentials: " + error.message);
    } else {
      alert("Credentials updated successfully!");
      loggedInUser = newU;
      modalReset.classList.add('hidden');
    }
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
      icon?.classList.replace("text-slate-400", "text-rose-500");
      text?.classList.replace("text-slate-400", "text-rose-500");
    } else {
      icon?.classList.replace("text-rose-500", "text-slate-400");
      text?.classList.replace("text-rose-500", "text-slate-400");
    }
  });

  const dueCount = members.filter((m) => getMemberPaymentStatus(m).type === "OVERDUE").length;
  const badge = document.getElementById("due-badge");
  if (badge) {
    if (dueCount > 0) { badge.textContent = dueCount; badge.classList.remove("hidden"); }
    else badge.classList.add("hidden");
  }

  const bottomNav = document.getElementById("bottom-nav");
  if (bottomNav) selectedMemberId ? bottomNav.classList.add("hidden") : bottomNav.classList.remove("hidden");
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
  if (window.lucide) window.lucide.createIcons();
}

function createAvatarHTML(name) {
  const initials = (name || "M").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return `<div class="w-10 h-10 rounded-xl glass flex items-center justify-center shrink-0 border border-white/10"><span class="font-bold text-white text-xs tracking-tight">${initials}</span></div>`;
}

function renderMembersView() {
  const countEl = document.getElementById("members-count");
  if (countEl) countEl.textContent = `${members.length} active members`;

  const container = document.getElementById("members-list");
  if (!container) return;

  if (members.length === 0) return container.innerHTML = `<p class="text-center py-12 text-xs text-slate-400">No members found in database.</p>`;

  container.innerHTML = members.map((m, i) => {
    const statusInfo = getMemberPaymentStatus(m);
    const present = (m.attendance?.[todayKey] || []).length;
    const planInfo = PLANS[m.plan] || { label: m.plan, price: m.total_price || 1200 };
    const durationText = m.duration ? `${m.duration} Mo` : "1 Mo";
    const borderGlow = statusInfo.type === "OVERDUE" ? "border-rose-500/40 bg-rose-950/10" : "border-white/5";

    return `
      <button data-id="${m.id}" class="btn-member-card glass glass-sheen relative w-full rounded-2xl p-3 flex items-center gap-3 active:scale-[0.98] transition text-left border ${borderGlow}">
        <span class="font-mono text-[10px] text-slate-500 w-4">${String(i + 1).padStart(2, "0")}</span>
        ${createAvatarHTML(m.name)}
        <div class="flex-1 min-w-0">
          <p class="font-bold text-sm text-white truncate">${m.name}</p>
          <p class="text-slate-400 text-[11px] mt-0.5">${present} days present · ${planInfo.label} (${durationText})</p>
        </div>
        <span class="${statusInfo.colorClass}">${statusInfo.text}</span>
      </button>
    `;
  }).join("");

  container.querySelectorAll(".btn-member-card").forEach((btn) => btn.addEventListener("click", () => {
    selectedMemberId = btn.dataset.id; selectedDetailMonth = todayKey; renderViews();
  }));
}

function renderFeesView() {
  const paid = members.filter((m) => m.fees?.[todayKey] === "paid");
  const pending = members.filter((m) => m.fees?.[todayKey] !== "paid");
  document.getElementById("fees-paid-count").textContent = paid.length;
  document.getElementById("fees-pending-count").textContent = pending.length;

  const container = document.getElementById("fees-list");
  if (!container) return;

  container.innerHTML = members.map((m) => {
    const status = m.fees?.[todayKey];
    const statusInfo = getMemberPaymentStatus(m);
    const paidStyle = status === "paid" ? 'style="background: linear-gradient(135deg, #22C55E, #15803D)"' : "";
    const dueStyle = status === "due" ? 'style="background: linear-gradient(135deg, #F43F5E, #9F1239)"' : "";
    const displayPrice = m.total_price || (PLANS[m.plan]?.price || 1200);
    const planLabel = PLANS[m.plan]?.label || m.plan;

    return `
      <div class="glass glass-sheen relative rounded-2xl p-3 flex items-center gap-3 border border-white/5">
        ${createAvatarHTML(m.name)}
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <p class="font-bold text-sm text-white truncate">${m.name}</p>
            <span class="${statusInfo.colorClass}">${statusInfo.text}</span>
          </div>
          <p class="text-slate-400 text-xs mt-0.5 font-mono">₹${displayPrice} · ${planLabel}</p>
        </div>
        <div class="flex gap-1.5 shrink-0">
          <button data-id="${m.id}" data-status="paid" ${paidStyle} class="btn-mark-fee px-2.5 py-1.5 rounded-xl text-[10px] font-bold uppercase transition active:scale-95 ${status === "paid" ? "text-white shadow-lg" : "glass text-slate-300"}">Paid</button>
          <button data-id="${m.id}" data-status="due" ${dueStyle} class="btn-mark-fee px-2.5 py-1.5 rounded-xl text-[10px] font-bold uppercase transition active:scale-95 ${status === "due" ? "text-white shadow-lg" : "glass text-slate-300"}">Due</button>
        </div>
      </div>
    `;
  }).join("");

  container.querySelectorAll(".btn-mark-fee").forEach((btn) => btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const id = btn.dataset.id;
    const m = members.find((item) => item.id === id);
    if (m) await dbUpdateMember(id, { fees: { ...(m.fees || {}), [todayKey]: btn.dataset.status } });
  }));
}

function renderDueView() {
  const dueMembers = members.filter((m) => getMemberPaymentStatus(m).type === "OVERDUE");
  document.getElementById("due-summary-text").textContent = `${dueMembers.length} member(s) overdue for fees`;

  const container = document.getElementById("due-list");
  if (!container) return;

  if (dueMembers.length === 0) return container.innerHTML = `<p class="text-center py-12 text-xs text-slate-400">Awesome! Sabhi members ki fees clear hai.</p>`;

  container.innerHTML = dueMembers.map((m) => {
    const planLabel = PLANS[m.plan]?.label || m.plan;
    const statusInfo = getMemberPaymentStatus(m);
    const displayPrice = m.total_price || 1200;

    return `
      <div class="glass relative rounded-2xl p-4 space-y-3 border border-rose-500/30 bg-rose-950/10">
        <div class="flex items-center gap-3">
          ${createAvatarHTML(m.name)}
          <div class="flex-1 min-w-0">
            <p class="font-bold text-sm text-white truncate">${m.name}</p>
            <p class="text-slate-400 text-xs mt-0.5 font-mono">Joined ${m.joinDate || m.joindate || "N/A"}</p>
          </div>
          <span class="chip chip-red font-bold">${statusInfo.text}</span>
        </div>
        <div class="flex items-center justify-between pt-2 border-t border-white/10 text-xs font-mono text-slate-300">
          <span class="text-rose-400 font-bold">₹${displayPrice} (${planLabel})</span>
          <button data-id="${m.id}" class="btn-send-wa px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white font-bold text-[11px] flex items-center gap-1.5 transition border border-emerald-500/30">
            <i data-lucide="message-circle" class="w-3.5 h-3.5"></i> WhatsApp
          </button>
        </div>
      </div>
    `;
  }).join("");

  container.querySelectorAll(".btn-send-wa").forEach((btn) => btn.addEventListener("click", () => {
    const m = members.find((item) => item.id === btn.dataset.id);
    if (m) sendWhatsAppReminder(m);
  }));
}

function renderDetailView() {
  const member = members.find((m) => m.id === selectedMemberId);
  if (!member) return;

  const planLabel = PLANS[member.plan]?.label || member.plan;
  const statusInfo = getMemberPaymentStatus(member);
  document.getElementById("detail-avatar").querySelector("span").textContent = member.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  document.getElementById("detail-name").textContent = member.name;
  document.getElementById("detail-plan-chip").textContent = `${planLabel} · Total ₹${member.total_price || 1200}`;
  document.getElementById("detail-phone").textContent = member.phone;
  document.getElementById("detail-phone").href = `tel:${member.phone}`;
  document.getElementById("detail-joined").textContent = member.joinDate || member.joindate || "N/A";
  document.getElementById("detail-duration").textContent = `${member.duration || 1} Month(s) Program (${member.discount || 0}% Discount)`;

  const [y, mStr] = selectedDetailMonth.split("-");
  const monthName = `${MONTHS[Number(mStr) - 1]} ${y}`;
  document.getElementById("detail-fee-month").textContent = `${monthName} Fee`;

  const feeStatusText = document.getElementById("detail-fee-status");
  const btnPaid = document.getElementById("btn-set-paid");
  const btnDue = document.getElementById("btn-set-due");
  btnPaid.style.background = ""; btnDue.style.background = "";

  if (member.fees?.[selectedDetailMonth] === "paid") {
    feeStatusText.textContent = "PAID"; feeStatusText.className = "text-emerald-400 font-bold"; btnPaid.style.background = "linear-gradient(135deg, #22C55E, #15803D)";
  } else if (member.fees?.[selectedDetailMonth] === "due" || statusInfo.type === "OVERDUE") {
    feeStatusText.textContent = `DUE (${statusInfo.text})`; feeStatusText.className = "text-rose-400 font-bold"; btnDue.style.background = "linear-gradient(135deg, #F43F5E, #9F1239)";
  } else {
    feeStatusText.textContent = "NOT SET"; feeStatusText.className = "text-slate-400 font-bold";
  }

  const presentDays = member.attendance?.[selectedDetailMonth] || [];
  document.getElementById("attendance-month-label").textContent = monthName;
  document.getElementById("attendance-count").textContent = presentDays.length;
  document.getElementById("attendance-days-total").textContent = daysInMonth(selectedDetailMonth);

  const gridContainer = document.getElementById("attendance-grid");
  gridContainer.innerHTML = Array.from({ length: daysInMonth(selectedDetailMonth) }, (_, i) => i + 1).map((day) => {
    const isPresent = presentDays.includes(day);
    return `<button data-day="${day}" ${isPresent ? 'style="background: linear-gradient(135deg, #F43F5E, #9F1239)"' : ""} class="btn-attendance-day aspect-square rounded-xl flex items-center justify-center text-xs font-mono font-bold transition active:scale-90 ${isPresent ? "text-white shadow-lg border border-rose-500/50" : "glass text-slate-300 hover:text-white"}">${day}</button>`;
  }).join("");

  gridContainer.querySelectorAll(".btn-attendance-day").forEach((btn) => btn.addEventListener("click", () => toggleAttendanceDay(Number(btn.dataset.day))));
}

async function toggleAttendanceDay(day) {
  if (!selectedMemberId) return;
  const member = members.find((m) => m.id === selectedMemberId);
  if (!member) return;
  const presentDays = new Set(member.attendance?.[selectedDetailMonth] || []);
  presentDays.has(day) ? presentDays.delete(day) : presentDays.add(day);
  await dbUpdateMember(selectedMemberId, { attendance: { ...(member.attendance || {}), [selectedDetailMonth]: Array.from(presentDays).sort((a, b) => a - b) } });
}

// ==================== THEME TOGGLE KEY ====================
function initThemeToggle() {
  const toggleBtn = document.getElementById("btn-toggle-theme");
  if (!toggleBtn) return;

  toggleBtn.addEventListener("click", () => {
    document.body.classList.toggle("light-theme");
    const isLight = document.body.classList.contains("light-theme");
    const icon = document.getElementById("theme-icon");
    const text = document.getElementById("theme-text");

    if (isLight) {
      icon.setAttribute("data-lucide", "moon");
      icon.className = "w-3.5 h-3.5 text-indigo-600";
      text.textContent = "Dark";
    } else {
      icon.setAttribute("data-lucide", "sun");
      icon.className = "w-3.5 h-3.5 text-amber-400";
      text.textContent = "Theme";
    }
    if (window.lucide) window.lucide.createIcons();
  });
}

// ==================== MODALS & BINDINGS ====================
function bindEvents() {
  document.querySelectorAll(".nav-btn").forEach((btn) => btn.addEventListener("click", () => { currentTab = btn.dataset.tab; selectedMemberId = null; renderViews(); }));
  document.getElementById("btn-back-detail")?.addEventListener("click", () => { selectedMemberId = null; renderViews(); });
  
  ["paid", "due"].forEach(status => {
    document.getElementById(`btn-set-${status}`)?.addEventListener("click", async () => {
      const member = members.find((m) => m.id === selectedMemberId);
      if (member) await dbUpdateMember(selectedMemberId, { fees: { ...(member.fees || {}), [selectedDetailMonth]: status } });
    });
  });

  document.getElementById("btn-open-add")?.addEventListener("click", () => {
    document.getElementById("input-name").value = "";
    document.getElementById("input-phone").value = "";
    document.getElementById("input-join-date").value = new Date().toISOString().slice(0, 10);
    document.getElementById("select-duration").value = "1";
    document.getElementById("select-discount").value = "0";
    document.getElementById("input-custom-name").value = "";
    document.getElementById("input-custom-price").value = "";
    document.getElementById("custom-plan-fields").classList.add("hidden");
    
    // Reset plan buttons
    document.querySelectorAll(".plan-option").forEach(b => {
      b.classList.remove("border-rose-500", "bg-rose-500/10");
      b.classList.add("border-white/10");
    });
    const defaultBtn = document.querySelector('[data-plan="cardio"]');
    if (defaultBtn) {
      defaultBtn.classList.add("border-rose-500", "bg-rose-500/10");
      defaultBtn.classList.remove("border-white/10");
    }
    addPlanSelected = 'cardio';

    calculateBillingTotal();
    document.getElementById("modal-add").classList.remove("hidden");
  });
  
  document.getElementById("btn-close-add")?.addEventListener("click", () => document.getElementById("modal-add").classList.add("hidden"));
  document.getElementById("select-duration")?.addEventListener("change", calculateBillingTotal);
  document.getElementById("select-discount")?.addEventListener("change", calculateBillingTotal);
  document.getElementById("input-custom-price")?.addEventListener("input", calculateBillingTotal);

  // Plan Option Selector & Custom Plan Toggle
  document.querySelectorAll(".plan-option").forEach((btn) => btn.addEventListener("click", () => {
    addPlanSelected = btn.dataset.plan;
    document.querySelectorAll(".plan-option").forEach((b) => {
      b.classList.remove("border-rose-500", "bg-rose-500/10");
      b.classList.add("border-white/10");
    });
    btn.classList.add("border-rose-500", "bg-rose-500/10");
    btn.classList.remove("border-white/10");

    const customFields = document.getElementById("custom-plan-fields");
    if (addPlanSelected === "custom") {
      customFields.classList.remove("hidden");
    } else {
      customFields.classList.add("hidden");
    }
    calculateBillingTotal();
  }));

  document.getElementById("btn-submit-add")?.addEventListener("click", async () => {
    const name = document.getElementById("input-name").value.trim();
    const phone = document.getElementById("input-phone").value.trim();
    const joinDate = document.getElementById("input-join-date").value;
    const customPlanName = document.getElementById("input-custom-name").value.trim();

    if (!name || !phone || !joinDate) return alert("Please fill in name, phone, and joining date!");

    let finalPlanKey = addPlanSelected;
    if (addPlanSelected === 'custom') {
      if (!customPlanName) return alert("Please enter custom plan name!");
      finalPlanKey = customPlanName;
    }

    const billing = calculateBillingTotal();
    await dbAddMember({
      id: uid(),
      name,
      phone,
      plan: finalPlanKey,
      joinDate,
      duration: billing.durationMonths,
      discount: billing.discountPercent,
      total_price: billing.finalTotal,
      fees: {},
      attendance: {}
    });
  });

  document.getElementById("btn-delete-member")?.addEventListener("click", () => document.getElementById("modal-delete").classList.remove("hidden"));
  document.getElementById("btn-cancel-delete")?.addEventListener("click", () => document.getElementById("modal-delete").classList.add("hidden"));
  document.getElementById("btn-confirm-delete")?.addEventListener("click", async () => { if (selectedMemberId) await dbDeleteMember(selectedMemberId); });
}

function initApp() {
  bindEvents();
  initAdminReset();
  initThemeToggle();
  fetchMembers();
}

document.addEventListener("DOMContentLoaded", () => {
  initLogin();
  if (window.lucide) window.lucide.createIcons();
});
