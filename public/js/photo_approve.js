import { db, ref, onValue, update, push, serverTimestamp } from "./firebase_config.js";
import { requireProjectContext, storeProjectContext } from "./project_context.js";
import { getStepConfig, normalizeMissionEntry } from "./mission_rules.js";
import { formatSlotLabelFromMission, getRequiredSlotsFromMission } from "./photo_slots.js";
import { resolveMissionConfigFromProject } from "./project_mission_resolver.js";

const DEFAULT_SLOT_TEMPLATE = ["Photo1", "Photo2", "S1"];
const APPROVE_AUTH_STORAGE_KEY = "smr_mobile_photo_approve_auth";
const params = new URLSearchParams(window.location.search);
const projectIdFromQuery = params.get("project");
const projectContext = projectIdFromQuery
  ? { projectId: projectIdFromQuery }
  : requireProjectContext({
      fallbackUrl: new URL("./admin.html", window.location.href).toString(),
    });

const elements = {
  title: document.getElementById("approveTitle"),
  subtitle: document.getElementById("approveSubtitle"),
  openReviewBtn: document.getElementById("approveOpenReviewBtn"),
  queueCount: document.getElementById("approveQueueCount"),
  filters: Array.from(document.querySelectorAll("[data-approve-filter]")),
  teamLabel: document.getElementById("approveTeamLabel"),
  missionLabel: document.getElementById("approveMissionLabel"),
  meta: document.getElementById("approveMeta"),
  context: document.getElementById("approveContext"),
  preview: document.getElementById("approvePreview"),
  slots: document.getElementById("approveSlots"),
  history: document.getElementById("approveHistory"),
  historyCount: document.getElementById("approveHistoryCount"),
  toastHost: document.getElementById("approveToastHost"),
  prevBtn: document.getElementById("approvePrevBtn"),
  retryBtn: document.getElementById("approveRetryBtn"),
  okBtn: document.getElementById("approveOkBtn"),
  nextBtn: document.getElementById("approveNextBtn"),
  shell: document.querySelector(".approve-shell"),
  lock: document.getElementById("approveLock"),
  lockMessage: document.getElementById("approveLockMessage"),
  lockInput: document.getElementById("approveLockInput"),
  lockSubmit: document.getElementById("approveLockSubmit"),
  lockReviewBtn: document.getElementById("approveLockReviewBtn"),
  retryModal: document.getElementById("approveRetryModal"),
  retryMeta: document.getElementById("approveRetryMeta"),
  retryInput: document.getElementById("approveRetryInput"),
  retryClose: document.getElementById("approveRetryClose"),
  retryCancel: document.getElementById("approveRetryCancel"),
  retrySubmit: document.getElementById("approveRetrySubmit"),
  retryPresets: Array.from(document.querySelectorAll("[data-approve-retry-preset]")),
};

const state = {
  projectId: projectContext?.projectId || "",
  meta: {},
  teams: {},
  uploads: {},
  routing: null,
  teamOverrides: {},
  unlocked: false,
  filter: "pending",
  selectedTeamId: "",
  selectedMissionKey: "",
  selectedSlotId: "",
  selectedSlotsByMission: {},
  recentActions: [],
};

if (!state.projectId) {
  window.location.href = new URL("./admin.html", window.location.href).toString();
} else {
  document.addEventListener("DOMContentLoaded", initialize);
}

function initialize() {
  elements.openReviewBtn?.addEventListener("click", () => {
    const nextUrl = new URL("./review.html", window.location.href);
    nextUrl.searchParams.set("project", state.projectId);
    window.open(nextUrl.toString(), "_blank");
  });
  elements.lockReviewBtn?.addEventListener("click", () => {
    const nextUrl = new URL("./review.html", window.location.href);
    nextUrl.searchParams.set("project", state.projectId);
    window.open(nextUrl.toString(), "_blank");
  });
  elements.lockSubmit?.addEventListener("click", handleUnlockSubmit);
  elements.lockInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleUnlockSubmit();
    }
  });
  elements.filters.forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.approveFilter || "pending";
      elements.filters.forEach((item) => item.classList.toggle("is-active", item === button));
      ensureSelection();
      render();
    });
  });
  elements.prevBtn?.addEventListener("click", () => moveSelection(-1));
  elements.nextBtn?.addEventListener("click", () => moveSelection(1));
  elements.okBtn?.addEventListener("click", approveCurrentMission);
  elements.retryBtn?.addEventListener("click", openRetryModal);
  elements.retryClose?.addEventListener("click", closeRetryModal);
  elements.retryCancel?.addEventListener("click", closeRetryModal);
  elements.retrySubmit?.addEventListener("click", submitRetryModal);
  elements.retryModal?.addEventListener("click", (event) => {
    if (event.target === elements.retryModal) {
      closeRetryModal();
    }
  });
  elements.retryInput?.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      submitRetryModal();
    }
  });
  elements.retryPresets.forEach((button) => {
    button.addEventListener("click", () => {
      if (!elements.retryInput) return;
      elements.retryInput.value = button.dataset.approveRetryPreset || "";
      elements.retryInput.focus();
    });
  });
  subscribeProject();
}

