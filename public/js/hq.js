import { initRankModule } from "./rank_module.js";
import { initHQBoardModule } from "./hq_board_module.js";
import { initTimeModule } from "./time_module.js";
import { initHQChatModule } from "./hq_chat_module.js";
import { db, ref, onValue, set, update, push, serverTimestamp, get } from "./firebase_config.js";
import { requireProjectContext, storeProjectContext } from "./project_context.js";
import { downloadFile } from "./utils.js";

const DEFAULT_SLOT_TEMPLATE = ["Photo1", "Photo2", "S1"];
let missionTotal = 9;
const DEFAULT_MIME = "application/octet-stream";

const params = new URLSearchParams(window.location.search);
const projectIdFromQuery = params.get("project");

let projectContext = null;
if (projectIdFromQuery) {
  projectContext = { projectId: projectIdFromQuery };
  storeProjectContext(projectContext);
} else {
  projectContext = requireProjectContext({ fallbackUrl: "/admin" });
}

let latestTeamData = {};
let uploadsCache = {};
let primaryUploadsCache = {};
let defaultUploadsCacheState = {};
let legacyUploadsCache = {};
let photoModalEl = null;
let currentPhotoContext = null;
let projectMeta = {};
let lastCountdownSignature = null;

function formatTeamDisplay(team = {}) {
  const id = team.id || "";
  const fallbackNumber = parseInt(String(id).replace("Team", ""), 10);
  const number = typeof team.number === "number" ? team.number : fallbackNumber;
  const base = Number.isFinite(number) && number > 0 ? `${number}팀` : id;
  const alias = team.alias || team.label || "";
  return alias ? `${base} ${alias}` : base;
}

