import { db, ref, onValue, update, push, serverTimestamp } from "./firebase_config.js";
import { requireProjectContext, storeProjectContext } from "./project_context.js";
import { getStepConfig, normalizeMissionEntry } from "./mission_rules.js";
import { formatSlotLabelFromMission, getRequiredSlotsFromMission } from "./photo_slots.js";
import { resolveMissionConfigFromProject } from "./project_mission_resolver.js";

const DEFAULT_SLOT_TEMPLATE = ["Photo1", "Photo2", "S1"];
const DEFAULT_REVIEW_TITLE = document.title;
const REVIEW_ALERTS_STORAGE_KEY = "smr_review_alerts_enabled_v1";
const REVIEW_SOUND_STORAGE_KEY = "smr_review_sound_enabled_v1";
const REVIEW_ALERT_SCOPE_STORAGE_KEY = "smr_review_alert_scope_v1";
const params = new URLSearchParams(window.location.search);
const projectIdFromQuery = params.get("project");
const projectContext = projectIdFromQuery
  ? { projectId: projectIdFromQuery }
  : requireProjectContext({
      fallbackUrl: new URL("./admin.html", window.location.href).toString(),
    });

const elements = {
  title: document.getElementById("reviewTitle"),
  subtitle: document.getElementById("reviewSubtitle"),
  alertScopeBtn: document.getElementById("reviewAlertScopeBtn"),
  alertToggleBtn: document.getElementById("reviewAlertToggleBtn"),
  soundToggleBtn: document.getElementById("reviewSoundToggleBtn"),
  refreshBtn: document.getElementById("reviewRefreshBtn"),
  openPhotoApproveBtn: document.getElementById("reviewOpenPhotoApproveBtn"),
  openHQBtn: document.getElementById("reviewOpenHQBtn"),
  queueBadge: document.getElementById("reviewQueueBadge"),
  queue: document.getElementById("reviewQueue"),
  filters: Array.from(document.querySelectorAll("[data-review-filter]")),
  selectedTeam: document.getElementById("reviewSelectedTeam"),
  missionBadge: document.getElementById("reviewMissionBadge"),
  missionTabs: document.getElementById("reviewMissionTabs"),
  boardBadge: document.getElementById("reviewBoardBadge"),
  board: document.getElementById("reviewBoard"),
  batchBadge: document.getElementById("reviewBatchBadge"),
  batchList: document.getElementById("reviewBatchList"),
  gallery: document.getElementById("reviewGallery"),
  preview: document.getElementById("reviewPreview"),
  hoverPreview: document.getElementById("reviewHoverPreview"),
  toast: document.getElementById("reviewToast"),
  approveBtn: document.getElementById("reviewApproveBtn"),
  retryBtn: document.getElementById("reviewRetryBtn"),
  prevIssueBtn: document.getElementById("reviewPrevIssueBtn"),
  nextIssueBtn: document.getElementById("reviewNextIssueBtn"),
  statusText: document.getElementById("reviewStatusText"),
  chatBadge: document.getElementById("reviewChatBadge"),
  chat: document.getElementById("reviewChat"),
  chatInput: document.getElementById("reviewChatInput"),
  chatSendBtn: document.getElementById("reviewChatSendBtn"),
  retryModal: document.getElementById("reviewRetryModal"),
  retryMeta: document.getElementById("reviewRetryMeta"),
  retryInput: document.getElementById("reviewRetryInput"),
  retryClose: document.getElementById("reviewRetryClose"),
  retryCancel: document.getElementById("reviewRetryCancel"),
  retrySubmit: document.getElementById("reviewRetrySubmit"),
  retryPresets: Array.from(document.querySelectorAll("[data-retry-preset]")),
};

const state = {
  projectId: projectContext?.projectId || "",
  meta: {},
  teams: {},
  uploads: {},
  routing: null,
  teamOverrides: {},
  selectedTeamId: "",
  selectedMissionKey: "",
  selectedSlotId: "",
  filter: "pending",
  chatUnsubscribers: [],
  currentChatItems: [],
  selectedSlotsByMission: {},
  selectedBatchByMission: {},
  uploadAlertReady: false,
  seenUploadKeys: new Set(),
  alertCount: 0,
  lastAlertAt: 0,
  alertsEnabled: readStoredFlag(REVIEW_ALERTS_STORAGE_KEY, true),
  soundEnabled: readStoredFlag(REVIEW_SOUND_STORAGE_KEY, true),
  alertScope: readStoredScope(),
  toastTimer: null,
};

if (!state.projectId) {
  window.location.href = new URL("./admin.html", window.location.href).toString();
} else {
  document.addEventListener("DOMContentLoaded", initialize);
}