function showApproveToast(message, type = "info", duration = 2400) {
  if (!message || !elements.toastHost) return;
  const toast = document.createElement("div");
  toast.className = `approve-toast approve-toast--${type}`;
  toast.textContent = message;
  elements.toastHost.appendChild(toast);
  window.setTimeout(() => {
    toast.classList.add("is-leaving");
    window.setTimeout(() => toast.remove(), 180);
  }, duration);
}

function isLocalPreview() {
  return /^(127\.0\.0\.1|localhost)$/i.test(window.location.hostname);
}

async function callMobileApproveApi(payload) {
  const response = await fetch("/api/mobile-photo-action", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `http-${response.status}`);
  }
  return data;
}

async function hashSecret(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized || !window.crypto?.subtle || typeof TextEncoder === "undefined") {
    return normalized;
  }
  const data = new TextEncoder().encode(normalized);
  const digest = await window.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function recordMobileApproveLog(action, details = {}) {
  try {
    await push(ref(db, `ops_logs/${state.projectId}`), {
      action,
      details,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn(`Mobile approve log skipped: ${action}`, error);
    showApproveToast("운영 로그 기록은 건너뛰고 승인 상태만 반영했습니다.", "warn", 2600);
  }
}

function pushRecentAction(label, message) {
  state.recentActions = [
    {
      label,
      message,
      time: new Date().toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
    },
    ...state.recentActions,
  ].slice(0, 6);
}

function subscribeProject() {
  onValue(ref(db, `projects/${state.projectId}/meta`), async (snapshot) => {
    state.meta = snapshot.val() || {};
    storeProjectContext({
      projectId: state.projectId,
      projectName: state.meta.name || state.projectId,
      logoUrl: state.meta.logoUrl || "",
      teamCount: state.meta.teamCount || 0,
    });
    await restoreUnlockState();
    syncLockState();
    render();
  });
  onValue(ref(db, `projects/${state.projectId}/teams`), (snapshot) => {
    state.teams = snapshot.val() || {};
    ensureSelection();
    render();
  });
  onValue(ref(db, `projects/${state.projectId}/routing`), (snapshot) => {
    state.routing = snapshot.val() || null;
    ensureSelection();
    render();
  });
  onValue(ref(db, `projects/${state.projectId}/teamOverrides`), (snapshot) => {
    state.teamOverrides = snapshot.val() || {};
    ensureSelection();
    render();
  });
  onValue(ref(db, `uploads_meta/${state.projectId}`), (snapshot) => {
    state.uploads = snapshot.val() || {};
    ensureSelection();
    render();
  });
}

function getQueueItems(filter = "pending") {
  const teamIds = new Set([...Object.keys(state.teams || {}), ...Object.keys(state.uploads || {})]);
  return Array.from(teamIds)
    .map((teamId) => {
      const missionKeys = getVisibleMissionKeys(teamId, filter);
      if (!missionKeys.length) return null;
      return { teamId, missionKeys };
    })
    .filter(Boolean)
    .sort((a, b) => teamNumber(a.teamId) - teamNumber(b.teamId));
}

function ensureSelection() {
  const queue = getQueueItems(state.filter);
  if (!queue.length) {
    state.selectedTeamId = "";
    state.selectedMissionKey = "";
    state.selectedSlotId = "";
    return;
  }
  if (!queue.find((item) => item.teamId === state.selectedTeamId)) {
    state.selectedTeamId = queue[0].teamId;
  }
  const missionKeys = getVisibleMissionKeys(state.selectedTeamId, state.filter);
  if (!missionKeys.length) {
    state.selectedMissionKey = "";
    state.selectedSlotId = "";
    return;
  }
  if (!missionKeys.includes(state.selectedMissionKey)) {
    state.selectedMissionKey = missionKeys[0];
  }
  const slots = getRequiredSlots(state.selectedTeamId, state.selectedMissionKey);
  if (!slots.includes(state.selectedSlotId)) {
    state.selectedSlotId = slots.find((slotId) => getMissionSlots(state.selectedTeamId, state.selectedMissionKey)[slotId]?.url) || slots[0] || "";
  }
}

function getVisibleMissionKeys(teamId, filter = "pending") {
  const teamUploads = state.uploads[teamId] || {};
  return Object.keys(teamUploads)
    .filter((missionKey) => missionKey.startsWith("mission_"))
    .sort((a, b) => Number(a.split("_")[1]) - Number(b.split("_")[1]))
    .filter((missionKey) => {
      const reviewState = getMissionReviewState(teamId, missionKey);
      if (filter === "retry") return reviewState === "retry";
      if (filter === "all") return reviewState === "pending" || reviewState === "retry";
      return reviewState === "pending";
    });
}

function getMissionReviewState(teamId, missionKey) {
  const slots = getMissionSlots(teamId, missionKey);
  const requiredSlots = getRequiredSlots(teamId, missionKey);
  if (!requiredSlots.length) return "none";
  const statuses = requiredSlots.map((slotId) => slots[slotId]?.status || "");
  const hasAllFiles = requiredSlots.every((slotId) => slots[slotId]?.url);
  if (!hasAllFiles) return "none";
  if (statuses.some((status) => status === "retry")) return "retry";
  if (statuses.every((status) => status === "approved")) return "approved";
  return "pending";
}

function getMissionSlots(teamId, missionKey) {
  return state.uploads[teamId]?.[missionKey] || {};
}

function getMissionSelectionKey(teamId, missionKey) {
  return `${teamId}:${missionKey}`;
}

function getSelectedSlotSet(teamId, missionKey) {
  const key = getMissionSelectionKey(teamId, missionKey);
  if (!(state.selectedSlotsByMission[key] instanceof Set)) {
    state.selectedSlotsByMission[key] = new Set();
  }
  return state.selectedSlotsByMission[key];
}

function getRequiredSlots(teamId, missionKey) {
  const missionId = missionKey.split("_")[1];
  const mission = resolveMissionEntry(teamId, missionId);
  return getRequiredSlotsFromMission(mission, { fallbackSlots: DEFAULT_SLOT_TEMPLATE });
}

function getSlotLabel(teamId, missionKey, slotId) {
  const missionId = missionKey.split("_")[1];
  const mission = resolveMissionEntry(teamId, missionId);
  return formatSlotLabelFromMission(mission, slotId, { fallbackSlots: DEFAULT_SLOT_TEMPLATE });
}

function resolveMissionEntry(teamId, missionId) {
  const missionTotal = Number(state.meta.missionTotal) || 9;
  const legacyMission = state.teams[teamId]?.config?.missions?.[missionId] || {};
  const teamOverride = state.teamOverrides?.[teamId] || {};
  return normalizeMissionEntry(resolveMissionConfigFromProject({
    teamId,
    missionNumber: Number(missionId),
    missionTotal,
    routing: state.routing,
    teamOverride,
    legacyMission,
    meta: state.meta,
  }));
}

function render() {
  syncLockState();
  const queue = getQueueItems(state.filter);
  if (elements.title) {
    elements.title.textContent = `${state.meta.name || state.projectId} 모바일 사진 승인`;
  }
  if (elements.subtitle) {
    elements.subtitle.textContent = `승인 대기 ${getQueueItems("pending").length}팀 · 재도전 ${getQueueItems("retry").length}팀`;
  }
  if (elements.queueCount) {
    elements.queueCount.textContent = `대기 ${queue.length}건`;
  }
  renderCard();
  renderHistory();
}

function renderCard() {
  const teamId = state.selectedTeamId;
  const missionKey = state.selectedMissionKey;
  if (!teamId || !missionKey) {
    if (elements.teamLabel) elements.teamLabel.textContent = "현재 처리할 사진이 없습니다.";
    if (elements.missionLabel) elements.missionLabel.textContent = "미션 -";
    if (elements.meta) elements.meta.textContent = "왼쪽 필터를 바꾸거나 새 업로드를 기다리세요.";
    if (elements.context) elements.context.innerHTML = "";
    if (elements.preview) elements.preview.textContent = "사진이 없으면 여기에 표시됩니다.";
    if (elements.slots) elements.slots.innerHTML = "";
    syncButtons(false);
    return;
  }
  const missionId = missionKey.split("_")[1];
  const requiredSlots = getRequiredSlots(teamId, missionKey);
  const slots = getMissionSlots(teamId, missionKey);
  const reviewState = getMissionReviewState(teamId, missionKey);
  if (elements.teamLabel) elements.teamLabel.textContent = getTeamLabel(teamId);
  if (elements.missionLabel) elements.missionLabel.textContent = `M${missionId}`;
  if (elements.meta) {
    const selectedCount = getSelectedActionSlots(teamId, missionKey).length;
    elements.meta.textContent = `${requiredSlots.length}개 슬롯 · ${reviewState === "retry" ? "재도전 요청됨" : "승인 대기"}${selectedCount ? ` · 선택 ${selectedCount}개` : ""}`;
  }
  renderContext(slots);
  const currentSlot = slots[state.selectedSlotId];
  if (elements.preview) {
    if (!currentSlot?.url) {
      elements.preview.textContent = "업로드된 파일이 없습니다.";
    } else {
      elements.preview.innerHTML = currentSlot.type?.startsWith("video")
        ? `<video src="${currentSlot.url}" controls playsinline></video>`
        : `<img src="${currentSlot.url}" alt="${state.selectedSlotId}" />`;
    }
  }
  if (elements.slots) {
    elements.slots.innerHTML = requiredSlots.map((slotId) => {
      const item = slots[slotId];
      const status = item?.status || (item?.url ? "pending" : "empty");
      return `
        <button type="button" class="approve-slot ${slotId === state.selectedSlotId ? "is-active" : ""}" data-slot-id="${slotId}">
          <div class="approve-slot__media">
            ${
              item?.url
                ? item.type?.startsWith("video")
                  ? `<video src="${item.url}" muted playsinline></video>`
                  : `<img src="${item.url}" alt="${slotId}" />`
                : `<span>없음</span>`
            }
          </div>
          <div class="approve-slot__meta">
            <label class="approve-slot__check">
              <input type="checkbox" data-slot-check="${slotId}" ${getSelectedSlotSet(teamId, missionKey).has(slotId) ? "checked" : ""} ${item?.url ? "" : "disabled"} />
              <strong>${getSlotLabel(teamId, missionKey, slotId)}</strong>
            </label>
            <span>${status === "approved" ? "승인" : status === "retry" ? "재도전" : item?.url ? "대기" : "없음"}</span>
          </div>
        </button>
      `;
    }).join("");
    elements.slots.querySelectorAll("[data-slot-id]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedSlotId = button.dataset.slotId || "";
        renderCard();
      });
    });
    elements.slots.querySelectorAll("[data-slot-check]").forEach((input) => {
      input.addEventListener("click", (event) => event.stopPropagation());
      input.addEventListener("change", (event) => {
        const slotId = event.target.dataset.slotCheck || "";
        const selectedSet = getSelectedSlotSet(teamId, missionKey);
        if (event.target.checked) selectedSet.add(slotId);
        else selectedSet.delete(slotId);
        render();
      });
    });
  }
  syncButtons(isMissionReady(slots, requiredSlots));
}