function escapeAttr(value = "") {
  const safe = value == null ? "" : value;
  return String(safe).replace(/"/g, "&quot;");
}

function buildDownloadFileName(teamId, teamName, missionId, slotId, url = "") {
  const cleanTeam = (teamName || teamId || "TEAM").replace(/[^\w가-힣_-]/g, "_");
  const extMatch = url.split("?")[0].split(".").pop();
  const extension = extMatch && extMatch.length < 8 ? extMatch : "dat";
  return `${teamId || "Team"}_${cleanTeam}_M${missionId}_${slotId}.${extension}`;
}

function enableDragDownload(element, payload) {
  if (!element || !payload?.url) return;
  element.setAttribute("draggable", "true");
  element.addEventListener("dragstart", (event) => {
    const mime = payload.mime || DEFAULT_MIME;
    const fileName = payload.fileName || "mission_file";
    event.dataTransfer?.setData("DownloadURL", `${mime}:${fileName}:${payload.url}`);
    event.dataTransfer?.setDragImage(element, 10, 10);
  });
}

if (projectContext?.projectId) {
  document.addEventListener("DOMContentLoaded", () => initializeHQ(projectContext));
} else {
  document.addEventListener("DOMContentLoaded", () => {
    window.location.href = "/admin";
  });
}

function initializeHQ(ctx) {
  const projectId = ctx.projectId;
  const countdownPath = projectId ? `projects/${projectId}/countdown` : null;
  const headerEl = document.getElementById("hqProjectTitle");
  document.title = "SMART Mission Race HQ";
  if (headerEl) headerEl.textContent = "SMART Mission Race HQ";

  initRankModule({
    listId: "hqRankList",
    projectId,
    missionTotal,
  });

  const board = initHQBoardModule({
    containerId: "hqBoard",
    teams: [],
  });
  board.setPhotoHandler((teamId) => handlePhotoClick(projectId, teamId));

  let timeInitialized = false;
  const metaRef = ref(db, `projects/${projectId}/meta`);
  onValue(metaRef, (snapshot) => {
    projectMeta = snapshot.val() || {};
    missionTotal = clampMissionTotal(projectMeta.missionTotal);
    if (headerEl) {
      headerEl.textContent = `${projectMeta.name || projectId} HQ`;
    }
    storeProjectContext({
      projectId,
      projectName: projectMeta.name || projectId,
      logoUrl: projectMeta.logoUrl || "",
      teamCount: projectMeta.teamCount || ctx.teamCount || 0,
    });
    if (!latestTeamData || Object.keys(latestTeamData).length === 0) {
      const count = projectMeta.teamCount || ctx.teamCount || 0;
      if (count > 0) {
        const placeholders = generatePlaceholderTeams(count);
        board.update(placeholders);
      }
    }
    const useSharedCountdown = Boolean(projectMeta.startAt && projectMeta.endAt);
    if (!timeInitialized) {
      const timeOptions = {
        noteId: "hqTimerNote",
        warningThreshold: 600,
        warningMessage: "⚠️ 10분 미만! 서두르세요.",
        finishedMessage: "⏱️ 시간이 종료되었습니다.",
        formatCurrentTime: (date) =>
          date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }),
      };
      if (useSharedCountdown) {
        timeOptions.startTime = projectMeta.startAt;
        timeOptions.endTime = projectMeta.endAt;
        timeOptions.sharedCountdownPath = countdownPath;
        timeOptions.autoCreate = false;
        timeOptions.countdownSeconds = null;
      } else {
        timeOptions.startTime = null;
        timeOptions.endTime = null;
        timeOptions.sharedCountdownPath = null;
        timeOptions.autoCreate = false;
        timeOptions.countdownSeconds = 660;
      }
      initTimeModule("hqCurrentTime", "hqRemainTime", timeOptions);
      timeInitialized = true;
    }
    if (useSharedCountdown) {
      syncProjectCountdown(projectId, projectMeta);
    } else {
      lastCountdownSignature = null;
    }
  });

  let chatInstance = null;

  const resetBtn = document.getElementById("hqResetBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      const activeTeam = chatInstance?.getActiveTeam();
      if (!activeTeam || activeTeam === "__broadcast") {
        alert("왼쪽 탭에서 팀을 선택한 뒤 리셋할 수 있습니다.");
        return;
      }
      const teamName = getTeamLabel(activeTeam);
      if (confirm(`${teamName} 팀의 미션을 초기화할까요?`)) {
        resetTeamMissions(projectId, activeTeam);
      }
    });
  }

  const teamsRef = ref(db, `projects/${projectId}/teams`);
  onValue(teamsRef, (snapshot) => {
    const raw = snapshot.val() || {};
    latestTeamData = raw;

    const teamIds = sortTeamIds(raw);
    let teams = teamIds.map((teamId, index) => buildTeamEntry(projectId, teamId, index, raw[teamId]));

    if (teams.length === 0) {
      const placeholderCount = projectMeta.teamCount || ctx.teamCount || 0;
      teams = generatePlaceholderTeams(placeholderCount);
    }

    board.update(teams);
    refreshPhotoStatuses(projectId, board);

    if (!chatInstance) {
      chatInstance = initHQChatModule({
        containerId: "hqChat",
        projectId,
        teams: teams.map((team, index) => ({
          id: team.id,
          label: formatTeamDisplay(team),
        })),
        role: "HQ",
        onTeamMessage: (teamId, _message, unreadCount) => board.setChatAlert(teamId, unreadCount),
        onMessagesRead: (teamId) => board.setChatAlert(teamId, 0),
      });
      board.setChatHandler((teamId) => chatInstance?.setActiveTeam(teamId));
    }
  });

  function publishUploadsCache() {
    const normalizedPrimary = normalizeUploadsMap(primaryUploadsCache);
    const normalizedDefault = normalizeUploadsMap(defaultUploadsCacheState);
    uploadsCache = mergeUploads(normalizedPrimary, normalizedDefault);
    console.log("[HQ] publishUploadsCache -> primary (normalized):", normalizedPrimary);
    console.log("[HQ] publishUploadsCache -> default (normalized):", normalizedDefault);
    console.log("[HQ] publishUploadsCache -> merged uploadsCache:", uploadsCache);
    refreshPhotoStatuses(projectId, board);
    if (photoModalEl && currentPhotoContext) {
      const key = currentPhotoContext.currentMissionKey || currentPhotoContext.missionSelect?.value;
      if (key) renderMissionGallery(key);
    }
  }

  const uploadsRef = ref(db, `uploads_meta/${projectId}`);
  onValue(uploadsRef, (snapshot) => {
    primaryUploadsCache = snapshot.val() || {};
    console.log("[HQ] Primary uploads snapshot:", primaryUploadsCache);
    publishUploadsCache();
  });

  // 호환성: 업로드 페이지에서 project 파라미터를 생략해 'default'로 저장한 경우를 함께 반영
  const defaultUploadsRef = ref(db, `uploads_meta/default`);
  onValue(defaultUploadsRef, (snapshot) => {
    defaultUploadsCacheState = snapshot.val() || {};
    console.log("[HQ] Default uploads snapshot:", defaultUploadsCacheState);
    publishUploadsCache();
  });
}

function sortTeamIds(raw = {}) {
  return Object.keys(raw).sort((a, b) => {
    const numA = (raw[a]?.profile?.number ?? parseInt(a.replace("Team", ""), 10)) || 0;
    const numB = (raw[b]?.profile?.number ?? parseInt(b.replace("Team", ""), 10)) || 0;
    return numA - numB;
  });
}