function initialize() {
  elements.alertScopeBtn?.addEventListener("click", () => {
    state.alertScope = state.alertScope === "all" ? "pending" : "all";
    window.localStorage.setItem(REVIEW_ALERT_SCOPE_STORAGE_KEY, state.alertScope);
    renderAlertControls();
  });
  elements.alertToggleBtn?.addEventListener("click", () => {
    state.alertsEnabled = !state.alertsEnabled;
    window.localStorage.setItem(REVIEW_ALERTS_STORAGE_KEY, state.alertsEnabled ? "1" : "0");
    if (!state.alertsEnabled) clearReviewAlerts();
    renderAlertControls();
  });
  elements.soundToggleBtn?.addEventListener("click", () => {
    state.soundEnabled = !state.soundEnabled;
    window.localStorage.setItem(REVIEW_SOUND_STORAGE_KEY, state.soundEnabled ? "1" : "0");
    renderAlertControls();
  });
  elements.refreshBtn?.addEventListener("click", () => {
    clearReviewAlerts();
    renderAll();
  });
  elements.openHQBtn?.addEventListener("click", () => {
    const nextUrl = new URL("./hq.html", window.location.href);
    nextUrl.searchParams.set("project", state.projectId);
    window.open(nextUrl.toString(), "_blank");
  });
  elements.openPhotoApproveBtn?.addEventListener("click", () => {
    const nextUrl = new URL("./photo_approve.html", window.location.href);
    nextUrl.searchParams.set("project", state.projectId);
    window.open(nextUrl.toString(), "_blank");
  });
  elements.filters.forEach((button) => {
    button.addEventListener("click", () => {
      clearReviewAlerts();
      state.filter = button.dataset.reviewFilter || "pending";
      elements.filters.forEach((item) => item.classList.toggle("is-active", item === button));
      ensureSelectedQueueItem();
      renderAll();
    });
  });
  elements.approveBtn?.addEventListener("click", approveCurrentMission);
  elements.retryBtn?.addEventListener("click", openRetryModal);
  elements.prevIssueBtn?.addEventListener("click", () => moveQueueSelection(-1));
  elements.nextIssueBtn?.addEventListener("click", () => moveQueueSelection(1));
  elements.chatSendBtn?.addEventListener("click", sendChatMessage);
  elements.chatInput?.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      sendChatMessage();
    }
  });
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
      const preset = button.dataset.retryPreset || "";
      if (!elements.retryInput) return;
      elements.retryInput.value = preset;
      elements.retryInput.focus();
      elements.retryInput.setSelectionRange(elements.retryInput.value.length, elements.retryInput.value.length);
    });
  });

  document.addEventListener("click", handleReviewInteraction, true);
  document.addEventListener("keydown", handleReviewInteraction, true);

  renderAlertControls();
  subscribeProject();
}

function subscribeProject() {
  const { projectId } = state;
  onValue(ref(db, `projects/${projectId}/meta`), (snapshot) => {
    state.meta = snapshot.val() || {};
    storeProjectContext({
      projectId,
      projectName: state.meta.name || projectId,
      logoUrl: state.meta.logoUrl || "",
      teamCount: state.meta.teamCount || 0,
    });
    ensureSelectedQueueItem();
    renderAll();
  });

  onValue(ref(db, `projects/${projectId}/teams`), (snapshot) => {
    state.teams = snapshot.val() || {};
    ensureSelectedQueueItem();
    renderAll();
  });
  onValue(ref(db, `projects/${projectId}/routing`), (snapshot) => {
    state.routing = snapshot.val() || null;
    ensureSelectedQueueItem();
    renderAll();
  });
  onValue(ref(db, `projects/${projectId}/teamOverrides`), (snapshot) => {
    state.teamOverrides = snapshot.val() || {};
    ensureSelectedQueueItem();
    renderAll();
  });

  onValue(ref(db, `uploads_meta/${projectId}`), (snapshot) => {
    const nextUploads = snapshot.val() || {};
    reconcileUploadAlerts(nextUploads);
    state.uploads = nextUploads;
    ensureSelectedQueueItem();
    renderAll();
  });
}

function renderHeader() {
  if (elements.title) {
    elements.title.textContent = `${state.meta.name || state.projectId} 사진 검수`;
  }
  if (elements.subtitle) {
    const teamCount = Number(state.meta.teamCount) || Object.keys(state.teams).length || 0;
    elements.subtitle.textContent = `사진 대기 ${getQueueItems("pending").length}팀 · 전체 팀 ${teamCount}개`;
  }
  syncReviewAlertPresentation();
}

function renderAll() {
  renderHeader();
  renderQueue();
  renderBoard();
  renderMissionTabs();
  renderGallery();
  renderStatus();
  renderActionState();
  renderChat();
}

function renderBoard() {
  const queueItems = getQueueItems(state.filter === "all" ? "all" : state.filter);
  if (elements.boardBadge) {
    elements.boardBadge.textContent = `${queueItems.length}팀`;
  }
  if (!elements.board) return;
  if (!queueItems.length) {
    elements.board.innerHTML = `<div class="review-queue-item"><div class="review-queue-item__meta">표시할 사진이 없습니다.</div></div>`;
    return;
  }
  elements.board.innerHTML = queueItems.map((item) => {
    const cards = item.missionKeys.map((missionKey) => renderBoardMissionCard(item.teamId, missionKey)).join("");
    return `
      <article class="review-board__row">
        <div class="review-board__team">
          <strong>${escapeHtml(item.teamLabel)}</strong>
          <span>대기 ${item.pendingCount} · 재도전 ${item.retryCount}</span>
        </div>
        <div class="review-board__missions">${cards}</div>
      </article>
    `;
  }).join("");

  elements.board.querySelectorAll("[data-board-team][data-board-mission]").forEach((card) => {
    card.addEventListener("click", () => {
      clearReviewAlerts();
      state.selectedTeamId = card.dataset.boardTeam || "";
      state.selectedMissionKey = card.dataset.boardMission || "";
      state.selectedSlotId = getFirstAvailableSlot(state.selectedTeamId, state.selectedMissionKey);
      subscribeChat();
      renderAll();
    });
  });

  elements.board.querySelectorAll("[data-preview-url]").forEach((thumb) => {
    thumb.addEventListener("mouseenter", () => showHoverPreview(thumb));
    thumb.addEventListener("mousemove", (event) => moveHoverPreview(event));
    thumb.addEventListener("mouseleave", hideHoverPreview);
  });
}