function renderContext(slots = {}) {
  if (!elements.context) return;
  const retryReasons = Array.from(
    new Set(
      Object.entries(slots)
        .filter(([, item]) => item?.status === "retry" && item?.retryReason)
        .map(([slotId, item]) => `${getSlotLabel(state.selectedTeamId, state.selectedMissionKey, slotId)}: ${item.retryReason}`)
    )
  );
  const uploadedSlots = Object.entries(slots)
    .filter(([, item]) => item?.url)
    .map(([slotId, item]) => {
      const status = item?.status === "approved" ? "승인" : item?.status === "retry" ? "재도전" : "대기";
      return `${getSlotLabel(state.selectedTeamId, state.selectedMissionKey, slotId)} ${status}`;
    });

  const items = [];
  if (retryReasons.length) {
    items.push(`
      <div class="approve-context__item approve-context__item--retry">
        <span class="approve-context__label">이전 재도전 사유</span>
        ${retryReasons.map((reason) => `<div>${reason}</div>`).join("")}
      </div>
    `);
  }
  if (uploadedSlots.length) {
    items.push(`
      <div class="approve-context__item">
        <span class="approve-context__label">현재 슬롯 상태</span>
        <div>${uploadedSlots.join(" · ")}</div>
      </div>
    `);
  }
  elements.context.innerHTML = items.join("");
}