function buildTeamEntry(projectId, teamId, index, teamData = {}) {
  const profile = teamData.profile || {};
  const missionsRaw = teamData.missions || {};
  let completed = 0;
  const missions = {};

  for (let i = 1; i <= missionTotal; i++) {
    const entry = missionsRaw[i] || {};
    const stage = entry.stage || (i === 1 ? "code" : "locked");
    const panel = entry.panel || null;
    missions[i] = { stage, panel };
    if (stage === "done") completed += 1;
  }

  return {
    id: teamId,
    number: (profile.number ?? parseInt(teamId.replace("Team", ""), 10)) || index + 1,
    alias: profile.name || "",
    label: profile.name || "",
    missionsCompleted: completed,
    missionTotal,
    photoStatus: teamData.photoStatus || "default",
    missions,
  };
}

function getTeamLabel(teamId) {
  const profile = latestTeamData[teamId]?.profile || {};
  const fallback = parseInt(teamId.replace("Team", ""), 10);
  const numeric = typeof profile.number === "number" ? profile.number : fallback;
  const base = Number.isFinite(numeric) && numeric > 0 ? `${numeric}팀` : teamId;
  return profile.name ? `${base} ${profile.name}` : base;
}

function refreshPhotoStatuses(projectId, board) {
  const teamIds = Object.keys(latestTeamData || {});
  console.log("[HQ] refreshPhotoStatuses called for teams:", teamIds);
  console.log("[HQ] Current uploadsCache:", uploadsCache);
  teamIds.forEach((teamId) => {
    const status = computePhotoStatus(projectId, teamId);
    console.log(`[HQ] Team ${teamId} photo status:`, status);
    board.setPhotoStatus(teamId, status);
  });
}

function computePhotoStatus(projectId, teamId) {
  const teamUploads = uploadsCache[teamId];
  console.log(`[HQ] computePhotoStatus for ${teamId}:`, teamUploads);
  if (!teamUploads) {
    console.log(`[HQ] No uploads found for ${teamId}, returning 'default'`);
    return "default";
  }
  let hasPending = false;
  let hasApproved = false;

  Object.entries(teamUploads).forEach(([missionKey, slots]) => {
    const requiredSlots = getRequiredSlots(teamId, missionKey);
    console.log(`[HQ] ${teamId} ${missionKey} - required:`, requiredSlots, "slots:", slots);
    if (!requiredSlots.length) return;
    const state = evaluateMissionSlotState(slots, requiredSlots);
    console.log(`[HQ] ${teamId} ${missionKey} state:`, state);
    if (state === "pending") hasPending = true;
    else if (state === "approved") hasApproved = true;
  });

  const finalStatus = hasPending ? "new" : (hasApproved ? "done" : "default");
  console.log(`[HQ] Final photo status for ${teamId}:`, finalStatus);
  return finalStatus;
}

function evaluateMissionSlotState(slots = {}, requiredSlots = []) {
  if (!requiredSlots.length) return "incomplete";
  const hasAll = requiredSlots.every((slotId) => slots[slotId]?.url);
  if (!hasAll) return "incomplete";
  const statuses = requiredSlots.map((slotId) => slots[slotId]?.status || "pending");
  if (statuses.some((status) => status === "pending" || status === "retry")) {
    return "pending";
  }
  if (statuses.every((status) => status === "approved")) {
    return "approved";
  }
  return "incomplete";
}

function getRequiredSlots(teamId, missionKey) {
  const missionNumber = Number(missionKey.split("_")[1]);
  const config = latestTeamData[teamId]?.config?.missions?.[missionNumber] || {};
  const photoSlots = Number(config.photoSlots) || 0;
  const specialSlots = Number(config.specialSlots) || 0;
  
  // 설정이 있으면 설정 기준으로 반환
  if (photoSlots > 0 || specialSlots > 0) {
    const slots = [];
    for (let i = 1; i <= photoSlots; i++) {
      slots.push(`Photo${i}`);
    }
    for (let i = 1; i <= specialSlots; i++) {
      slots.push(`S${i}`);
    }
    console.log(`[HQ] getRequiredSlots for ${teamId} ${missionKey} (from config):`, slots);
    return slots;
  }
  
  // 설정이 없으면 실제 업로드된 슬롯을 반환 (후방 호환성)
  const teamUploads = uploadsCache[teamId];
  if (teamUploads && teamUploads[missionKey]) {
    const uploadedSlots = Object.keys(teamUploads[missionKey]);
    console.log(`[HQ] getRequiredSlots for ${teamId} ${missionKey} (from uploads):`, uploadedSlots);
    return uploadedSlots;
  }
  
  console.log(`[HQ] getRequiredSlots for ${teamId} ${missionKey}: no config and no uploads, returning []`);
  return [];
}