function renderBoardMissionCard(teamId, missionKey) {
  const missionId = Number(missionKey.split("_")[1]) || 0;
  const slots = getMissionSlots(teamId, missionKey);
  const requiredSlots = getRequiredSlots(teamId, missionKey);
  const reviewState = getMissionReviewState(teamId, missionKey);
  const stepLabel = getReviewStepLabel(teamId, missionKey, slots);
  const thumbs = requiredSlots.map((slotId) => {
    const item = slots[slotId];
    const slotLabel = getSlotLabel(teamId, missionKey, slotId);
    if (!item?.url) {
      return `<div class="review-board-card__thumb review-board-card__thumb--empty" title="${escapeHtml(slotLabel)}">없음</div>`;
    }
    const media = item.type?.startsWith("video")
      ? `<video src="${item.url}" muted playsinline></video>`
      : `<img src="${item.url}" alt="${escapeHtml(slotLabel)}" />`;
    return `
      <div
        class="review-board-card__thumb"
        title="${escapeHtml(slotLabel)}"
        data-preview-url="${escapeHtml(item.url)}"
        data-preview-type="${escapeHtml(item.type || "image/*")}"
        data-preview-label="${escapeHtml(`${getTeamLabel(teamId)} · ${stepLabel} · ${slotLabel}`)}"
      >${media}</div>
    `;
  }).join("");
  return `
    <button
      type="button"
      class="review-board-card review-board-card--${reviewState === "retry" ? "retry" : reviewState === "approved" ? "approved" : "pending"} ${teamId === state.selectedTeamId && missionKey === state.selectedMissionKey ? "is-active" : ""}"
      data-board-team="${teamId}"
      data-board-mission="${missionKey}"
    >
      <div class="review-board-card__head">
        <strong>${escapeHtml(stepLabel)}</strong>
        <span class="review-board-card__state">${reviewState === "retry" ? "재도전" : reviewState === "approved" ? "승인" : "대기"}</span>
      </div>
      <div class="review-board-card__thumbs">${thumbs}</div>
    </button>
  `;
}

function ensureSelectedQueueItem() {
  const queue = getQueueItems(state.filter);
  if (!queue.length) {
    state.selectedTeamId = "";
    state.selectedMissionKey = "";
    state.selectedSlotId = "";
    subscribeChat();
    return;
  }
  if (!queue.find((item) => item.teamId === state.selectedTeamId)) {
    state.selectedTeamId = queue[0].teamId;
  }
  const missionKeys = getVisibleMissionKeys(state.selectedTeamId, state.filter);
  if (!missionKeys.length) {
    state.selectedMissionKey = "";
    state.selectedSlotId = "";
  } else {
    if (!missionKeys.includes(state.selectedMissionKey)) {
      state.selectedMissionKey = missionKeys[0];
    }
    const firstSlot = getFirstAvailableSlot(state.selectedTeamId, state.selectedMissionKey);
    if (!state.selectedSlotId || !getMissionSlots(state.selectedTeamId, state.selectedMissionKey)[state.selectedSlotId]) {
      state.selectedSlotId = firstSlot;
    }
  }
  subscribeChat();
}

function getQueueItems(filter = "pending") {
  const teamIds = new Set([...Object.keys(state.teams || {}), ...Object.keys(state.uploads || {})]);
  return Array.from(teamIds)
    .map((teamId) => {
      const missionKeys = getVisibleMissionKeys(teamId, filter);
      if (!missionKeys.length) return null;
      const summary = summarizeTeamPhotoState(teamId);
      return {
        teamId,
        teamLabel: getTeamLabel(teamId),
        missionKeys,
        ...summary,
      };
    })
    .filter(Boolean)
    .sort((a, b) => teamNumber(a.teamId) - teamNumber(b.teamId));
}