function renderHistory() {
  if (!elements.history || !elements.historyCount) return;
  elements.historyCount.textContent = `${state.recentActions.length}건`;
  if (!state.recentActions.length) {
    elements.history.innerHTML = `<div class="approve-history__item"><strong>아직 처리 이력이 없습니다.</strong><div class="approve-history__meta">승인 또는 재도전 요청을 보내면 여기에 최근 항목이 표시됩니다.</div></div>`;
    return;
  }
  elements.history.innerHTML = state.recentActions
    .map((item) => `
      <div class="approve-history__item">
        <strong>${item.label}</strong>
        <div>${item.message}</div>
        <div class="approve-history__meta">${item.time}</div>
      </div>
    `)
    .join("");
}

function syncButtons(ready) {
  const queue = getQueueItems(state.filter);
  const locked = !state.unlocked;
  const selectedCount = state.selectedTeamId && state.selectedMissionKey
    ? getSelectedActionSlots(state.selectedTeamId, state.selectedMissionKey).length
    : 0;
  if (elements.okBtn) {
    elements.okBtn.disabled = locked || !(selectedCount > 0 || ready);
    elements.okBtn.textContent = selectedCount > 0 ? `선택 승인 (${selectedCount})` : "전체 승인";
  }
  if (elements.retryBtn) {
    const currentHasFile = getMissionSlots(state.selectedTeamId, state.selectedMissionKey)[state.selectedSlotId]?.url;
    elements.retryBtn.disabled = locked || !state.selectedTeamId || !state.selectedMissionKey || !(selectedCount > 0 || currentHasFile);
    elements.retryBtn.textContent = selectedCount > 0 ? `선택 재도전 (${selectedCount})` : "현재 재도전";
  }
  if (elements.prevBtn) elements.prevBtn.disabled = queue.length <= 1;
  if (elements.nextBtn) elements.nextBtn.disabled = queue.length <= 1;
}