async function handlePhotoClick(projectId, teamId) {
  console.log(`[HQ] Photo click - projectId: ${projectId}, teamId: ${teamId}`);
  
  let teamUploads = uploadsCache[teamId];
  console.log("[HQ] Cache check:", teamUploads);
  teamUploads = mergeTeamUploads(teamId, teamUploads || {});
  console.log("[HQ] Cache normalized:", teamUploads);
  
  if (!teamUploads || Object.keys(teamUploads).length === 0) {
    console.log("[HQ] Fetching current uploads...");
    teamUploads = await fetchCurrentUploads(projectId, teamId);
    console.log("[HQ] Current uploads:", teamUploads);
    
    if (teamUploads && Object.keys(teamUploads).length > 0) {
      teamUploads = mergeTeamUploads(teamId, teamUploads);
      console.log("[HQ] Cache after merging current uploads:", uploadsCache[teamId]);
    }
  }
  
  if (!teamUploads || Object.keys(teamUploads).length === 0) {
    console.log("[HQ] Fetching legacy uploads...");
    teamUploads = await loadLegacyUploads(projectId, teamId);
    console.log("[HQ] Legacy uploads:", teamUploads);
    
    if (teamUploads && Object.keys(teamUploads).length > 0) {
      teamUploads = mergeTeamUploads(teamId, teamUploads);
      console.log("[HQ] Cache after merging legacy uploads:", uploadsCache[teamId]);
    }
  }
  
  if (!teamUploads || Object.keys(teamUploads).length === 0) {
    console.error("[HQ] No uploads found for team:", teamId);
    alert("업로드된 사진이 없습니다.");
    return;
  }
  
  console.log("[HQ] Opening photo modal with uploads:", teamUploads);
  openPhotoModal(projectId, teamId, teamUploads);
}

async function loadLegacyUploads(projectId, teamId) {
  const cacheKey = `${projectId || "legacy"}-${teamId}`;
  if (legacyUploadsCache[cacheKey]) {
    return legacyUploadsCache[cacheKey];
  }
  const candidates = [`uploads_meta/${teamId}`];
  if (projectId) {
    candidates.push(`uploads_meta/${projectId}/${teamId}`);
  }
  for (const path of candidates) {
    try {
      const snapshot = await get(ref(db, path));
      const data = snapshot.val() || {};
      const normalized = normalizeLegacyUploads(data);
      if (Object.keys(normalized).length > 0) {
        legacyUploadsCache[cacheKey] = normalized;
        return normalized;
      }
    } catch (error) {
      console.warn("Legacy uploads fetch failed", path, error);
    }
  }
  legacyUploadsCache[cacheKey] = {};
  return {};
}

function normalizeLegacyUploads(raw = {}) {
  const missions = {};
  Object.entries(raw).forEach(([key, value]) => {
    if (!value) return;
    if (key.startsWith("mission_")) {
      missions[key] = value;
    } else if (typeof value === "object") {
      const missionKey = `mission_${key.replace(/[^\d]/g, "") || key}`;
      missions[missionKey] = value;
    }
  });
  return missions;
}

async function fetchCurrentUploads(projectId, teamId) {
  if (!projectId) {
    console.warn("[HQ] No projectId provided for fetchCurrentUploads");
    return {};
  }
  
  const path = `uploads_meta/${projectId}/${teamId}`;
  console.log(`[HQ] Fetching from path: ${path}`);
  
  try {
    const snapshot = await get(ref(db, path));
    const data = normalizeMissionKeys(snapshot.val() || {});
    console.log(`[HQ] Data from ${path}:`, data);
    if (Object.keys(data).length > 0) return data;
    // 프로젝트가 다르게 저장된 경우 'default'로 폴백
    if (projectId !== "default") {
      const fallbackPath = `uploads_meta/default/${teamId}`;
      console.log(`[HQ] Primary empty. Trying fallback: ${fallbackPath}`);
      const fallbackSnap = await get(ref(db, fallbackPath));
      const fallback = normalizeMissionKeys(fallbackSnap.val() || {});
      console.log(`[HQ] Data from ${fallbackPath}:`, fallback);
      return fallback;
    }
    return {};
  } catch (error) {
    console.error("Current uploads fetch failed", error);
    return {};
  }
}