function getVisibleMissionKeys(teamId, filter = "pending") {
  const teamUploads = state.uploads[teamId] || {};
  return Object.keys(teamUploads)
    .filter((missionKey) => missionKey.startsWith("mission_"))
    .sort((a, b) => Number(a.split("_")[1]) - Number(b.split("_")[1]))
    .filter((missionKey) => {
      const missionState = getMissionReviewState(teamId, missionKey);
      if (filter === "retry") return missionState === "retry";
      if (filter === "all") return missionState === "pending" || missionState === "retry";
      return missionState === "pending";
    });
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

function getSelectedBatchKey(teamId, missionKey) {
  return `${teamId}:${missionKey}`;
}

function summarizeTeamPhotoState(teamId) {
  const missionKeys = Object.keys(state.uploads[teamId] || {}).filter((key) => key.startsWith("mission_"));
  let pendingCount = 0;
  let retryCount = 0;
  missionKeys.forEach((missionKey) => {
    const reviewState = getMissionReviewState(teamId, missionKey);
    if (reviewState === "retry") retryCount += 1;
    else if (reviewState === "pending") pendingCount += 1;
  });
  return { pendingCount, retryCount };
}

function getMissionReviewState(teamId, missionKey) {
  const slots = getMissionSlots(teamId, missionKey);
  const requiredSlots = getRequiredSlots(teamId, missionKey);
  if (!requiredSlots.length) return "none";
  const statuses = requiredSlots
    .map((slotId) => slots[slotId]?.status || "")
    .filter(Boolean);
  const hasAllFiles = requiredSlots.every((slotId) => slots[slotId]?.url);
  if (!hasAllFiles) return "none";
  if (statuses.some((status) => status === "retry")) return "retry";
  if (statuses.every((status) => status === "approved")) return "approved";
  return "pending";
}

function getMissionSlots(teamId, missionKey) {
  return state.uploads[teamId]?.[missionKey] || {};
}

function getReviewMissionEntry(teamId, missionKey) {
  const missionId = Number(missionKey.split("_")[1]);
  const missionTotal = Number(state.meta.missionTotal) || 9;
  const legacyMission = state.teams[teamId]?.config?.missions?.[missionId] || {};
  const teamOverride = state.teamOverrides?.[teamId] || {};
  return normalizeMissionEntry(resolveMissionConfigFromProject({
    teamId,
    missionNumber: missionId,
    missionTotal,
    routing: state.routing,
    teamOverride,
    legacyMission,
    meta: state.meta,
  }));
}

function getReviewRouteKey(teamId, missionKey) {
  return String(getReviewMissionEntry(teamId, missionKey)?.routeKey || "").trim().toUpperCase();
}

function getReviewRouteLabel(teamId, missionKey) {
  return String(getReviewMissionEntry(teamId, missionKey)?.routeLabel || "").trim();
}

function getReviewStepLabel(teamId, missionKey, slots = null) {
  const missionId = Number(missionKey.split("_")[1]) || 0;
  const missionSlots = slots || getMissionSlots(teamId, missionKey);
  const firstItem = Object.values(missionSlots || {}).find((item) => item?.url);
  const explicitStepKey = String(firstItem?.stepKey || "").trim();
  if (explicitStepKey === "codeStep") return `코드 ${missionId}`;
  if (explicitStepKey === "missionStep") return `미션 ${missionId}`;
  const missionState = state.teams?.[teamId]?.missions?.[missionId];
  if (missionState?.stage === "mission" && Object.keys(missionSlots || {}).length) {
    return `코드 ${missionId}`;
  }
  return `미션 ${missionId}`;
}

function getRequiredSlots(teamId, missionKey) {
  const mission = getReviewMissionEntry(teamId, missionKey);
  return getRequiredSlotsFromMission(mission, { fallbackSlots: DEFAULT_SLOT_TEMPLATE });
}

function getSlotLabel(teamId, missionKey, slotId) {
  const mission = getReviewMissionEntry(teamId, missionKey);
  return formatSlotLabelFromMission(mission, slotId, { fallbackSlots: DEFAULT_SLOT_TEMPLATE });
}

function getFirstAvailableSlot(teamId, missionKey) {
  const slots = getMissionSlots(teamId, missionKey);
  const requiredSlots = getRequiredSlots(teamId, missionKey);
  return requiredSlots.find((slotId) => slots[slotId]?.url) || requiredSlots[0] || "";
}

function renderQueue() {
  const queueItems = getQueueItems(state.filter);
  if (elements.queueBadge) {
    elements.queueBadge.textContent = `${queueItems.length}팀`;
  }
  if (!elements.queue) return;
  if (!queueItems.length) {
    elements.queue.innerHTML = `<div class="review-queue-item"><div class="review-queue-item__meta">현재 필터에 맞는 사진 대기 팀이 없습니다.</div></div>`;
    return;
  }
  elements.queue.innerHTML = queueItems
    .map((item) => `
      <article class="review-queue-item ${item.teamId === state.selectedTeamId ? "is-active" : ""}" data-team-id="${item.teamId}">
        <div class="review-queue-item__head">
          <div class="review-queue-item__title">${item.teamLabel}</div>
          <span class="review-badge">${item.missionKeys.length}개</span>
        </div>
        <div class="review-queue-item__meta">승인 대기 ${item.pendingCount} · 재도전 ${item.retryCount}</div>
        <div class="review-queue-item__chips">
          ${item.pendingCount ? `<span class="review-chip review-chip--pending">대기 ${item.pendingCount}</span>` : ""}
          ${item.retryCount ? `<span class="review-chip review-chip--retry">재도전 ${item.retryCount}</span>` : ""}
        </div>
      </article>
    `)
    .join("");

  elements.queue.querySelectorAll("[data-team-id]").forEach((item) => {
    item.addEventListener("click", () => {
      clearReviewAlerts();
      state.selectedTeamId = item.dataset.teamId || "";
      const missionKeys = getVisibleMissionKeys(state.selectedTeamId, state.filter);
      state.selectedMissionKey = missionKeys[0] || "";
      state.selectedSlotId = getFirstAvailableSlot(state.selectedTeamId, state.selectedMissionKey);
      subscribeChat();
      renderAll();
    });
  });
}

function renderMissionTabs() {
  const teamId = state.selectedTeamId;
  const missionKeys = teamId ? getVisibleMissionKeys(teamId, state.filter) : [];
  if (elements.selectedTeam) {
    elements.selectedTeam.textContent = teamId ? getTeamLabel(teamId) : "팀을 선택하세요.";
  }
  if (elements.missionBadge) {
    elements.missionBadge.textContent = state.selectedMissionKey
      ? `미션 ${state.selectedMissionKey.split("_")[1]}`
      : "미션 -";
  }
  if (!elements.missionTabs) return;
  if (!missionKeys.length) {
    elements.missionTabs.innerHTML = "";
    return;
  }
  elements.missionTabs.innerHTML = missionKeys
    .map((missionKey) => {
      const reviewState = getMissionReviewState(teamId, missionKey);
      const missionId = missionKey.split("_")[1];
      const routeKey = getReviewRouteKey(teamId, missionKey);
      const routeLabel = getReviewRouteLabel(teamId, missionKey);
      return `
        <button
          type="button"
          class="review-mission-tab ${missionKey === state.selectedMissionKey ? "is-active" : ""}"
          data-mission-key="${missionKey}"
        >
          M${missionId}${routeKey ? ` · 공통 ${routeKey}${routeLabel && routeLabel !== routeKey ? `(${routeLabel})` : ""}` : ""} · ${reviewState === "retry" ? "재도전" : "대기"}
        </button>
      `;
    })
    .join("");
  elements.missionTabs.querySelectorAll("[data-mission-key]").forEach((button) => {
    button.addEventListener("click", () => {
      clearReviewAlerts();
      state.selectedMissionKey = button.dataset.missionKey || "";
      state.selectedSlotId = getFirstAvailableSlot(state.selectedTeamId, state.selectedMissionKey);
      renderAll();
    });
  });
}

function renderGallery() {
  const teamId = state.selectedTeamId;
  const missionKey = state.selectedMissionKey;
  const slots = teamId && missionKey ? getMissionSlots(teamId, missionKey) : {};
  const requiredSlots = teamId && missionKey ? getRequiredSlots(teamId, missionKey) : [];
  if (!elements.gallery) return;
  if (!teamId || !missionKey) {
    if (elements.batchList) elements.batchList.innerHTML = "";
    if (elements.batchBadge) elements.batchBadge.textContent = "0묶음";
    elements.gallery.innerHTML = "";
    if (elements.preview) elements.preview.textContent = "사진을 선택하면 크게 표시됩니다.";
    return;
  }
  renderBatchList(teamId, missionKey, slots);
  elements.gallery.innerHTML = requiredSlots
    .map((slotId) => {
      const item = slots[slotId];
      const label = getSlotLabel(teamId, missionKey, slotId);
      const status = item?.status || (item?.url ? "pending" : "empty");
      const checked = getSelectedSlotSet(teamId, missionKey).has(slotId) ? "checked" : "";
      return `
        <article class="review-thumb ${slotId === state.selectedSlotId ? "is-active" : ""}" data-slot-id="${slotId}">
          <div class="review-thumb__head">
            <strong>${label}</strong>
            <label class="review-thumb__check">
              <input type="checkbox" data-slot-check="${slotId}" ${checked} ${item?.url ? "" : "disabled"} />
              선택
            </label>
            <span class="review-chip review-chip--${status === "approved" ? "done" : status === "retry" ? "retry" : "pending"}">
              ${status === "approved" ? "승인" : status === "retry" ? "재도전" : item?.url ? "대기" : "없음"}
            </span>
          </div>
          <div class="review-thumb__media">
            ${
              item?.url
                ? item.type?.startsWith("video")
                  ? `<video src="${item.url}" muted playsinline></video>`
                  : `<img src="${item.url}" alt="${label}" />`
                : `<span>업로드 없음</span>`
            }
          </div>
        </article>
      `;
    })
    .join("");

  elements.gallery.querySelectorAll("[data-slot-id]").forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedSlotId = card.dataset.slotId || "";
      renderPreview();
      renderGallery();
    });
  });
  elements.gallery.querySelectorAll("[data-slot-check]").forEach((input) => {
    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("change", (event) => {
      const slotId = event.target.dataset.slotCheck || "";
      const selectedSet = getSelectedSlotSet(teamId, missionKey);
      if (event.target.checked) selectedSet.add(slotId);
      else selectedSet.delete(slotId);
      renderActionState();
    });
  });
  renderPreview();
}