function getSelectedActionSlots(teamId, missionKey) {
  const slots = getMissionSlots(teamId, missionKey);
  return Array.from(getSelectedSlotSet(teamId, missionKey)).filter((slotId) => slots[slotId]?.url);
}

function moveSelection(direction = 1) {
  const queue = getQueueItems(state.filter);
  if (!queue.length) return;
  const currentIndex = queue.findIndex((item) => item.teamId === state.selectedTeamId);
  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + direction + queue.length) % queue.length;
  state.selectedTeamId = queue[nextIndex].teamId;
  state.selectedMissionKey = queue[nextIndex].missionKeys[0] || "";
  state.selectedSlotId = getRequiredSlots(state.selectedTeamId, state.selectedMissionKey)[0] || "";
  render();
}

function moveAfterAction(previousTeamId, previousMissionKey) {
  const visibleMissionKeys = getVisibleMissionKeys(previousTeamId, state.filter);
  if (visibleMissionKeys.includes(previousMissionKey)) {
    state.selectedTeamId = previousTeamId;
    state.selectedMissionKey = previousMissionKey;
    state.selectedSlotId = getRequiredSlots(previousTeamId, previousMissionKey)[0] || "";
    return;
  }
  const sameTeamMissions = getVisibleMissionKeys(previousTeamId, state.filter).filter((missionKey) => missionKey !== previousMissionKey);
  if (sameTeamMissions.length) {
    state.selectedTeamId = previousTeamId;
    state.selectedMissionKey = sameTeamMissions[0];
    state.selectedSlotId = getRequiredSlots(previousTeamId, state.selectedMissionKey)[0] || "";
  } else {
    ensureSelection();
  }
}

function applyRemoteApproveState(teamId, missionKey, missionId, delaySeconds, slotIds = null) {
  const missionSlots = getMissionSlots(teamId, missionKey);
  (slotIds || Object.keys(missionSlots)).forEach((slotId) => {
    if (!missionSlots[slotId]?.url) return;
    missionSlots[slotId] = {
      ...missionSlots[slotId],
      status: "approved",
    };
  });
  const missionState = (state.teams[teamId]?.missions?.[missionId] ||= {});
  if (delaySeconds > 0) {
    missionState.stepStatus = "delay";
    missionState.unlockAt = Date.now() + delaySeconds * 1000;
  } else {
    missionState.stage = "done";
    missionState.panel = null;
    missionState.stepStatus = null;
    missionState.unlockAt = null;
  }
}

function applyRemoteRetryState(teamId, missionKey, missionId, reason, slotIds = null) {
  const missionSlots = getMissionSlots(teamId, missionKey);
  (slotIds || Object.keys(missionSlots)).forEach((slotId) => {
    if (!missionSlots[slotId]?.url) return;
    missionSlots[slotId] = {
      ...missionSlots[slotId],
      status: "retry",
      retryReason: reason,
    };
  });
  const missionState = (state.teams[teamId]?.missions?.[missionId] ||= {});
  missionState.stepStatus = null;
  missionState.unlockAt = null;
}