// uploadsCache 병합 유틸: base 우선, extra는 비어있는 곳만 채움
function mergeUploads(base = {}, extra = {}) {
  const result = { ...base };
  Object.entries(extra).forEach(([teamId, missions]) => {
    if (!missions || typeof missions !== "object") return;
    if (!result[teamId]) {
      result[teamId] = missions;
      return;
    }
    const targetTeam = result[teamId];
    Object.entries(missions).forEach(([missionKey, slots]) => {
      if (!slots || typeof slots !== "object") return;
      if (!targetTeam[missionKey]) {
        targetTeam[missionKey] = slots;
        return;
      }
      const targetSlots = targetTeam[missionKey];
      Object.entries(slots).forEach(([slotId, payload]) => {
        if (!targetSlots[slotId]) {
          targetSlots[slotId] = payload;
        }
      });
    });
  });
  return result;
}

function normalizeUploadsMap(map = {}) {
  const normalized = {};
  Object.entries(map).forEach(([teamId, missions]) => {
    if (!missions || typeof missions !== "object") return;
    normalized[teamId] = normalizeMissionKeys(missions);
  });
  return normalized;
}

function mergeTeamUploads(teamId, incoming = {}) {
  const current = uploadsCache[teamId] && typeof uploadsCache[teamId] === "object" ? uploadsCache[teamId] : {};
  if (!incoming || typeof incoming !== "object") {
    uploadsCache[teamId] = normalizeMissionKeys(current);
    return uploadsCache[teamId];
  }
  const merged = { ...current, ...incoming };
  const normalized = normalizeMissionKeys(merged);
  uploadsCache[teamId] = normalized;
  return normalized;
}

function normalizeMissionKeys(missions = {}) {
  const normalized = {};
  Object.entries(missions).forEach(([key, slots]) => {
    if (!slots || typeof slots !== "object") return;
    let missionKey = key;
    if (!missionKey.startsWith("mission_")) {
      const match = key.match(/\d+/);
      if (match) missionKey = `mission_${match[0]}`;
      else missionKey = `mission_${key}`;
    }
    normalized[missionKey] = slots;
  });
  return normalized;
}

function resetTeamMissions(projectId, teamId) {
  const missionRef = ref(db, `projects/${projectId}/teams/${teamId}/missions`);
  return set(missionRef, createDefaultMissionState(missionTotal));
}

function generatePlaceholderTeams(count = 0) {
  const teams = [];
  for (let i = 1; i <= count; i++) {
    teams.push({
      id: `Team${i}`,
      number: i,
      alias: "",
       label: "",
      missionsCompleted: 0,
      missionTotal,
      photoStatus: "default",
      missions: createDefaultMissionState(missionTotal),
    });
  }
  return teams;
}

function createDefaultMissionState(total = missionTotal) {
  const missions = {};
  for (let i = 1; i <= total; i++) {
    missions[i] = {
      stage: i === 1 ? "code" : "locked",
      panel: null,
    };
  }
  return missions;
}

