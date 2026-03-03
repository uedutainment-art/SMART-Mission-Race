import { initRankModule } from "./rank_module.js";
import { initHQBoardModule } from "./hq_board_module.js";
import { initTimeModule } from "./time_module.js";
import { initHQChatModule } from "./hq_chat_module.js";
import {
  db,
  ref,
  onValue,
  set,
  update,
  push,
  serverTimestamp,
  get,
  storage,
  sRef,
  listAll,
  deleteObject,
} from "./firebase_config.js";
import { requireProjectContext, storeProjectContext } from "./project_context.js";
import { downloadFile, resolveOfficialTeamName, createDefaultMissionState, clampMissionCount, ALLOWED_STAGES, STAGE_ALIASES } from "./utils.js";

const DEFAULT_SLOT_TEMPLATE = ["Photo1", "Photo2", "S1"];
let missionTotal = 9;
const DEFAULT_MIME = "application/octet-stream";


const params = new URLSearchParams(window.location.search);
const projectIdFromQuery = params.get("project");
const isLikelyProjectId = (value = "") => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return false;
  // Firebase 프로젝트 ID는 보통 영문/숫자/하이픈 조합이며 순수 숫자 패스워드는 제외
  const pattern = /^[a-zA-Z0-9-]{6,}$/;
  const allDigits = /^[0-9]+$/;
  return pattern.test(trimmed) && !allDigits.test(trimmed);
};

let projectContext = null;
if (projectIdFromQuery && isLikelyProjectId(projectIdFromQuery)) {
  projectContext = { projectId: projectIdFromQuery };
  storeProjectContext(projectContext);
} else {
  projectContext = requireProjectContext({ fallbackUrl: "/admin" });
}
const currentProjectId = projectContext?.projectId || null;

let latestTeamData = {};
let uploadsCache = {};
let legacyUploadsCache = {};
let photoModalEl = null;
let currentPhotoContext = null;
let projectMeta = {};
let lastCountdownSignature = null;
let audioCtx = null;
const pendingFinishUpdates = new Set();
let boardInstance = null;
let chatInstance = null;
let userGestureCaptured = false;
const pendingTones = [];
let rankInstance = null;
let rankMissionTotal = missionTotal;
const MIN_MISSIONS = 1;
const MAX_MISSIONS = 50;