async function approveCurrentMission() {
  if (!state.unlocked) return;
  const teamId = state.selectedTeamId;
  const missionKey = state.selectedMissionKey;
  if (!teamId || !missionKey) return;
  const missionId = missionKey.split("_")[1];
  const missionSlots = getMissionSlots(teamId, missionKey);
  const requiredSlots = getRequiredSlots(teamId, missionKey);
  const selectedSlots = getSelectedActionSlots(teamId, missionKey);
  const approvalSlots = selectedSlots.length ? selectedSlots : requiredSlots;
  if (!approvalSlots.length || !approvalSlots.every((slotId) => missionSlots[slotId]?.url)) return;

  const updates = {};
  approvalSlots.forEach((slotId) => {
    updates[`uploads_meta/${state.projectId}/${teamId}/${missionKey}/${slotId}/status`] = "approved";
  });
  const missionConfig = resolveMissionEntry(teamId, missionId);
  const currentStage = state.teams[teamId]?.missions?.[missionId]?.stage === "code" ? "codeStep" : "missionStep";
  const currentStep = getStepConfig(missionConfig, currentStage);
  const delaySeconds = Number(currentStep.autoAdvanceSeconds) || 0;
  const allApproved = requiredSlots.length > 0
    && requiredSlots.every((slotId) => {
      if (approvalSlots.includes(slotId)) return missionSlots[slotId]?.url;
      return missionSlots[slotId]?.url && missionSlots[slotId]?.status === "approved";
    });
  if (!isLocalPreview()) {
    try {
      await callMobileApproveApi({
        projectId: state.projectId,
        teamId,
        missionId,
        action: "approve",
        slotIds: approvalSlots,
        passwordHash: getApproveSessionToken(),
      });
      applyRemoteApproveState(teamId, missionKey, missionId, delaySeconds, approvalSlots);
      getSelectedSlotSet(teamId, missionKey).clear();
      pushRecentAction("승인 완료", `${getTeamLabel(teamId)} · M${missionId} · ${approvalSlots.length}개`);
      moveAfterAction(teamId, missionKey);
      render();
      window.setTimeout(() => {
        ensureSelection();
        render();
      }, 300);
      showApproveToast(`${getTeamLabel(teamId)} · M${missionId} ${approvalSlots.length}개 슬롯을 승인했습니다.`, "success", 2400);
      return;
    } catch (error) {
      console.error(error);
      showApproveToast("서버 승인 요청에 실패했습니다. Functions 배포와 경로를 확인하세요.", "error", 3200);
      return;
    }
  }
  if (allApproved && delaySeconds > 0) {
    updates[`projects/${state.projectId}/teams/${teamId}/missions/${missionId}/stepStatus`] = "delay";
    updates[`projects/${state.projectId}/teams/${teamId}/missions/${missionId}/unlockAt`] = Date.now() + delaySeconds * 1000;
  } else if (allApproved) {
    if (currentStage === "codeStep") {
      updates[`projects/${state.projectId}/teams/${teamId}/missions/${missionId}/stage`] = "mission";
      updates[`projects/${state.projectId}/teams/${teamId}/missions/${missionId}/panel`] = "mission";
      updates[`projects/${state.projectId}/teams/${teamId}/missions/${missionId}/stepStatus`] = null;
      updates[`projects/${state.projectId}/teams/${teamId}/missions/${missionId}/unlockAt`] = null;
      updates[`projects/${state.projectId}/teams/${teamId}/missions/${missionId}/completedAt`] = null;
    } else {
      updates[`projects/${state.projectId}/teams/${teamId}/missions/${missionId}/stage`] = "done";
      updates[`projects/${state.projectId}/teams/${teamId}/missions/${missionId}/panel`] = null;
      updates[`projects/${state.projectId}/teams/${teamId}/missions/${missionId}/stepStatus`] = null;
      updates[`projects/${state.projectId}/teams/${teamId}/missions/${missionId}/unlockAt`] = null;
      updates[`projects/${state.projectId}/teams/${teamId}/missions/${missionId}/completedAt`] = Date.now();
      if (Number(missionId) < getMissionTotal()) {
        const nextMission = String(Number(missionId) + 1);
        const nextMissionData = state.teams[teamId]?.missions?.[nextMission];
        if (!nextMissionData || nextMissionData.stage === "locked") {
          updates[`projects/${state.projectId}/teams/${teamId}/missions/${nextMission}/stage`] = "code";
          updates[`projects/${state.projectId}/teams/${teamId}/missions/${nextMission}/panel`] = null;
          updates[`projects/${state.projectId}/teams/${teamId}/missions/${nextMission}/stepStatus`] = null;
          updates[`projects/${state.projectId}/teams/${teamId}/missions/${nextMission}/unlockAt`] = null;
          updates[`projects/${state.projectId}/teams/${teamId}/missions/${nextMission}/completedAt`] = null;
        }
      }
    }
  }
  try {
    await update(ref(db), updates);
    await push(ref(db, `chat/${state.projectId}/${teamId}`), {
      sender: "HQ",
      text: `[본부] 사진 승인 완료 - Mission ${missionId}`,
      createdAt: serverTimestamp(),
    });
    await recordMobileApproveLog("hq_photo_approve", {
      source: "mobile_approve",
      teamId,
      teamLabel: getTeamLabel(teamId),
      missionId,
      delaySeconds,
      slotIds: approvalSlots,
      allApproved,
    });
    getSelectedSlotSet(teamId, missionKey).clear();
    pushRecentAction("승인 완료", `${getTeamLabel(teamId)} · M${missionId} · ${approvalSlots.length}개`);
    moveAfterAction(teamId, missionKey);
    render();
    showApproveToast(`${getTeamLabel(teamId)} · M${missionId} ${approvalSlots.length}개 슬롯을 승인했습니다.`, "success", 2400);
  } catch (error) {
    console.error(error);
    showApproveToast("사진 승인 중 오류가 발생했습니다.", "error", 2800);
  }
}