function renderBatchList(teamId, missionKey, slots = {}) {
  if (!elements.batchList || !elements.batchBadge) return;
  const batches = groupSlotsByBatch(slots);
  const batchKey = getSelectedBatchKey(teamId, missionKey);
  const selectedBatchId = state.selectedBatchByMission[batchKey] || "";
  elements.batchBadge.textContent = `${batches.length}묶음`;
  if (!batches.length) {
    elements.batchList.innerHTML = `<div class="review-batch review-batch--empty">배치 정보가 없습니다.</div>`;
    return;
  }
  elements.batchList.innerHTML = batches.map((batch) => `
    <button type="button" class="review-batch ${selectedBatchId === batch.batchId ? "is-active" : ""}" data-batch-id="${escapeHtml(batch.batchId)}">
      <strong>${escapeHtml(batch.batchLabel)}</strong>
      <span>${batch.slotCount}개 슬롯 · ${batch.fileCount}개 파일</span>
      <span>${batch.uploadedAtLabel}</span>
    </button>
  `).join("");
  elements.batchList.querySelectorAll("[data-batch-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextId = button.dataset.batchId || "";
      state.selectedBatchByMission[batchKey] = state.selectedBatchByMission[batchKey] === nextId ? "" : nextId;
      const selectedSet = getSelectedSlotSet(teamId, missionKey);
      selectedSet.clear();
      if (state.selectedBatchByMission[batchKey]) {
        batches.find((item) => item.batchId === state.selectedBatchByMission[batchKey])?.slotIds.forEach((slotId) => selectedSet.add(slotId));
      }
      renderGallery();
      renderActionState();
    });
  });
}

function groupSlotsByBatch(slots = {}) {
  const batchMap = new Map();
  Object.entries(slots).forEach(([slotId, slot]) => {
    if (!slot?.url) return;
    const batchId = String(slot.batchId || `single_${slotId}`).trim();
    if (!batchMap.has(batchId)) {
      batchMap.set(batchId, {
        batchId,
        slotIds: [],
        fileCount: 0,
        latestUploadedAt: 0,
      });
    }
    const batch = batchMap.get(batchId);
    batch.slotIds.push(slotId);
    batch.fileCount += 1;
    batch.latestUploadedAt = Math.max(batch.latestUploadedAt, Number(slot.uploadedAt) || 0);
  });
  return Array.from(batchMap.values())
    .map((batch, index) => ({
      ...batch,
      slotCount: batch.slotIds.length,
      batchLabel: batch.batchId.startsWith("batch_") ? `배치 ${index + 1}` : "단건 업로드",
      uploadedAtLabel: batch.latestUploadedAt ? formatDateTime(batch.latestUploadedAt) : "-",
    }))
    .sort((a, b) => b.latestUploadedAt - a.latestUploadedAt);
}

function renderPreview() {
  if (!elements.preview) return;
  const slots = getMissionSlots(state.selectedTeamId, state.selectedMissionKey);
  const slot = slots[state.selectedSlotId];
  if (!slot?.url) {
    elements.preview.textContent = "업로드된 파일이 없습니다.";
    return;
  }
  elements.preview.innerHTML = slot.type?.startsWith("video")
    ? `<video src="${slot.url}" controls playsinline></video>`
    : `<img src="${slot.url}" alt="${state.selectedSlotId}" />`;
}

function showHoverPreview(target) {
  if (!elements.hoverPreview) return;
  const url = target.dataset.previewUrl || "";
  if (!url) return;
  const type = target.dataset.previewType || "";
  const label = target.dataset.previewLabel || "";
  elements.hoverPreview.innerHTML = type.startsWith("video")
    ? `<video src="${url}" autoplay muted loop playsinline></video><div class="review-hover-preview__meta">${escapeHtml(label)}</div>`
    : `<img src="${url}" alt="${escapeHtml(label)}" /><div class="review-hover-preview__meta">${escapeHtml(label)}</div>`;
  elements.hoverPreview.hidden = false;
}

function moveHoverPreview(event) {
  if (!elements.hoverPreview || elements.hoverPreview.hidden) return;
  const offset = 18;
  const width = 280;
  const x = Math.min(window.innerWidth - width - 16, event.clientX + offset);
  const y = Math.min(window.innerHeight - 260, event.clientY + offset);
  elements.hoverPreview.style.left = `${Math.max(16, x)}px`;
  elements.hoverPreview.style.top = `${Math.max(16, y)}px`;
}