function formatTeamDisplay(team = {}) {
  if (team.label) return team.label;
  const id = team.id || "";
  const fallbackNumber = parseInt(String(id).replace("Team", ""), 10);
  const number = typeof team.number === "number" ? team.number : fallbackNumber;
  return Number.isFinite(number) && number > 0 ? `${number}팀` : id || "TEAM";
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
  pendingFinishUpdates.clear();
  const projectId = ctx.projectId;
  const countdownPath = projectId ? `projects/${projectId}/countdown` : null;
  const headerEl = document.getElementById("hqProjectTitle");
  const headerSubtitleEl = document.getElementById("hqProjectSubtitle");
  document.title = "SMART Mission Race HQ";
  if (headerEl) headerEl.textContent = "SMART Mission Race HQ";
  if (headerSubtitleEl) headerSubtitleEl.textContent = "";

  boardInstance = initHQBoardModule({
    containerId: "hqBoard",
    teams: [],
  });

  const photoAlertState = new Map();

  const originalPhotoSetter = boardInstance.setPhotoStatus;
  boardInstance.setPhotoStatus = (teamId, payload = { status: "default", count: 0 }) => {
    const normalized = payload || { status: "default", count: 0 };
    const previous = photoAlertState.get(teamId) || { status: "default", count: 0 };
    originalPhotoSetter(teamId, normalized);
    handlePhotoAlert(previous, normalized);
    photoAlertState.set(teamId, normalized);
  };

  const originalChatAlert = boardInstance.setChatAlert;
  boardInstance.setChatAlert = (teamId, unreadCount = 0) => {
    originalChatAlert(teamId, unreadCount);
  };

  document.addEventListener(
    "click",
    () => {
      userGestureCaptured = true;
      if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume();
      }
      flushPendingTones();
    },
    { once: true }
  );
  boardInstance.setPhotoHandler((teamId) => handlePhotoClick(projectId, teamId));

  let timeInitialized = false;
  const metaRef = ref(db, `projects/${projectId}/meta`);
  onValue(metaRef, (snapshot) => {
    projectMeta = snapshot.val() || {};
    missionTotal = resolveMissionTotal(projectMeta, missionTotal);
    rankMissionTotal = missionTotal;
    ensureRankModule(projectId, rankMissionTotal);
    if (headerEl) {
      headerEl.textContent = `${projectMeta.name || projectId} HQ`;
    }
    if (headerSubtitleEl) {
      headerSubtitleEl.textContent = projectMeta.subtitle || "";
    }
    storeProjectContext({
      projectId,
      projectName: projectMeta.name || projectId,
      projectSubtitle: projectMeta.subtitle || "",
      educationAt: projectMeta.educationAt || projectMeta.endAt || null,
      logoUrl: projectMeta.logoUrl || "",
      teamCount: projectMeta.teamCount || ctx.teamCount || 0,
    });
    updateBoardWithLatest(projectId);
    const countdownTarget = projectMeta.educationAt || projectMeta.endAt || null;
    const useSharedCountdown = Boolean(countdownTarget && projectId);
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
        timeOptions.startTime = Date.now();
        timeOptions.endTime = countdownTarget;
        timeOptions.sharedCountdownPath = countdownPath;
        timeOptions.autoCreate = false;
        timeOptions.countdownSeconds = null;
      } else {
        timeOptions.startTime = null;
        timeOptions.endTime = countdownTarget;
        timeOptions.sharedCountdownPath = null;
        timeOptions.autoCreate = false;
        timeOptions.countdownSeconds = countdownTarget
          ? Math.max(60, Math.floor((countdownTarget - Date.now()) / 1000))
          : 660;
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

  const resetBtn = document.getElementById("hqResetBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      const activeTeam = chatInstance?.getActiveTeam();
      if (!activeTeam || activeTeam === "__broadcast") {
        alert("왼쪽 탭에서 팀을 선택한 뒤 리셋할 수 있습니다.");
        return;
      }
      const teamName = getTeamLabel(activeTeam);
      if (confirm(`${teamName} 팀의 결과를 초기화할까요? (미션·채팅·사진)`)) {
        await resetTeamData({ projectId, teamId: activeTeam, board: boardInstance, chatInstance });
      }
    });
  }

  const teamsRef = ref(db, `projects/${projectId}/teams`);
  onValue(teamsRef, (snapshot) => {
    const raw = snapshot.val() || {};
    latestTeamData = raw;
    // 팀 데이터에 따라 전체 미션 수를 다시 산정 (메타 값이 없거나 잘못된 경우 대비)
    const derivedTotal = deriveGlobalMissionTotal(latestTeamData, projectMeta, missionTotal);
    if (derivedTotal !== missionTotal) {
      missionTotal = derivedTotal;
    }
    if (derivedTotal !== rankMissionTotal) {
      rankMissionTotal = derivedTotal;
      ensureRankModule(projectId, rankMissionTotal, true);
    }

    const teamsList = updateBoardWithLatest(projectId);
    if (rankInstance && Array.isArray(teamsList)) {
      const forRank = teamsList.map((team) => ({
        id: team.id,
        name: team.label || team.alias || team.id,
        label: team.label || team.alias || team.id,
        nickname: team.profile?.nickname || "",
        completed: team.missionsCompleted || 0,
        total: team.missionTotal || rankMissionTotal,
        finishedAt: team.finishedAt ?? null,
        number: team.number ?? null,
        order: team.number ?? null,
      }));
      rankInstance.update(forRank);
    }

    if (!chatInstance) {
      chatInstance = initHQChatModule({
        containerId: "hqChat",
        projectId,
        teams: teamsList.map((team, index) => ({
          id: team.id,
          label: formatTeamDisplay(team),
        })),
        role: "HQ",
        onTeamMessage: (teamId, _message, unreadCount) => boardInstance.setChatAlert(teamId, unreadCount),
        onMessagesRead: (teamId) => boardInstance.setChatAlert(teamId, 0),
        onMessageNotify: () => playNotificationTone("chat"),
      });
      boardInstance.setChatHandler((teamId) => chatInstance?.setActiveTeam(teamId));
    }
  });

  const uploadsRef = ref(db, `uploads_meta/${projectId}`);
  onValue(uploadsRef, (snapshot) => {
    uploadsCache = snapshot.val() || {};
    refreshPhotoStatuses(projectId, boardInstance);
    if (photoModalEl && currentPhotoContext) {
      const key = currentPhotoContext.currentMissionKey || currentPhotoContext.missionSelect?.value;
      if (key) renderMissionGallery(key);
    }
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
  const teamMissionTotal = deriveTeamMissionTotal(teamData, missionTotal);
  const { missions, completed } = normalizeTeamMissions(projectId, teamId, missionsRaw, teamMissionTotal);

  const number = (profile.number ?? parseInt(teamId.replace("Team", ""), 10)) || index + 1;
  const officialName = resolveOfficialTeamName(profile, teamId, number);
  const finishedAtRaw = teamData.profile?.finishedAt;
  let finishedAt = null;
  if (typeof finishedAtRaw === "number" && Number.isFinite(finishedAtRaw)) {
    finishedAt = finishedAtRaw;
  } else if (typeof finishedAtRaw === "string") {
    const parsed = Number(finishedAtRaw);
    finishedAt = Number.isFinite(parsed) ? parsed : null;
  }
  if (completed >= teamMissionTotal && !finishedAt) {
    markTeamFinished(projectId, teamId);
  }

  return {
    id: teamId,
    number,
    alias: officialName,
    label: officialName,
    profile,
    missionsCompleted: completed,
    missionTotal: teamMissionTotal,
    photoStatus: teamData.photoStatus || "default",
    missions,
    finishedAt,
  };
}

function normalizeMissionState(raw = {}, missionIndex = 1, previousDone = true) {
  const current = raw || {};
  const stageRaw = typeof current.stage === "string" ? current.stage.trim() : current.stage;
  const aliasKey = typeof stageRaw === "string" ? stageRaw.toLowerCase() : stageRaw;
  let stage = aliasKey;
  if (typeof aliasKey === "string" && STAGE_ALIASES[aliasKey]) {
    stage = STAGE_ALIASES[aliasKey];
  }
  if (!ALLOWED_STAGES.has(stage)) {
    stage = missionIndex === 1 ? "code" : "locked";
  }

  // 이전 미션이 완료되지 않았으면 잠금 유지
  if (!previousDone && missionIndex !== 1) {
    stage = "locked";
  }

  // 첫 미션은 done이 아니면 항상 code
  if (missionIndex === 1 && stage !== "done") {
    stage = "code";
  }


  let panel = current.panel ?? null;
  if (stage === "done" || stage === "locked") {
    panel = null;
  } else {
    // stage가 code/mission인 경우, 기존 panel이 유효하면 유지하고 아니면 stage와 맞춤
    if (panel !== "code" && panel !== "mission") {
      panel = stage;
    }
  }

  return { stage, panel };
}

function normalizeTeamMissions(projectId, teamId, missionsRaw = {}, total = missionTotal) {
  const missions = {};
  let completed = 0;
  let previousDone = true;
  const updates = {};

  for (let i = 1; i <= total; i++) {
    const normalized = normalizeMissionState(missionsRaw[i], i, previousDone);
    missions[i] = normalized;
    if (normalized.stage === "done") completed += 1;
    previousDone = normalized.stage === "done";

    const raw = missionsRaw[i] || {};
    const rawStage = typeof raw.stage === "string" ? raw.stage.trim() : raw.stage;
    const rawPanel = raw.panel ?? null;
    if (rawStage !== normalized.stage) {
      updates[`projects/${projectId}/teams/${teamId}/missions/${i}/stage`] = normalized.stage;
    }
    if ((rawPanel || null) !== normalized.panel) {
      updates[`projects/${projectId}/teams/${teamId}/missions/${i}/panel`] = normalized.panel;
    }
  }

  if (projectId && teamId && Object.keys(updates).length > 0) {
    update(ref(db), updates).catch((error) => console.warn("Mission normalization failed", teamId, error));
  }

  return { missions, completed };
}

function deriveTeamMissionTotal(teamData = {}, fallback = missionTotal) {
  const metaTotal = Number(projectMeta?.missionTotal);
  const configMissions = teamData.config?.missions || {};
  let configMax = 0;
  Object.keys(configMissions).forEach((key) => {
    const n = Number(key);
    if (Number.isFinite(n)) {
      configMax = Math.max(configMax, n);
    }
  });
  const missionsRaw = teamData.missions || {};
  let missionMax = 0;
  Object.keys(missionsRaw).forEach((key) => {
    const n = Number(key);
    if (Number.isFinite(n)) {
      missionMax = Math.max(missionMax, n);
    }
  });

  // 설정값(metaTotal), 팀별 설정(configMax), 실제 진행 데이터(missionMax), 전역 최댓값(fallback) 중 가장 큰 값을 선택
  const candidates = [metaTotal, configMax, missionMax, fallback, 9].filter((v) => Number.isFinite(v) && v > 0);
  const chosen = candidates.length > 0 ? Math.max(...candidates) : 9;
  return clampMissionCount(chosen);
}

function getTeamLabel(teamId) {
  const profile = latestTeamData[teamId]?.profile || {};
  const fallback = parseInt(teamId.replace("Team", ""), 10);
  const numeric = typeof profile.number === "number" ? profile.number : fallback;
  return resolveOfficialTeamName(profile, teamId, numeric);
}

function getDefaultTeamName(teamId) {
  const profile = latestTeamData[teamId]?.profile || {};
  const fallback = parseInt(teamId.replace("Team", ""), 10);
  const numeric = Number.isFinite(profile.number) ? profile.number : fallback;
  if (Number.isFinite(numeric) && numeric > 0) return `${numeric}팀`;
  return teamId || "TEAM";
}

function refreshPhotoStatuses(projectId, board) {
  const teamIds = Object.keys(latestTeamData || {});
  teamIds.forEach((teamId) => {
    board.setPhotoStatus(teamId, computePhotoStatus(projectId, teamId));
  });
}

function updateBoardWithLatest(projectIdOverride = null) {
  if (!boardInstance) return;
  const activeProjectId = projectIdOverride || currentProjectId || projectContext?.projectId || null;
  const teamIds = sortTeamIds(latestTeamData);
  let teams = teamIds.map((teamId, index) => buildTeamEntry(activeProjectId, teamId, index, latestTeamData[teamId]));

  if (teams.length === 0) {
    const placeholderCount = projectMeta.teamCount || 0;
    teams = generatePlaceholderTeams(placeholderCount || 0);
  }

  boardInstance.update(teams);
  refreshPhotoStatuses(activeProjectId, boardInstance);
  return teams;
}

function resolveMissionTotal(meta = {}, fallback = 9) {
  const fromMeta = Number(meta.missionTotal);
  if (Number.isFinite(fromMeta) && fromMeta > 0) return clampMissionCount(fromMeta);
  return clampMissionCount(fallback);
}

function deriveGlobalMissionTotal(teams = {}, meta = {}, fallback = 9) {
  const metaTotal = Number(meta.missionTotal);
  let maxMission = Number.isFinite(metaTotal) && metaTotal > 0 ? metaTotal : 0;
  Object.values(teams || {}).forEach((team) => {
    const configMissions = team?.config?.missions || {};
    Object.keys(configMissions).forEach((key) => {
      const n = Number(key);
      if (Number.isFinite(n)) maxMission = Math.max(maxMission, n);
    });
    const missionsRaw = team?.missions || {};
    Object.keys(missionsRaw).forEach((key) => {
      const n = Number(key);
      if (Number.isFinite(n)) maxMission = Math.max(maxMission, n);
    });
  });
  if (maxMission > 0) return clampMissionCount(maxMission);
  return clampMissionCount(fallback);
}

function handlePhotoAlert(previousState = { status: "default", count: 0 }, nextState = { status: "default", count: 0 }) {
  const prevStatus = previousState?.status || "default";
  const prevCount = Number(previousState?.count || 0);
  const nextStatus = nextState?.status || "default";
  const nextCount = Number(nextState?.count || 0);
  if (nextStatus === "new" && (prevStatus !== "new" || nextCount > prevCount)) {
    playNotificationTone("photo");
  } else if (prevStatus === "new" && nextStatus === "done") {
    playNotificationTone("photo");
  }
}

function getAudioContext() {
  if (!userGestureCaptured) return null;
  if (audioCtx) return audioCtx;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  audioCtx = new AudioCtor();
  return audioCtx;
}

function playNotificationTone(kind = "chat") {
  const ctx = getAudioContext();
  if (!ctx) {
    // 사용자 제스처 이후 재생하도록 큐에 저장
    pendingTones.push(kind);
    return;
  }
  const baseTime = ctx.currentTime;
  const sequences =
    kind === "photo"
      ? [
        { offset: 0, freq: 1100, duration: 0.08, volume: 0.28 },
        { offset: 0.09, freq: 900, duration: 0.1, volume: 0.22 },
        { offset: 0.2, freq: 700, duration: 0.12, volume: 0.18 },
      ]
      : [
        { offset: 0, freq: 820, duration: 0.1, volume: 0.25 },
        { offset: 0.12, freq: 960, duration: 0.12, volume: 0.23 },
      ];

  sequences.forEach(({ offset, freq, duration, volume }) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = freq;
    gain.gain.value = volume;
    oscillator.connect(gain).connect(ctx.destination);
    const startTime = baseTime + offset;
    oscillator.start(startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    oscillator.stop(startTime + duration + 0.02);
  });
}

function flushPendingTones() {
  if (!pendingTones.length) return;
  if (!getAudioContext()) return;
  const jobs = pendingTones.splice(0, pendingTones.length);
  jobs.forEach((kind) => playNotificationTone(kind));
}

function ensureRankModule(projectId, missionTotalValue, force = false) {
  const listEl = document.getElementById("hqRankList");
  if (!listEl || !projectId) return;
  if (!force && rankInstance && rankMissionTotal === missionTotalValue) return;
  // 재초기화: 기존 목록을 지워 플리커를 줄임
  listEl.innerHTML = "";
  rankInstance = initRankModule({
    listId: "hqRankList",
    projectId,
    missionTotal: missionTotalValue,
    showFinishTime: true,
    includeNickname: true,
  });
}

function computePhotoStatus(projectId, teamId) {
  const teamUploads = uploadsCache[teamId];
  if (!teamUploads) return { status: "default", count: 0 };
  let pendingMissions = 0;
  let approvedMissions = 0;

  Object.entries(teamUploads).forEach(([missionKey, slots]) => {
    const requiredSlots = getRequiredSlots(teamId, missionKey);
    if (!requiredSlots.length) return;
    const state = evaluateMissionSlotState(slots, requiredSlots);
    if (state === "pending") pendingMissions += 1;
    else if (state === "approved") approvedMissions += 1;
  });

  let status = "default";
  if (pendingMissions > 0) status = "new";
  else if (approvedMissions > 0) status = "done";
  return { status, count: pendingMissions };
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
  if (photoSlots <= 0 && specialSlots <= 0) return [];
  const slots = [];
  for (let i = 1; i <= photoSlots; i++) {
    slots.push(`Photo${i}`);
  }
  for (let i = 1; i <= specialSlots; i++) {
    slots.push(`S${i}`);
  }
  return slots;
}

async function handlePhotoClick(projectId, teamId) {
  let teamUploads = uploadsCache[teamId];
  if (!teamUploads || Object.keys(teamUploads).length === 0) {
    teamUploads = await fetchCurrentUploads(projectId, teamId);
    if (teamUploads && Object.keys(teamUploads).length > 0) {
      uploadsCache[teamId] = {
        ...(uploadsCache[teamId] || {}),
        ...teamUploads,
      };
    }
  }
  if (!teamUploads || Object.keys(teamUploads).length === 0) {
    teamUploads = await loadLegacyUploads(projectId, teamId);
    if (teamUploads && Object.keys(teamUploads).length > 0) {
      uploadsCache[teamId] = {
        ...(uploadsCache[teamId] || {}),
        ...teamUploads,
      };
    }
  }
  if (!teamUploads || Object.keys(teamUploads).length === 0) {
    alert("업로드된 사진이 없습니다.");
    return;
  }
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

function markTeamFinished(projectId, teamId) {
  if (!projectId || !teamId || pendingFinishUpdates.has(teamId)) return;
  pendingFinishUpdates.add(teamId);
  update(ref(db, `projects/${projectId}/teams/${teamId}/profile`), {
    finishedAt: serverTimestamp(),
  })
    .catch((error) => console.warn("Failed to set finishedAt", error))
    .finally(() => pendingFinishUpdates.delete(teamId));
}

async function fetchCurrentUploads(projectId, teamId) {
  if (!projectId) return {};
  try {
    const snapshot = await get(ref(db, `uploads_meta/${projectId}/${teamId}`));
    return snapshot.val() || {};
  } catch (error) {
    console.warn("Current uploads fetch failed", error);
    return {};
  }
}

async function resetTeamData({ projectId, teamId, board, chatInstance }) {
  if (!projectId || !teamId) return;
  const defaultName = getDefaultTeamName(teamId);
  const profile = latestTeamData[teamId]?.profile || {};
  const number = Number.isFinite(profile.number) ? profile.number : parseInt(teamId.replace("Team", ""), 10) || null;
  const password = profile.password || "";
  const nextProfile = {
    ...profile,
    number,
    password,
    finishedAt: null,
    teamDisplayName: defaultName,
    displayName: defaultName,
    officialTeamName: defaultName,
    name: defaultName,
  };
  const updates = {
    [`projects/${projectId}/teams/${teamId}/missions`]: createDefaultMissionState(missionTotal),
    [`projects/${projectId}/teams/${teamId}/profile`]: nextProfile,
    [`chat/${projectId}/${teamId}`]: null,
    [`uploads_meta/${projectId}/${teamId}`]: null,
  };
  try {
    await update(ref(db), updates);
    await deleteTeamUploadsFromStorage(projectId, teamId);
    uploadsCache[teamId] = {};
    if (typeof board?.setPhotoStatus === "function") {
      board.setPhotoStatus(teamId, { status: "default", count: 0 });
    }
    if (chatInstance?.clearTeamHistory) {
      chatInstance.clearTeamHistory(teamId);
    }
    alert(`${getTeamLabel(teamId)} 팀의 미션/채팅/사진을 초기화했습니다.`);
  } catch (error) {
    console.error("팀 데이터 초기화 실패", error);
    alert("팀 데이터 초기화 중 오류가 발생했습니다.");
  }
}

async function deleteTeamUploadsFromStorage(projectId, teamId) {
  if (!projectId || !teamId) return;
  const baseRef = sRef(storage, `uploads/${projectId}/${teamId}`);
  try {
    await deleteFolderRecursively(baseRef);
  } catch (error) {
    console.warn("스토리지 사진 삭제 실패", error);
  }
}

async function deleteFolderRecursively(folderRef) {
  const list = await listAll(folderRef);
  const deletions = [];
  list.items.forEach((item) => {
    deletions.push(
      deleteObject(item).catch((error) => {
        console.warn("파일 삭제 실패", item.fullPath, error);
      })
    );
  });
  for (const prefix of list.prefixes) {
    deletions.push(deleteFolderRecursively(prefix));
  }
  await Promise.all(deletions);
}

function generatePlaceholderTeams(count = 0) {
  const teams = [];
  for (let i = 1; i <= count; i++) {
    teams.push({
      id: `Team${i}`,
      number: i,
      alias: `${i}팀`,
      label: `${i}팀`,
      profile: { number: i, name: `${i}팀` },
      missionsCompleted: 0,
      missionTotal,
      photoStatus: "default",
      missions: createDefaultMissionState(missionTotal),
      finishedAt: null,
    });
  }
  return teams;
}



function openPhotoModal(projectId, teamId, missions) {
  closePhotoModal();
  const missionKeys = Object.keys(missions)
    .filter((key) => key.startsWith("mission_"))
    .sort((a, b) => Number(a.split("_")[1]) - Number(b.split("_")[1]));

  if (missionKeys.length === 0) {
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
  const targets = [];
  Object.entries(missionSlots).forEach(([slotId, slot]) => {
    if (slotsFilter && slotsFilter.length && !slotsFilter.includes(slotId)) {
      return;
    }
    if (!slot?.url) return;
    const fileName = buildDownloadFileName(teamId, teamLabel, missionId, slotId, slot.url);
    targets.push({ url: slot.url, fileName });
  });
  if (!targets.length) {
    alert("다운로드할 파일이 없습니다.");
    return;
  }
  if (targets.length === 1) {
    await downloadAsBlob(targets[0]);
    return;
  }
  if (typeof JSZip === "undefined") {
    await Promise.all(targets.map(downloadAsBlob));
    return;
  }
  try {
    const zip = new JSZip();
    await Promise.all(
      targets.map(async ({ url, fileName }) => {
        const response = await fetch(url, { mode: "cors" });
        if (!response.ok) {
          throw new Error(`다운로드 실패: ${fileName}`);
        }
        const blob = await response.blob();
        zip.file(fileName, blob);
      })
    );
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const zipName = `${sanitizeFileSegment(teamId)}_M${missionId}_photos.zip`;
    triggerBlobDownload(zipBlob, zipName);
  } catch (error) {
    console.error(error);
    alert("다운로드 중 오류가 발생했습니다. 네트워크 상태를 확인하세요.");
  }
}

async function downloadAsBlob({ url, fileName }) {
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) {
    throw new Error(`다운로드 실패: ${fileName}`);
  }
  const blob = await response.blob();
  triggerBlobDownload(blob, fileName);
}

function sanitizeFileSegment(value = "") {
  return String(value || "TEAM").replace(/[^\w가-힣.-]+/g, "_");
}

function triggerBlobDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName || "photos.zip";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 0);
}



function syncProjectCountdown(projectId, meta = {}) {
  if (!projectId) return;
  const now = Date.now();
  const target = meta.educationAt || meta.endAt || null;
  if (!target || target <= now) return;
  const duration = Math.max(60, Math.floor((target - now) / 1000));
  if (!Number.isFinite(duration) || duration <= 0) return;
  const signature = `${target}-${duration}`;
  if (signature === lastCountdownSignature) return;
  lastCountdownSignature = signature;
  const countdownRef = ref(db, `projects/${projectId}/countdown`);
  set(countdownRef, {
    startAt: now,
    duration,
  }).catch((error) => {
    console.error("Failed to sync countdown", error);
  });
}