function openRetryModal() {
  if (!state.unlocked) return;
  const teamId = state.selectedTeamId;
  const missionKey = state.selectedMissionKey;
  if (!teamId || !missionKey || !elements.retryModal || !elements.retryInput) return;
  const missionId = missionKey.split("_")[1];
  if (elements.retryMeta) {
    elements.retryMeta.textContent = `${getTeamLabel(teamId)} · M${missionId} 에 보낼 재도전 사유를 입력하세요.`;
  }
  elements.retryInput.value = "";
  elements.retryModal.hidden = false;
  window.setTimeout(() => elements.retryInput?.focus(), 0);
}

function closeRetryModal() {
  if (!elements.retryModal) return;
  elements.retryModal.hidden = true;
  if (elements.retryInput) elements.retryInput.value = "";
}

async function submitRetryModal() {
  if (!state.unlocked) return;
  const reason = elements.retryInput?.value.trim() || "";
  const teamId = state.selectedTeamId;
  const missionKey = state.selectedMissionKey;
  if (!teamId || !missionKey || !reason) return;
  const missionId = missionKey.split("_")[1];
  const missionSlots = getMissionSlots(teamId, missionKey);
  const selectedSlots = getSelectedActionSlots(teamId, missionKey);
  const retrySlots = selectedSlots.length ? selectedSlots : [state.selectedSlotId].filter((slotId) => missionSlots[slotId]?.url);
  if (!retrySlots.length) return;
  if (!isLocalPreview()) {
    try {
      await callMobileApproveApi({
        projectId: state.projectId,
        teamId,
        missionId,
        action: "retry",
        reason,
        slotIds: retrySlots,
        passwordHash: getApproveSessionToken(),
      });
      applyRemoteRetryState(teamId, missionKey, missionId, reason, retrySlots);
      getSelectedSlotSet(teamId, missionKey).clear();
      closeRetryModal();
      pushRecentAction("재도전 요청", `${getTeamLabel(teamId)} · M${missionId} · ${retrySlots.length}개`);
      moveAfterAction(teamId, missionKey);
      render();
      window.setTimeout(() => {
        ensureSelection();
        render();
      }, 300);
      showApproveToast(`${getTeamLabel(teamId)} · M${missionId} ${retrySlots.length}개 슬롯에 재도전을 요청했습니다.`, "warn", 2600);
      return;
    } catch (error) {
      console.error(error);
      showApproveToast("서버 재도전 요청에 실패했습니다. Functions 배포와 경로를 확인하세요.", "error", 3200);
      return;
    }
  }
  const updates = {};
  retrySlots.forEach((slotId) => {
    updates[`uploads_meta/${state.projectId}/${teamId}/${missionKey}/${slotId}/status`] = "retry";
    updates[`uploads_meta/${state.projectId}/${teamId}/${missionKey}/${slotId}/retryReason`] = reason;
  });
  updates[`projects/${state.projectId}/teams/${teamId}/missions/${missionId}/stepStatus`] = null;
  updates[`projects/${state.projectId}/teams/${teamId}/missions/${missionId}/unlockAt`] = null;
  try {
    await update(ref(db), updates);
    await push(ref(db, `chat/${state.projectId}/${teamId}`), {
      sender: "HQ",
      text: `[본부] 사진 재도전 요청 - Mission ${missionId}\n${reason}`,
      createdAt: serverTimestamp(),
    });
    await recordMobileApproveLog("hq_photo_retry", {
      source: "mobile_approve",
      teamId,
      teamLabel: getTeamLabel(teamId),
      missionId,
      reason,
      slotIds: retrySlots,
    });
    closeRetryModal();
    getSelectedSlotSet(teamId, missionKey).clear();
    pushRecentAction("재도전 요청", `${getTeamLabel(teamId)} · M${missionId} · ${retrySlots.length}개`);
    moveAfterAction(teamId, missionKey);
    render();
    showApproveToast(`${getTeamLabel(teamId)} · M${missionId} ${retrySlots.length}개 슬롯에 재도전을 요청했습니다.`, "warn", 2600);
  } catch (error) {
    console.error(error);
    showApproveToast("재도전 요청 중 오류가 발생했습니다.", "error", 2800);
  }
}