function hideHoverPreview() {
  if (!elements.hoverPreview) return;
  elements.hoverPreview.hidden = true;
  elements.hoverPreview.innerHTML = "";
}

function renderStatus() {
  if (!elements.statusText) return;
  if (!state.selectedTeamId || !state.selectedMissionKey) {
    elements.statusText.textContent = "왼쪽 대기 큐에서 팀을 선택하세요.";
    return;
  }
  const reviewState = getMissionReviewState(state.selectedTeamId, state.selectedMissionKey);
  const requiredSlots = getRequiredSlots(state.selectedTeamId, state.selectedMissionKey).length;
  const routeKey = getReviewRouteKey(state.selectedTeamId, state.selectedMissionKey);
  const routeLabel = getReviewRouteLabel(state.selectedTeamId, state.selectedMissionKey);
  elements.statusText.textContent = `${getTeamLabel(state.selectedTeamId)} · M${state.selectedMissionKey.split("_")[1]}${routeKey ? ` · 공통 ${routeKey}${routeLabel && routeLabel !== routeKey ? `(${routeLabel})` : ""}` : ""} · 슬롯 ${requiredSlots}개 · ${
    reviewState === "retry" ? "재도전 요청됨" : reviewState === "pending" ? "승인 대기" : "준비 상태 확인 필요"
  }`;
}