function openPhotoModal(projectId, teamId, missions) {
  closePhotoModal();
  console.log("[HQ] openPhotoModal called with missions:", missions);
  console.log("[HQ] Mission keys:", Object.keys(missions));
  
  const missionKeys = Object.keys(missions)
    .filter((key) => key.startsWith("mission_"))
    .sort((a, b) => Number(a.split("_")[1]) - Number(b.split("_")[1]));

  console.log("[HQ] Filtered mission_ keys:", missionKeys);

  if (missionKeys.length === 0) {
    console.error("[HQ] No mission_ keys found in:", missions);
    alert("업로드된 사진이 없습니다.");
    return;
  }

  const teamName = getTeamLabel(teamId);
  const modal = document.createElement("div");
  modal.className = "photo-modal";
  modal.innerHTML = `
    <div class="photo-modal__inner">
      <button class="photo-modal__close" aria-label="닫기">×</button>
      <div class="photo-modal__header">
        <div>
          <h3>${teamName}</h3>
          <p class="photo-modal__mission-label">사진을 선택해 확인하세요.</p>
        </div>
        <select id="photoMissionSelect">
          ${missionKeys
            .map((key) => {
              const missionId = key.split("_")[1];
              return `<option value="${key}">Mission ${missionId}</option>`;
            })
            .join("")}
        </select>
      </div>
      <div class="photo-modal__body">
        <div class="photo-preview">
          <div class="photo-preview__main" id="photoPreviewMain">썸네일을 선택하세요.</div>
        </div>
        <div class="photo-thumbs" id="photoThumbs"></div>
      </div>
      <div class="photo-modal__actions">
        <div class="action-left">
          <button id="photoDownloadSelectedBtn" class="download-btn secondary">선택 다운로드</button>
          <button id="photoDownloadAllBtn" class="download-btn">전체 다운로드</button>
        </div>
        <div class="action-right">
          <button id="photoRetryBtn" class="retry-btn">재도전</button>
          <button id="photoApproveBtn" class="approve-btn">승인</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  photoModalEl = modal;

  const closeBtn = modal.querySelector(".photo-modal__close");
  closeBtn.addEventListener("click", closePhotoModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closePhotoModal();
  });

  const missionSelect = modal.querySelector("#photoMissionSelect");
  const thumbsEl = modal.querySelector("#photoThumbs");
  const previewEl = modal.querySelector("#photoPreviewMain");
  const approveBtn = modal.querySelector("#photoApproveBtn");
  const retryBtn = modal.querySelector("#photoRetryBtn");
  const downloadAllBtn = modal.querySelector("#photoDownloadAllBtn");
  const downloadSelectedBtn = modal.querySelector("#photoDownloadSelectedBtn");

  currentPhotoContext = {
    projectId,
    teamId,
    teamName,
    missionSelect,
    missions,
    thumbsEl,
    previewEl,
    approveBtn,
    retryBtn,
    downloadAllBtn,
    downloadSelectedBtn,
    currentMissionKey: null,
    selectedByMission: new Map(),
    requiredSlotsMap: new Map(),
  };

  missionSelect.addEventListener("change", () => {
    renderMissionGallery(missionSelect.value);
  });

  approveBtn.addEventListener("click", () => {
    const missionKey = missionSelect.value;
    const requiredSlots = currentPhotoContext.requiredSlotsMap.get(missionKey) || [];
    if (!isMissionReady(missions[missionKey], requiredSlots)) {
      alert("모든 슬롯 사진이 업로드되어야 승인할 수 있습니다.");
      return;
    }
    approveMission(projectId, teamId, missionKey);
  });

  retryBtn.addEventListener("click", () => {
    const missionKey = missionSelect.value;
    requestRetry(projectId, teamId, missionKey);
  });
  downloadAllBtn?.addEventListener("click", async () => {
    const missionKey = missionSelect.value;
    await downloadMissionAssets(projectId, teamId, missionKey);
  });
  downloadSelectedBtn?.addEventListener("click", async () => {
    const missionKey = missionSelect.value;
    const selected = Array.from(currentPhotoContext.selectedByMission.get(missionKey) || []);
    if (!selected.length) {
      alert("다운로드할 사진을 선택하세요.");
      return;
    }
    await downloadMissionAssets(projectId, teamId, missionKey, selected);
  });

  missionSelect.value = missionKeys[missionKeys.length - 1];
  renderMissionGallery(missionSelect.value);
}

function closePhotoModal() {
  if (photoModalEl) {
    photoModalEl.remove();
    photoModalEl = null;
    currentPhotoContext = null;
  }
}

function renderMissionGallery(missionKey) {
  if (!currentPhotoContext) return;
  const {
    missions,
    thumbsEl,
    previewEl,
    selectedByMission,
    teamId,
    teamName,
    requiredSlotsMap,
    approveBtn,
    retryBtn,
    downloadAllBtn,
    downloadSelectedBtn,
  } = currentPhotoContext;
  const slots = missions[missionKey] || {};
  const missionId = Number(missionKey.split("_")[1]) || 0;
  if (!selectedByMission.has(missionKey)) {
    selectedByMission.set(missionKey, new Set());
  }
  const selectedSet = selectedByMission.get(missionKey);
  const requiredSlots = getRequiredSlots(teamId, missionKey);
  const uploadedSlotKeys = Object.keys(slots);
  const approvalSlots =
    requiredSlots.length > 0 ? requiredSlots : uploadedSlotKeys.length > 0 ? uploadedSlotKeys : [...DEFAULT_SLOT_TEMPLATE];
  const slotOrder = approvalSlots;
  requiredSlotsMap.set(missionKey, slotOrder);
  let firstAvailable = null;

  thumbsEl.innerHTML = slotOrder
    .map((slotId) => {
      const item = slots[slotId];
      const label = slotId.startsWith("Photo") ? `Photo ${slotId.replace("Photo", "")}` : slotId;
      const checked = selectedSet.has(slotId) ? "checked" : "";
      if (!item) {
        return `<div class="photo-thumb photo-thumb--empty" data-slot="${slotId}">
          <div class="photo-thumb__header">
            <span>${label}</span>
            <input type="checkbox" class="photo-thumb__check" data-slot="${slotId}" ${checked}>
          </div>
          <div class="photo-thumb__media" data-slot="${slotId}">
            <span class="photo-thumb__empty">없음</span>
          </div>
        </div>`;
      }
      if (!firstAvailable) firstAvailable = slotId;
      const media = item.type?.startsWith("video")
        ? `<video src="${item.url}" muted></video>`
        : `<img src="${item.url}" alt="${label}">`;
      const statusClass = item.status ? ` photo-thumb--${item.status}` : "";
      const safeUrl = escapeAttr(item.url);
      const safeType = escapeAttr(item.type || "");
      return `<div class="photo-thumb${statusClass}" data-slot="${slotId}">
        <div class="photo-thumb__header">
          <span>${label}</span>
          <input type="checkbox" class="photo-thumb__check" data-slot="${slotId}" ${checked}>
        </div>
        <div
          class="photo-thumb__media"
          data-slot="${slotId}"
          data-url="${safeUrl}"
          data-type="${safeType}"
          data-label="${escapeAttr(label)}"
          draggable="true"
        >${media}</div>
      </div>`;
    })
    .join("");

  let hasFiles = false;
  thumbsEl.querySelectorAll(".photo-thumb__media").forEach((media) => {
    const slotId = media.dataset.slot;
    const item = slots[slotId];
    media.addEventListener("mouseenter", () => updatePreview(slots, slotId));
    media.addEventListener("click", () => updatePreview(slots, slotId));
    if (item) {
      hasFiles = true;
      const fileName = buildDownloadFileName(teamId, teamName, missionId, slotId, item.url);
      enableDragDownload(media, {
        url: item.url,
        mime: item.type || DEFAULT_MIME,
        fileName,
      });
    }
  });

  thumbsEl.querySelectorAll(".photo-thumb__check").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const slotId = event.target.dataset.slot;
      if (event.target.checked) selectedSet.add(slotId);
      else selectedSet.delete(slotId);
      updateSelectedDownloadState(missionKey);
    });
  });

  if (firstAvailable) {
    updatePreview(slots, firstAvailable);
  } else {
    previewEl.innerHTML = "<p>업로드된 파일이 없습니다.</p>";
  }

  if (approveBtn) {
    approveBtn.disabled = !isMissionReady(slots, slotOrder);
  }
  if (retryBtn) {
    retryBtn.disabled = false;
  }
  if (downloadAllBtn) {
    downloadAllBtn.disabled = !hasFiles;
  }
  if (downloadSelectedBtn) {
    const selected = selectedByMission.get(missionKey) || new Set();
    downloadSelectedBtn.disabled = !selected.size;
  }
  currentPhotoContext.currentMissionKey = missionKey;
  updateSelectedDownloadState(missionKey);
}

function updateSelectedDownloadState(missionKey) {
  if (!currentPhotoContext?.downloadSelectedBtn) return;
  const selected = currentPhotoContext.selectedByMission.get(missionKey) || new Set();
  currentPhotoContext.downloadSelectedBtn.disabled = !selected.size;
}

function updatePreview(slots, slotId) {
  if (!currentPhotoContext) return;
  const { previewEl } = currentPhotoContext;
  const item = slots[slotId];
  if (!item) {
    previewEl.innerHTML = `<p>${slotId} 업로드 없음</p>`;
    return;
  }
  previewEl.innerHTML = item.type?.startsWith("video")
    ? `<video src="${item.url}" controls playsinline></video>`
    : `<img src="${item.url}" alt="${slotId}">`;
}

function isMissionReady(slots = {}, requiredSlots = []) {
  if (!requiredSlots.length) return false;
  return requiredSlots.every((slotId) => slots[slotId]?.url);
}

function getRequiredSlotsFromContext(missionKey, teamId) {
  if (currentPhotoContext?.requiredSlotsMap?.has(missionKey)) {
    return currentPhotoContext.requiredSlotsMap.get(missionKey);
  }
  return getRequiredSlots(teamId, missionKey);
}

async function approveMission(projectId, teamId, missionKey) {
  const missionId = missionKey.split("_")[1];
  const missionSlots = uploadsCache[teamId]?.[missionKey];
  if (!missionSlots) return;
  const requiredSlots = getRequiredSlotsFromContext(missionKey, teamId);
  if (!isMissionReady(missionSlots, requiredSlots)) {
    alert("모든 사진이 업로드되어야 승인할 수 있습니다.");
    return;
  }

  const updates = {};
  Object.keys(missionSlots).forEach((slotId) => {
    updates[`uploads_meta/${projectId}/${teamId}/${missionKey}/${slotId}/status`] = "approved";
  });

  updates[`projects/${projectId}/teams/${teamId}/missions/${missionId}/stage`] = "done";
  updates[`projects/${projectId}/teams/${teamId}/missions/${missionId}/panel`] = null;

  const nextMission = String(Number(missionId) + 1);
  const nextMissionData = latestTeamData[teamId]?.missions?.[nextMission];
  if (!nextMissionData || nextMissionData.stage === "locked") {
    updates[`projects/${projectId}/teams/${teamId}/missions/${nextMission}/stage`] = "code";
    updates[`projects/${projectId}/teams/${teamId}/missions/${nextMission}/panel`] = null;
  }

  try {
    await update(ref(db), updates);
    await push(ref(db, `chat/${projectId}/${teamId}`), {
      sender: "HQ",
      text: `[본부] 사진 승인 완료 - Mission ${missionId}`,
      createdAt: serverTimestamp(),
    });
    alert("사진이 승인되었습니다.");
    closePhotoModal();
  } catch (error) {
    console.error(error);
    alert("승인 중 오류가 발생했습니다.");
  }
}

async function requestRetry(projectId, teamId, missionKey) {
  if (!currentPhotoContext) return;
  const selected = Array.from(
    currentPhotoContext.selectedByMission.get(missionKey) || []
  );
  if (selected.length === 0) {
    alert("재도전할 사진을 선택하세요.");
    return;
  }
  const reason = prompt("재도전 사유를 입력하세요.");
  if (!reason) return;
  const missionId = missionKey.split("_")[1];
  const missionSlots = uploadsCache[teamId]?.[missionKey];
  if (!missionSlots) return;

  const updates = {};
  selected.forEach((slotId) => {
    updates[`uploads_meta/${projectId}/${teamId}/${missionKey}/${slotId}/status`] = "retry";
    updates[`uploads_meta/${projectId}/${teamId}/${missionKey}/${slotId}/retryReason`] = reason;
  });
  updates[`projects/${projectId}/teams/${teamId}/missions/${missionId}/stage`] = "mission";
  updates[`projects/${projectId}/teams/${teamId}/missions/${missionId}/panel`] = "mission";

  try {
    await update(ref(db), updates);
    await push(ref(db, `chat/${projectId}/${teamId}`), {
      sender: "HQ",
      text: `[본부] 사진 재도전 요청: ${reason}`,
      createdAt: serverTimestamp(),
    });
    alert("재도전 요청을 전송했습니다.");
    currentPhotoContext.selectedByMission.get(missionKey).clear();
    renderMissionGallery(missionKey);
  } catch (error) {
    console.error(error);
    alert("재도전 요청 중 오류가 발생했습니다.");
  }
}

async function downloadMissionAssets(projectId, teamId, missionKey, slotsFilter = null) {
  const missionSlots = uploadsCache[teamId]?.[missionKey];
  if (!missionSlots) {
    alert("다운로드할 파일이 없습니다.");
    return;
  }
  const missionId = missionKey.split("_")[1];
  const teamLabel = getTeamLabel(teamId);
  let hasFile = false;
  
  const entries = Object.entries(missionSlots);
  for (const [slotId, slot] of entries) {
    if (slotsFilter && slotsFilter.length && !slotsFilter.includes(slotId)) {
      continue;
    }
    if (!slot?.url) continue;
    hasFile = true;
    const fileName = buildDownloadFileName(teamId, teamLabel, missionId, slotId, slot.url);
    await triggerDownload(slot, fileName);
    await waitFor(400);
  }
  
  if (!hasFile) {
    alert("다운로드할 파일이 없습니다.");
  }
}

async function triggerDownload(slot, fileName) {
  if (!slot) return;
  await downloadFile(slot.url, fileName, slot.path);
}

function waitFor(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampMissionTotal(value) {
  const num = Number.isFinite(value) ? value : 9;
  return Math.max(1, Math.min(20, num));
}

function syncProjectCountdown(projectId, meta = {}) {
  if (!projectId || !meta.startAt || !meta.endAt) return;
  const duration = Math.max(60, Math.floor((meta.endAt - meta.startAt) / 1000));
  if (!Number.isFinite(duration) || duration <= 0) return;
  const signature = `${meta.startAt}-${meta.endAt}-${duration}`;
  if (signature === lastCountdownSignature) return;
  lastCountdownSignature = signature;
  const countdownRef = ref(db, `projects/${projectId}/countdown`);
  set(countdownRef, {
    startAt: meta.startAt,
    duration,
  }).catch((error) => {
    console.error("Failed to sync countdown", error);
  });
}