function isMissionReady(slots = {}, requiredSlots = []) {
  return requiredSlots.length > 0 && requiredSlots.every((slotId) => slots[slotId]?.url);
}

function getTeamLabel(teamId) {
  const profile = state.teams[teamId]?.profile || {};
  const number = profile.number ?? teamNumber(teamId);
  return profile.name ? `${number}팀 ${profile.name}` : `${number}팀`;
}

function teamNumber(teamId) {
  return Number(String(teamId).replace("Team", "")) || 0;
}

function getMissionTotal() {
  return Number(state.meta.missionTotal) || 9;
}

function getApprovePasswordHash() {
  return String(state.meta.photoApprovalPasswordHash || "").trim();
}

function getApproveLegacyPassword() {
  return String(state.meta.photoApprovalPassword || "").trim();
}

function getApproveAuthKey() {
  return `${APPROVE_AUTH_STORAGE_KEY}:${state.projectId}`;
}

function getApproveSessionToken() {
  try {
    return window.sessionStorage.getItem(getApproveAuthKey()) || "";
  } catch (_error) {
    return "";
  }
}

async function restoreUnlockState() {
  const requiredHash = getApprovePasswordHash();
  const requiredLegacyPassword = getApproveLegacyPassword();
  if (!requiredHash && !requiredLegacyPassword) {
    state.unlocked = true;
    return;
  }
  try {
    const stored = window.sessionStorage.getItem(getApproveAuthKey()) || "";
    const expected = requiredHash || await hashSecret(requiredLegacyPassword);
    state.unlocked = stored === expected;
  } catch (_error) {
    state.unlocked = false;
  }
}

function syncLockState() {
  const requiredPassword = getApprovePasswordHash() || getApproveLegacyPassword();
  if (!elements.lock || !elements.shell) return;
  if (!requiredPassword) {
    state.unlocked = true;
    elements.lock.hidden = true;
    elements.shell.classList.remove("is-locked");
    return;
  }
  elements.lock.hidden = state.unlocked;
  elements.shell.classList.toggle("is-locked", !state.unlocked);
  if (elements.lockMessage) {
    elements.lockMessage.textContent = state.unlocked
      ? "모바일 승인 잠금이 해제되었습니다."
      : "이 프로젝트의 모바일 사진 승인은 전용 비밀번호가 필요합니다.";
  }
}

async function handleUnlockSubmit() {
  const requiredHash = getApprovePasswordHash();
  const requiredLegacyPassword = getApproveLegacyPassword();
  if (!requiredHash && !requiredLegacyPassword) {
    state.unlocked = true;
    syncLockState();
    render();
    return;
  }
  const inputPassword = elements.lockInput?.value || "";
  const inputHash = await hashSecret(inputPassword);
  const expectedHash = requiredHash || await hashSecret(requiredLegacyPassword);
  if (!inputPassword || inputHash !== expectedHash) {
    if (elements.lockMessage) {
      elements.lockMessage.textContent = "비밀번호가 맞지 않습니다. 다시 확인하세요.";
    }
    showApproveToast("모바일 승인 비밀번호가 일치하지 않습니다.", "error", 2600);
    elements.lockInput?.focus();
    return;
  }
  state.unlocked = true;
  try {
    window.sessionStorage.setItem(getApproveAuthKey(), expectedHash);
  } catch (_error) {
    // Ignore storage errors and keep current in-memory unlock state.
  }
  if (elements.lockInput) {
    elements.lockInput.value = "";
  }
  syncLockState();
  render();
  showApproveToast("모바일 사진 승인 잠금이 해제되었습니다.", "success", 2400);
}