async function recordReviewLog(action, details = {}) {
  try {
    await push(ref(db, `ops_logs/${state.projectId}`), {
      action,
      details,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn(`Review log skipped: ${action}`, error);
    if (elements.statusText) {
      elements.statusText.textContent = "운영 로그 기록은 건너뛰고 사진 상태만 반영했습니다.";
    }
  }
}

function renderActionState() {
  const teamId = state.selectedTeamId;
  const missionKey = state.selectedMissionKey;
  const slots = teamId && missionKey ? getMissionSlots(teamId, missionKey) : {};
  const requiredSlots = teamId && missionKey ? getRequiredSlots(teamId, missionKey) : [];
  const selectedSlots = teamId && missionKey ? getSelectedActionSlots(teamId, missionKey) : [];
  const ready = teamId && missionKey && (selectedSlots.length > 0 || isMissionReady(slots, requiredSlots));
  if (elements.approveBtn) {
    elements.approveBtn.disabled = !ready;
    elements.approveBtn.textContent = selectedSlots.length > 0 ? `선택 승인 (${selectedSlots.length})` : "전체 승인";
  }
  if (elements.retryBtn) {
    elements.retryBtn.disabled = !teamId || !missionKey || (!selectedSlots.length && !slots[state.selectedSlotId]?.url);
    elements.retryBtn.textContent = selectedSlots.length > 0 ? `선택 재도전 (${selectedSlots.length})` : "현재 재도전";
  }
  if (elements.prevIssueBtn) {
    const queue = getQueueItems(state.filter);
    elements.prevIssueBtn.disabled = queue.length <= 1;
  }
  if (elements.nextIssueBtn) {
    const queue = getQueueItems(state.filter);
    elements.nextIssueBtn.disabled = queue.length <= 1;
  }
}

function getSelectedActionSlots(teamId, missionKey) {
  const slots = getMissionSlots(teamId, missionKey);
  return Array.from(getSelectedSlotSet(teamId, missionKey)).filter((slotId) => slots[slotId]?.url);
}

function renderChat() {
  if (!elements.chat) return;
  const items = state.currentChatItems || [];
  if (elements.chatBadge) {
    elements.chatBadge.textContent = `${items.length}건`;
  }
  if (!items.length) {
    elements.chat.innerHTML = `<div class="review-chat__item"><div class="review-chat__text">선택한 팀의 채팅이 없습니다.</div></div>`;
    return;
  }
  elements.chat.innerHTML = items
    .map((item) => `
      <div class="review-chat__item">
        <div class="review-chat__meta">${item.sender || "알 수 없음"} · ${item.createdAt ? formatDateTime(item.createdAt) : "-"}</div>
        <div class="review-chat__text">${escapeHtml(item.text || "")}</div>
      </div>
    `)
    .join("");
  elements.chat.scrollTop = elements.chat.scrollHeight;
}

function subscribeChat() {
  state.chatUnsubscribers.forEach((unsubscribe) => unsubscribe?.());
  state.chatUnsubscribers = [];
  state.currentChatItems = [];
  const teamId = state.selectedTeamId;
  if (!teamId || !state.projectId) {
    renderChat();
    return;
  }
  const mergeMessages = () => {
    state.currentChatItems.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
    renderChat();
  };
  const paths = [`chat/${state.projectId}/__broadcast`, `chat/${state.projectId}/${teamId}`];
  paths.forEach((path) => {
    const unsubscribe = onValue(ref(db, path), (snapshot) => {
      const raw = snapshot.val() || {};
      const roomItems = Object.entries(raw).map(([id, value]) => ({
        id: `${path}:${id}`,
        sender: value.sender || "시스템",
        text: value.text || "",
        createdAt: value.createdAt || 0,
      }));
      state.currentChatItems = [
        ...state.currentChatItems.filter((item) => !String(item.id || "").startsWith(`${path}:`)),
        ...roomItems,
      ];
      mergeMessages();
    });
    state.chatUnsubscribers.push(unsubscribe);
  });
}

async function sendChatMessage() {
  const teamId = state.selectedTeamId;
  const text = elements.chatInput?.value.trim() || "";
  if (!teamId || !text) return;
  await push(ref(db, `chat/${state.projectId}/${teamId}`), {
    sender: "HQ",
    text,
    createdAt: serverTimestamp(),
  });
  elements.chatInput.value = "";
}

function handleReviewInteraction(event) {
  if (!state.alertCount) return;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (
    target.closest("#reviewQueue")
    || target.closest("#reviewBoard")
    || target.closest("#reviewMissionTabs")
    || target.closest("#reviewGallery")
    || target.closest("#reviewPreview")
    || target.closest("#reviewRefreshBtn")
  ) {
    clearReviewAlerts();
  }
}

function collectUploadAlertItems(uploads = {}) {
  const items = [];
  Object.entries(uploads || {}).forEach(([teamId, missions]) => {
    Object.entries(missions || {}).forEach(([missionKey, slots]) => {
      Object.entries(slots || {}).forEach(([slotId, item]) => {
        if (!item?.url) return;
        if (state.alertScope !== "all" && item?.status === "retry") return;
        items.push({
          key: [teamId, missionKey, slotId, String(item.uploadedAt || 0), String(item.url || "")].join(":"),
          teamId,
          missionKey,
          slotId,
          item,
        });
      });
    });
  });
  return items;
}

function reconcileUploadAlerts(nextUploads = {}) {
  const nextItems = collectUploadAlertItems(nextUploads);
  const nextKeys = new Set(nextItems.map((item) => item.key));
  if (!state.uploadAlertReady) {
    state.seenUploadKeys = nextKeys;
    state.uploadAlertReady = true;
    syncReviewAlertPresentation();
    return;
  }
  const newItems = nextItems.filter((item) => !state.seenUploadKeys.has(item.key));
  state.seenUploadKeys = nextKeys;
  if (!newItems.length) {
    syncReviewAlertPresentation();
    return;
  }
  state.alertCount += newItems.length;
  triggerReviewAlerts(newItems);
  syncReviewAlertPresentation();
}

function triggerReviewAlerts(newItems = []) {
  if (!state.alertsEnabled) return;
  pulseReviewBadges();
  playReviewAlertTone();
  notifyReviewBrowser(newItems);
  showReviewToast(newItems);
}

function pulseReviewBadges() {
  [elements.queueBadge, elements.boardBadge].forEach((badge) => {
    if (!badge) return;
    badge.classList.remove("is-alert");
    void badge.offsetWidth;
    badge.classList.add("is-alert");
  });
  window.setTimeout(() => {
    [elements.queueBadge, elements.boardBadge].forEach((badge) => badge?.classList.remove("is-alert"));
  }, 2400);
}

function playReviewAlertTone() {
  if (!state.soundEnabled) return;
  const now = Date.now();
  if (now - state.lastAlertAt < 1500) return;
  state.lastAlertAt = now;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  try {
    const context = new AudioCtx();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.24);
    oscillator.onended = () => {
      try {
        context.close();
      } catch (_) {}
    };
  } catch (error) {
    console.warn("Review alert tone skipped", error);
  }
}

function notifyReviewBrowser(newItems = []) {
  if (!state.alertsEnabled) return;
  if (!("Notification" in window) || !newItems.length) return;
  const sendNotification = () => {
    if (Notification.permission !== "granted") return;
    const first = newItems[0];
    const stepLabel = getReviewStepLabel(first.teamId, first.missionKey, { [first.slotId]: first.item });
    const body = newItems.length === 1
      ? `${getTeamLabel(first.teamId)} · ${stepLabel}`
      : `${getTeamLabel(first.teamId)} 외 ${newItems.length - 1}건`;
    try {
      new Notification("새 사진 제출", {
        body,
        tag: `review-upload-${state.projectId}`,
        renotify: true,
      });
    } catch (error) {
      console.warn("Review browser notification skipped", error);
    }
  };
  if (Notification.permission === "granted") {
    sendNotification();
    return;
  }
  if (Notification.permission === "default") {
    Notification.requestPermission().then(() => sendNotification()).catch(() => {});
  }
}

function syncReviewAlertPresentation() {
  document.title = state.alertCount > 0 ? `(${state.alertCount}) ${DEFAULT_REVIEW_TITLE}` : DEFAULT_REVIEW_TITLE;
}

function clearReviewAlerts() {
  if (!state.alertCount) return;
  state.alertCount = 0;
  syncReviewAlertPresentation();
}

function renderAlertControls() {
  if (elements.alertScopeBtn) {
    elements.alertScopeBtn.textContent = state.alertScope === "all" ? "재도전 포함" : "승인 대기만";
    elements.alertScopeBtn.classList.toggle("is-active", state.alertScope === "all");
  }
  if (elements.alertToggleBtn) {
    elements.alertToggleBtn.textContent = state.alertsEnabled ? "알림 켜짐" : "알림 꺼짐";
    elements.alertToggleBtn.classList.toggle("is-active", state.alertsEnabled);
  }
  if (elements.soundToggleBtn) {
    elements.soundToggleBtn.textContent = state.soundEnabled ? "소리 켜짐" : "소리 꺼짐";
    elements.soundToggleBtn.classList.toggle("is-active", state.soundEnabled);
    elements.soundToggleBtn.disabled = !state.alertsEnabled;
  }
}

function readStoredFlag(key, fallback = true) {
  try {
    const value = window.localStorage.getItem(key);
    if (value === "1") return true;
    if (value === "0") return false;
  } catch (_) {}
  return fallback;
}

function readStoredScope() {
  try {
    const value = window.localStorage.getItem(REVIEW_ALERT_SCOPE_STORAGE_KEY);
    return value === "all" ? "all" : "pending";
  } catch (_) {
    return "pending";
  }
}

function showReviewToast(newItems = []) {
  if (!elements.toast || !newItems.length) return;
  const first = newItems[0];
  const stepLabel = getReviewStepLabel(first.teamId, first.missionKey, { [first.slotId]: first.item });
  const summary = newItems.length === 1
    ? `${getTeamLabel(first.teamId)} · ${stepLabel}`
    : `${getTeamLabel(first.teamId)} 외 ${newItems.length - 1}건`;
  elements.toast.textContent = `새 사진 제출: ${summary}`;
  elements.toast.hidden = false;
  if (state.toastTimer) window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => {
    if (elements.toast) elements.toast.hidden = true;
    state.toastTimer = null;
  }, 3200);
}

function moveQueueSelection(direction = 1) {
  const queue = getQueueItems(state.filter);
  if (!queue.length) return;
  const currentIndex = queue.findIndex((item) => item.teamId === state.selectedTeamId);
  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + direction + queue.length) % queue.length;
  state.selectedTeamId = queue[nextIndex].teamId;
  const missionKeys = getVisibleMissionKeys(state.selectedTeamId, state.filter);
  state.selectedMissionKey = missionKeys[0] || "";
  state.selectedSlotId = getFirstAvailableSlot(state.selectedTeamId, state.selectedMissionKey);
  subscribeChat();
  renderAll();
}

async function approveCurrentMission() {
  const teamId = state.selectedTeamId;
  const missionKey = state.selectedMissionKey;
  if (!teamId || !missionKey) return;
  const missionId = missionKey.split("_")[1];
  const missionSlots = getMissionSlots(teamId, missionKey);
  const requiredSlots = getRequiredSlots(teamId, missionKey);
  const targetSlotIds = getSelectedActionSlots(teamId, missionKey);
  const approvalSlots = targetSlotIds.length ? targetSlotIds : requiredSlots;
  if (!approvalSlots.length || !approvalSlots.every((slotId) => missionSlots[slotId]?.url)) {
    if (elements.statusText) elements.statusText.textContent = "선택한 슬롯에 업로드된 파일이 있어야 승인할 수 있습니다.";
    return;
  }

  const updates = {};
  approvalSlots.forEach((slotId) => {
    updates[`uploads_meta/${state.projectId}/${teamId}/${missionKey}/${slotId}/status`] = "approved";
  });
  const missionConfig = getReviewMissionEntry(teamId, `mission_${missionId}`);
  const currentStage = state.teams[teamId]?.missions?.[missionId]?.stage === "code" ? "codeStep" : "missionStep";
  const currentStep = getStepConfig(missionConfig, currentStage);
  const delaySeconds = Number(currentStep.autoAdvanceSeconds) || 0;
  const allApproved = requiredSlots.length > 0
    && requiredSlots.every((slotId) => {
      if (approvalSlots.includes(slotId)) return missionSlots[slotId]?.url;
      return missionSlots[slotId]?.url && missionSlots[slotId]?.status === "approved";
    });

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
    await recordReviewLog("hq_photo_approve", {
      source: "review",
      teamId,
      teamLabel: getTeamLabel(teamId),
      missionId,
      delaySeconds,
      slotIds: approvalSlots,
      allApproved,
    });
    getSelectedSlotSet(teamId, missionKey).clear();
    moveAfterReviewAction(teamId, missionKey);
    renderAll();
    if (elements.statusText) elements.statusText.textContent = `${getTeamLabel(teamId)} · M${missionId} ${approvalSlots.length}개 슬롯을 승인했습니다.`;
  } catch (error) {
    console.error(error);
    if (elements.statusText) elements.statusText.textContent = "사진 승인 중 오류가 발생했습니다.";
  }
}

function openRetryModal() {
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
  if (elements.retryInput) {
    elements.retryInput.value = "";
  }
}

async function submitRetryModal() {
  const reason = elements.retryInput?.value.trim() || "";
  if (!reason) {
    if (elements.statusText) {
      elements.statusText.textContent = "재도전 사유를 입력한 뒤 전송하세요.";
    }
    elements.retryInput?.focus();
    return;
  }
  await retryCurrentMission(reason);
}

async function retryCurrentMission(reason) {
  const teamId = state.selectedTeamId;
  const missionKey = state.selectedMissionKey;
  if (!teamId || !missionKey) return;
  const missionId = missionKey.split("_")[1];
  const missionSlots = getMissionSlots(teamId, missionKey);
  const selectedSlots = getSelectedActionSlots(teamId, missionKey);
  const retrySlots = selectedSlots.length ? selectedSlots : [state.selectedSlotId].filter((slotId) => missionSlots[slotId]?.url);
  if (!retrySlots.length) {
    if (elements.statusText) elements.statusText.textContent = "재도전할 슬롯을 선택하세요.";
    return;
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
    await recordReviewLog("hq_photo_retry", {
      source: "review",
      teamId,
      teamLabel: getTeamLabel(teamId),
      missionId,
      reason,
      slotIds: retrySlots,
    });
    getSelectedSlotSet(teamId, missionKey).clear();
    closeRetryModal();
    moveAfterReviewAction(teamId, missionKey);
    renderAll();
    if (elements.statusText) elements.statusText.textContent = `${getTeamLabel(teamId)} · M${missionId} ${retrySlots.length}개 슬롯에 재도전을 요청했습니다.`;
  } catch (error) {
    console.error(error);
    if (elements.statusText) elements.statusText.textContent = "재도전 요청 중 오류가 발생했습니다.";
  }
}

function moveAfterReviewAction(previousTeamId, previousMissionKey) {
  const visibleMissionKeys = getVisibleMissionKeys(previousTeamId, state.filter);
  if (visibleMissionKeys.includes(previousMissionKey)) {
    state.selectedTeamId = previousTeamId;
    state.selectedMissionKey = previousMissionKey;
    state.selectedSlotId = getFirstAvailableSlot(previousTeamId, previousMissionKey);
    subscribeChat();
    return;
  }
  const teamMissionKeys = getVisibleMissionKeys(previousTeamId, state.filter).filter(
    (missionKey) => missionKey !== previousMissionKey
  );
  if (teamMissionKeys.length) {
    state.selectedTeamId = previousTeamId;
    state.selectedMissionKey = teamMissionKeys[0];
    state.selectedSlotId = getFirstAvailableSlot(previousTeamId, state.selectedMissionKey);
    subscribeChat();
    return;
  }
  ensureSelectedQueueItem();
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

function formatDateTime(value) {
  return new Date(Number(value)).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
