import { initRankModule } from "./rank_module.js";
import { initHQBoardModule } from "./hq_board_module.js";
import { initTimeModule } from "./time_module.js";
import { initHQChatModule } from "./hq_chat_module.js";
import { db, ref, onValue, set, update, push, serverTimestamp, get } from "./firebase_config.js";
import { requireProjectContext, storeProjectContext } from "./project_context.js";
import { downloadFile } from "./utils.js";
import { STEP_MODES, getStepConfig, normalizeMissionEntry } from "./mission_rules.js";
import { createDefaultMissionState } from "./mission_state.js";
import { formatSlotLabelFromMission, getRequiredSlotsFromMission } from "./photo_slots.js";
import { resolveMissionConfigFromProject } from "./project_mission_resolver.js";

const DEFAULT_SLOT_TEMPLATE = ["Photo1", "Photo2", "S1"];
const HQ_RETRY_REASON_TEMPLATES = [
  "사진이 흐립니다.",
  "인원이 모두 보이게 다시 촬영해 주세요.",
  "가로 방향으로 다시 촬영해 주세요.",
  "조금 더 밝게 다시 촬영해 주세요.",
  "구도를 다시 맞춰 촬영해 주세요.",
];
let missionTotal = 9;
const DEFAULT_MIME = "application/octet-stream";

const params = new URLSearchParams(window.location.search);
const projectIdFromQuery = params.get("project");

let projectContext = null;
if (projectIdFromQuery) {
  projectContext = { projectId: projectIdFromQuery };
  storeProjectContext(projectContext);
} else {
  projectContext = requireProjectContext({
    fallbackUrl: new URL("./admin.html", window.location.href).toString(),
  });
}

let latestTeamData = {};
let latestRoutingConfig = null;
let latestTeamOverrides = {};
let uploadsCache = {};
let legacyUploadsCache = {};
let photoModalEl = null;
let currentPhotoContext = null;
let projectMeta = {};
let lastCountdownSignature = null;
let latestBoardTeams = [];
const unreadTeamCounts = {};
let latestDriveBackups = {};
let latestDriveBackupErrors = {};
let hqToastHost = null;
let hqPromptHost = null;
let opsTimelineUnsubscribe = null;
let latestHQOpsTimelineItems = [];
let hqOpsTimelineFilter = "all";

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

function filterHQOpsTimelineItems(items = [], filter = "all") {
  const groups = {
    announcement: new Set(["announcement_broadcast", "announcement_team"]),
    approve: new Set(["hq_step_approve", "hq_photo_approve"]),
    retry: new Set(["hq_photo_retry"]),
    bypass: new Set(["mission_bypass"]),
  };
  if (!groups[filter]) return items;
  return items.filter((item) => groups[filter].has(item.action || ""));
}

function slugifyLabel(value = "") {
  return String(value || "")
    .trim()
    .replace(/[^\w가-힣-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildDownloadFileName(teamId, teamName, missionId, slotId, slotLabel = "", url = "", originalName = "") {
  const teamNo = String(teamNumber(teamId) || 0).padStart(2, "0");
  const photoNo = String(extractSlotSequence(slotId, slotLabel)).padStart(2, "0");
  const extSource = originalName || url;
  const extMatch = String(extSource || "").split("?")[0].split(".").pop();
  const extension = extMatch && extMatch.length < 8 ? extMatch : "dat";
  return `T${teamNo}_P${photoNo}.${extension}`;
}

function extractSlotSequence(slotId = "", slotLabel = "") {
  const slotMatch = String(slotId || "").match(/(\d+)/);
  if (slotMatch?.[1]) return Number(slotMatch[1]) || 1;
  const labelMatch = String(slotLabel || "").match(/(\d+)/);
  if (labelMatch?.[1]) return Number(labelMatch[1]) || 1;
  return 1;
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

function showHQToast(message, type = "info", duration = 2600) {
  if (!message) return;
  if (!hqToastHost) {
    hqToastHost = document.createElement("div");
    hqToastHost.className = "hq-toast-host";
    document.body.appendChild(hqToastHost);
  }
  const toast = document.createElement("div");
  toast.className = `hq-toast hq-toast--${type}`;
  toast.textContent = message;
  hqToastHost.appendChild(toast);
  window.setTimeout(() => {
    toast.classList.add("is-leaving");
    window.setTimeout(() => toast.remove(), 180);
  }, duration);
}

function requestHQReason(title, placeholder = "", templates = []) {
  return new Promise((resolve) => {
    if (hqPromptHost) {
      hqPromptHost.remove();
      hqPromptHost = null;
    }
    const overlay = document.createElement("div");
    overlay.className = "hq-prompt-overlay";
    const templateMarkup = templates.length
      ? `
        <div class="hq-prompt__templates">
          ${templates
            .map(
              (template) =>
                `<button type="button" class="hq-prompt__template" data-template="${escapeAttr(template)}">${template}</button>`
            )
            .join("")}
        </div>
      `
      : "";
    overlay.innerHTML = `
      <div class="hq-prompt">
        <h3>${title}</h3>
        ${templateMarkup}
        <textarea id="hqPromptInput" placeholder="${placeholder}"></textarea>
        <div class="hq-prompt__actions">
          <button type="button" class="reset-btn" id="hqPromptCancel">취소</button>
          <button type="button" class="approve-btn" id="hqPromptConfirm">확인</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    hqPromptHost = overlay;
    const input = overlay.querySelector("#hqPromptInput");
    const cleanup = (value = null) => {
      overlay.remove();
      hqPromptHost = null;
      resolve(value);
    };
    overlay.querySelector("#hqPromptCancel")?.addEventListener("click", () => cleanup(null));
    overlay.querySelector("#hqPromptConfirm")?.addEventListener("click", () => {
      const value = input?.value.trim() || "";
      cleanup(value || null);
    });
    overlay.querySelectorAll("[data-template]").forEach((button) => {
      button.addEventListener("click", () => {
        const template = button.getAttribute("data-template") || "";
        if (!input) return;
        input.value = template;
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      });
    });
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) cleanup(null);
    });
    window.setTimeout(() => input?.focus(), 0);
  });
}

function requestHQConfirm(title, message, confirmLabel = "진행") {
  return new Promise((resolve) => {
    if (hqPromptHost) {
      hqPromptHost.remove();
      hqPromptHost = null;
    }
    const overlay = document.createElement("div");
    overlay.className = "hq-prompt-overlay";
    overlay.innerHTML = `
      <div class="hq-prompt">
        <h3>${title}</h3>
        <p class="hq-prompt__message">${message}</p>
        <div class="hq-prompt__actions">
          <button type="button" class="reset-btn" id="hqConfirmCancel">취소</button>
          <button type="button" class="approve-btn" id="hqConfirmSubmit">${confirmLabel}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    hqPromptHost = overlay;
    const cleanup = (value = false) => {
      overlay.remove();
      hqPromptHost = null;
      resolve(value);
    };
    overlay.querySelector("#hqConfirmCancel")?.addEventListener("click", () => cleanup(false));
    overlay.querySelector("#hqConfirmSubmit")?.addEventListener("click", () => cleanup(true));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) cleanup(false);
    });
  });
}

if (projectContext?.projectId) {
  document.addEventListener("DOMContentLoaded", () => initializeHQ(projectContext));
} else {
  document.addEventListener("DOMContentLoaded", () => {
    window.location.href = new URL("./admin.html", window.location.href).toString();
  });
}

function initializeHQ(ctx) {
  const projectId = ctx.projectId;
  const countdownPath = projectId ? `projects/${projectId}/countdown` : null;
  const headerEl = document.getElementById("hqProjectTitle");
  const searchInput = document.getElementById("hqTeamSearch");
  const statusFilter = document.getElementById("hqStatusFilter");
  const reviewBtn = document.getElementById("hqReviewBtn");
  const photoManifestBtn = document.getElementById("hqPhotoManifestBtn");
  const photoSlidesBtn = document.getElementById("hqPhotoSlidesBtn");
  const photoScriptBtn = document.getElementById("hqPhotoScriptBtn");
  const eventBundleBtn = document.getElementById("hqEventBundleBtn");
  const priorityQueueEl = document.getElementById("hqPriorityQueue");
  const opsTimelineEl = document.getElementById("hqOpsTimeline");
  const driveBackupStatusEl = document.getElementById("hqDriveBackupStatus");
  const opsFilterButtons = Array.from(document.querySelectorAll("[data-hq-ops-filter]"));
  const priorityHandlers = {
    onTeamSelect: (teamId, mode = "all") => {
      if (mode === "hq") {
        approvePendingHQStep(projectId, teamId);
        return;
      }
      if (searchInput) searchInput.value = "";
      if (statusFilter) statusFilter.value = mode;
      board.update(filterTeamsForBoard(latestBoardTeams, "", mode));
      refreshPhotoStatuses(projectId, board);
      const target = document.querySelector(`.team-box[data-team-id="${teamId}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.classList.add("team-box--focus");
      window.setTimeout(() => target?.classList.remove("team-box--focus"), 1400);
    },
  };
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
  const renderFilteredTeams = (teams = latestBoardTeams) => {
    latestBoardTeams = Array.isArray(teams) ? teams : [];
    board.update(filterTeamsForBoard(latestBoardTeams, searchInput?.value || "", statusFilter?.value || "all"));
    renderPriorityQueue(priorityQueueEl, latestBoardTeams, priorityHandlers);
  };
  searchInput?.addEventListener("input", () => renderFilteredTeams());
  statusFilter?.addEventListener("change", () => renderFilteredTeams());
  opsFilterButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.hqOpsFilter === hqOpsTimelineFilter);
    button.addEventListener("click", () => {
      hqOpsTimelineFilter = button.dataset.hqOpsFilter || "all";
      opsFilterButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      renderHQOpsTimeline(opsTimelineEl, latestHQOpsTimelineItems);
    });
  });
  subscribeHQOpsTimeline(projectId, opsTimelineEl);
  subscribeDriveBackupStatus(projectId, driveBackupStatusEl);
  window.setInterval(() => {
    renderPriorityQueue(priorityQueueEl, latestBoardTeams, priorityHandlers);
  }, 1000);

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
        renderFilteredTeams(placeholders);
      }
    } else {
      renderFilteredTeams();
    }
    const useSharedCountdown = Boolean(projectMeta.endAt);
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
        timeOptions.startTime = null;
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
  reviewBtn?.addEventListener("click", () => {
    const nextUrl = new URL("./review.html", window.location.href);
    nextUrl.searchParams.set("project", projectId);
    window.open(nextUrl.toString(), "_blank");
  });
  photoManifestBtn?.addEventListener("click", () => {
    downloadProjectPhotoManifest(projectId);
  });
  photoSlidesBtn?.addEventListener("click", () => {
    downloadProjectPhotoSlidesCsv(projectId);
  });
  photoScriptBtn?.addEventListener("click", () => {
    downloadProjectPhotoScript(projectId);
  });
  eventBundleBtn?.addEventListener("click", () => {
    downloadProjectEventBundle(projectId);
  });
  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      const activeTeam = chatInstance?.getActiveTeam();
      if (!activeTeam || activeTeam === "__broadcast") {
        showHQToast("왼쪽 탭에서 팀을 선택한 뒤 리셋할 수 있습니다.", "warn", 2800);
        return;
      }
      const teamName = getTeamLabel(activeTeam);
      const confirmed = await requestHQConfirm(
        "팀 리셋",
        `${teamName} 팀의 미션, 사진 업로드, 채팅 기록을 초기화합니다. 되돌릴 수 없습니다.`,
        "리셋"
      );
      if (!confirmed) return;
      resetTeamMissions(projectId, activeTeam).catch((error) => {
        console.error(error);
        showHQToast("팀 리셋 중 오류가 발생했습니다.", "error", 3600);
      });
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

    renderFilteredTeams(teams);

    if (!chatInstance) {
      chatInstance = initHQChatModule({
        containerId: "hqChat",
        projectId,
        teams: teams.map((team, index) => ({
          id: team.id,
          label: formatTeamDisplay(team),
        })),
        role: "HQ",
        onTeamMessage: (teamId, _message, unreadCount) => {
          unreadTeamCounts[teamId] = unreadCount;
          board.setChatAlert(teamId, unreadCount);
          renderFilteredTeams();
        },
        onMessagesRead: (teamId) => {
          unreadTeamCounts[teamId] = 0;
          board.setChatAlert(teamId, 0);
          renderFilteredTeams();
        },
        onSendError: () => {
          showHQToast("채팅 전송에 실패했습니다. 다시 시도해 주세요.", "error", 3200);
        },
      });
      board.setChatHandler((teamId) => chatInstance?.setActiveTeam(teamId));
    }
  });
  onValue(ref(db, `projects/${projectId}/routing`), (snapshot) => {
    latestRoutingConfig = snapshot.val() || null;
    renderFilteredTeams();
    refreshPhotoStatuses(projectId, board);
  });
  onValue(ref(db, `projects/${projectId}/teamOverrides`), (snapshot) => {
    latestTeamOverrides = snapshot.val() || {};
    renderFilteredTeams();
    refreshPhotoStatuses(projectId, board);
  });

  const uploadsRef = ref(db, `uploads_meta/${projectId}`);
  onValue(uploadsRef, (snapshot) => {
    uploadsCache = snapshot.val() || {};
    renderFilteredTeams();
    if (photoModalEl && currentPhotoContext) {
      const key = currentPhotoContext.currentMissionKey || currentPhotoContext.missionSelect?.value;
      if (key) renderMissionGallery(key);
    }
  });
}

function renderPriorityQueue(container, teams = [], handlers = {}) {
  if (!container) return;
  const hqTeams = teams
    .map((team) => ({ team, pending: getAwaitingHQApproval(team.id) }))
    .filter((entry) => entry.pending)
    .slice(0, 6);
  const delayTeams = teams
    .map((team) => ({ team, pending: getDelayedAdvance(team.id) }))
    .filter((entry) => entry.pending)
    .sort((a, b) => (a.pending.unlockAt || Infinity) - (b.pending.unlockAt || Infinity))
    .slice(0, 6);
  const chatTeams = teams
    .filter((team) => (unreadTeamCounts[team.id] || 0) > 0)
    .sort((a, b) => (unreadTeamCounts[b.id] || 0) - (unreadTeamCounts[a.id] || 0))
    .slice(0, 6);
  const nearDoneTeams = teams
    .filter((team) => {
      const total = team.missionTotal || missionTotal;
      const done = team.missionsCompleted || 0;
      return total > 0 && done < total && total - done <= 2;
    })
    .sort((a, b) => (b.missionsCompleted || 0) - (a.missionsCompleted || 0))
    .slice(0, 6);

  const sections = [
    { title: "HQ 대기", mode: "hq", items: hqTeams, total: hqTeams.length },
    { title: "자동 이동 대기", mode: "delay", items: delayTeams, total: delayTeams.length },
    { title: "채팅 알림", mode: "chat", items: chatTeams, total: chatTeams.length },
    { title: "완주 임박", mode: "active", items: nearDoneTeams, total: nearDoneTeams.length },
  ];

  container.innerHTML = sections
    .map((section) => `
      <div class="hq-priority-card">
        <div class="hq-priority-head">
          <strong>${section.title}</strong>
          <span class="hq-priority-count">${section.total}</span>
        </div>
        <div class="hq-priority-list">
          ${section.items.length
            ? section.items
                .map((entry) => {
                  const team = entry.team || entry;
                  const pending = entry.pending || null;
                  const chipMeta = section.mode === "chat"
                    ? `${unreadTeamCounts[team.id] || 0}건`
                    : section.mode === "hq"
                      ? `M${pending?.missionNumber || "-"} ${pending?.stepKey === "codeStep" ? "코드" : "미션"} 승인`
                      : section.mode === "delay"
                        ? `M${pending?.missionNumber || "-"} · ${formatRemainingSeconds(pending?.unlockAt)}`
                      : section.mode === "active"
                        ? `${Math.max(0, (team.missionTotal || missionTotal) - (team.missionsCompleted || 0))}개 남음`
                      : "승인 필요";
                  return `
                    <button type="button" class="hq-priority-chip" data-team-id="${team.id}" data-mode="${section.mode}">
                      <span class="hq-priority-chip__label">${formatTeamDisplay(team)}</span>
                      <span class="hq-priority-chip__meta">${chipMeta}</span>
                    </button>
                  `;
                })
                .join("")
            : `<span class="hq-priority-empty">없음</span>`}
        </div>
      </div>
    `)
    .join("");

  container.querySelectorAll(".hq-priority-chip").forEach((button) => {
    button.addEventListener("click", () => handlers.onTeamSelect?.(button.dataset.teamId, button.dataset.mode));
  });
}

function filterTeamsForBoard(teams = [], search = "", filter = "all") {
  const query = String(search || "").trim().toLowerCase();
  return teams.filter((team) => {
    const label = formatTeamDisplay(team).toLowerCase();
    const matchesSearch = !query || label.includes(query) || String(team.id || "").toLowerCase().includes(query);
    if (!matchesSearch) return false;

    switch (filter) {
      case "active":
        return (team.missionsCompleted || 0) < (team.missionTotal || missionTotal);
      case "hq":
        return Boolean(getAwaitingHQApproval(team.id));
      case "delay":
        return Boolean(getDelayedAdvance(team.id));
      case "chat":
        return (unreadTeamCounts[team.id] || 0) > 0;
      case "done":
        return (team.missionsCompleted || 0) >= (team.missionTotal || missionTotal);
      default:
        return true;
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
  let completed = 0;
  const missions = {};
  let hqPending = null;
  let delayPending = null;
  let currentStage = "";
  let currentCodeNumber = 0;
  let currentCodeLabel = "";
  let currentRouteKey = "";
  let currentRouteLabel = "";

  for (let i = 1; i <= missionTotal; i++) {
    const entry = missionsRaw[i] || {};
    const stage = entry.stage || (i === 1 ? "code" : "locked");
    const panel = entry.panel || null;
    const stepStatus = entry.stepStatus || null;
    const unlockAt = Number(entry.unlockAt) || null;
    missions[i] = { stage, panel, stepStatus, unlockAt };
    if (stage === "done") completed += 1;
    if (stepStatus === "awaiting_hq" && !hqPending) {
      hqPending = {
        missionNumber: i,
        stepLabel: stage === "mission" ? "미션" : "코드",
      };
    }
    if (stepStatus === "delay" && unlockAt) {
      const candidate = { missionNumber: i, unlockAt };
      if (!delayPending || unlockAt < delayPending.unlockAt) {
        delayPending = candidate;
      }
    }
    if (!currentStage && (stage === "code" || stage === "mission")) {
      currentStage = stage;
      currentCodeNumber = i;
      const missionConfig = resolveMissionEntry(teamId, i);
      currentCodeLabel = String(missionConfig?.codeLabel || "").trim();
      currentRouteKey = String(missionConfig?.routeKey || "").trim().toUpperCase();
      currentRouteLabel = String(missionConfig?.routeLabel || "").trim();
    }
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
    hqPending,
    delayPending,
    currentStage,
    currentCodeNumber,
    currentCodeLabel,
    currentRouteKey,
    currentRouteLabel,
  };
}

function getTeamLabel(teamId) {
  const profile = latestTeamData[teamId]?.profile || {};
  const fallback = parseInt(teamId.replace("Team", ""), 10);
  const numeric = typeof profile.number === "number" ? profile.number : fallback;
  const base = Number.isFinite(numeric) && numeric > 0 ? `${numeric}팀` : teamId;
  return profile.name ? `${base} ${profile.name}` : base;
}

function getAwaitingHQApproval(teamId) {
  for (let i = 1; i <= missionTotal; i++) {
    const state = latestTeamData[teamId]?.missions?.[i];
    if (!state || state.stepStatus !== "awaiting_hq") continue;
    const stepKey = state.stage === "mission" ? "missionStep" : "codeStep";
    const config = resolveMissionEntry(teamId, i);
    const stepConfig = getStepConfig(config, stepKey);
    if (stepConfig.mode === STEP_MODES.HQ) {
      return {
        missionNumber: i,
        stepKey,
        stepConfig,
      };
    }
  }
  return null;
}

function getDelayedAdvance(teamId) {
  let nearest = null;
  for (let i = 1; i <= missionTotal; i++) {
    const state = latestTeamData[teamId]?.missions?.[i];
    if (!state || state.stepStatus !== "delay" || !Number(state.unlockAt)) continue;
    const stepKey = state.stage === "mission" ? "missionStep" : "codeStep";
    const candidate = {
      missionNumber: i,
      stepKey,
      unlockAt: Number(state.unlockAt),
    };
    if (!nearest || candidate.unlockAt < nearest.unlockAt) {
      nearest = candidate;
    }
  }
  return nearest;
}

function formatRemainingSeconds(unlockAt) {
  const target = Number(unlockAt) || 0;
  if (!target) return "-";
  const remaining = Math.max(0, Math.ceil((target - Date.now()) / 1000));
  return `${remaining}초 남음`;
}

async function approvePendingHQStep(projectId, teamId) {
  const pending = getAwaitingHQApproval(teamId);
  if (!pending) {
    showHQToast("현재 HQ 승인 대기 단계가 없습니다.", "warn", 2600);
    return;
  }
  const teamLabel = getTeamLabel(teamId);
  const stepLabel = pending.stepKey === "codeStep" ? "코드" : "미션";
  const confirmed = await requestHQConfirm(
    "HQ 승인",
    `${teamLabel} · M${pending.missionNumber} ${stepLabel} 단계를 승인합니다.`,
    "승인"
  );
  if (!confirmed) return;

  const updates = {};
  const missionPath = `projects/${projectId}/teams/${teamId}/missions/${pending.missionNumber}`;
  const delaySeconds = Number(pending.stepConfig.autoAdvanceSeconds) || 0;

  if (delaySeconds > 0) {
    updates[`${missionPath}/stepStatus`] = "delay";
    updates[`${missionPath}/unlockAt`] = Date.now() + delaySeconds * 1000;
  } else if (pending.stepKey === "codeStep") {
    updates[`${missionPath}/stage`] = "mission";
    updates[`${missionPath}/panel`] = "mission";
    updates[`${missionPath}/stepStatus`] = null;
    updates[`${missionPath}/unlockAt`] = null;
    updates[`${missionPath}/completedAt`] = null;
  } else {
    updates[`${missionPath}/stage`] = "done";
    updates[`${missionPath}/panel`] = null;
    updates[`${missionPath}/stepStatus`] = null;
    updates[`${missionPath}/unlockAt`] = null;
    updates[`${missionPath}/completedAt`] = Date.now();
    if (pending.missionNumber < missionTotal) {
      const nextMission = String(pending.missionNumber + 1);
      const nextMissionData = latestTeamData[teamId]?.missions?.[nextMission];
      if (!nextMissionData || nextMissionData.stage === "locked") {
        updates[`projects/${projectId}/teams/${teamId}/missions/${nextMission}/stage`] = "code";
        updates[`projects/${projectId}/teams/${teamId}/missions/${nextMission}/panel`] = null;
        updates[`projects/${projectId}/teams/${teamId}/missions/${nextMission}/stepStatus`] = null;
        updates[`projects/${projectId}/teams/${teamId}/missions/${nextMission}/unlockAt`] = null;
        updates[`projects/${projectId}/teams/${teamId}/missions/${nextMission}/completedAt`] = null;
      }
    }
  }

  try {
    await update(ref(db), updates);
    await appendOpsLog(projectId, "hq_step_approve", {
      source: "hq",
      teamId,
      teamLabel,
      missionId: pending.missionNumber,
      step: pending.stepKey,
      delaySeconds,
    });
    showHQToast(`${teamLabel} · M${pending.missionNumber} ${stepLabel} 승인 완료`, "success", 2400);
  } catch (error) {
    console.error(error);
    showHQToast("HQ 승인 처리 중 오류가 발생했습니다.", "error", 3000);
  }
}

function refreshPhotoStatuses(projectId, board) {
  const teamIds = Object.keys(latestTeamData || {});
  teamIds.forEach((teamId) => {
    board.setPhotoStatus(teamId, computePhotoStatus(projectId, teamId));
  });
}

function computePhotoStatus(projectId, teamId) {
  const teamUploads = uploadsCache[teamId];
  if (!teamUploads) return "default";
  let hasPending = false;
  let hasApproved = false;

  Object.entries(teamUploads).forEach(([missionKey, slots]) => {
    const requiredSlots = getRequiredSlots(teamId, missionKey);
    if (!requiredSlots.length) return;
    const state = evaluateMissionSlotState(slots, requiredSlots);
    if (state === "pending") hasPending = true;
    else if (state === "approved") hasApproved = true;
  });

  if (hasPending) return "new";
  if (hasApproved) return "done";
  return "default";
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
  const config = resolveMissionEntry(teamId, missionNumber);
  return getRequiredSlotsFromMission(config);
}

function resolveMissionEntry(teamId, missionNumber) {
  const legacyMission = latestTeamData[teamId]?.config?.missions?.[missionNumber] || {};
  const teamOverride = latestTeamOverrides?.[teamId] || {};
  return normalizeMissionEntry(resolveMissionConfigFromProject({
    teamId,
    missionNumber: Number(missionNumber),
    missionTotal,
    routing: latestRoutingConfig,
    teamOverride,
    legacyMission,
    meta: projectMeta,
  }));
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
    showHQToast("업로드된 사진이 없습니다.", "warn", 2600);
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

function resetTeamMissions(projectId, teamId) {
  const updates = {
    [`projects/${projectId}/teams/${teamId}/missions`]: createDefaultMissionState(missionTotal),
    [`uploads_meta/${projectId}/${teamId}`]: null,
    [`chat/${projectId}/${teamId}`]: null,
  };
  return update(ref(db), updates).then(() =>
    appendOpsLog(projectId, "hq_team_reset", {
      source: "hq",
      teamId,
      teamLabel: getTeamLabel(teamId),
    })
  );
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

function openPhotoModal(projectId, teamId, missions) {
  closePhotoModal();
  const missionKeys = Object.keys(missions)
    .filter((key) => key.startsWith("mission_"))
    .sort((a, b) => Number(a.split("_")[1]) - Number(b.split("_")[1]));

  if (missionKeys.length === 0) {
    showHQToast("업로드된 사진이 없습니다.", "warn", 2600);
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
          <p class="photo-modal__mission-label">배치를 누르면 이번 제출 묶음이 자동 선택됩니다. CSV는 정리표, 스크립트는 원본 일괄 저장용입니다.</p>
        </div>
        <div class="photo-modal__header-actions">
          <div class="photo-modal__queue" id="photoQueueStatus"></div>
          <button type="button" id="photoNextTeamBtn" class="download-btn secondary">다음 대기 팀</button>
          <select id="photoMissionSelect">
            ${missionKeys
              .map((key) => {
                const missionId = key.split("_")[1];
                return `<option value="${key}">Mission ${missionId}</option>`;
              })
              .join("")}
          </select>
        </div>
      </div>
      <div class="photo-modal__body">
        <div class="photo-preview">
          <div class="photo-preview__main" id="photoPreviewMain">썸네일을 선택하세요.</div>
          <div class="photo-batches">
            <div class="photo-batches__head">
              <strong>제출 묶음</strong>
              <span id="photoBatchSummary">0건</span>
            </div>
            <div class="photo-batches__list" id="photoBatchList"></div>
          </div>
        </div>
        <div class="photo-thumbs" id="photoThumbs"></div>
      </div>
      <div class="photo-modal__actions">
        <div class="action-left">
          <button id="photoManifestBtn" class="download-btn secondary">매니페스트 CSV</button>
          <button id="photoScriptBtn" class="download-btn secondary">다운로드 스크립트</button>
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
  const batchListEl = modal.querySelector("#photoBatchList");
  const batchSummaryEl = modal.querySelector("#photoBatchSummary");
  const downloadAllBtn = modal.querySelector("#photoDownloadAllBtn");
  const downloadSelectedBtn = modal.querySelector("#photoDownloadSelectedBtn");
  const manifestBtn = modal.querySelector("#photoManifestBtn");
  const scriptBtn = modal.querySelector("#photoScriptBtn");
  const nextTeamBtn = modal.querySelector("#photoNextTeamBtn");
  const queueStatusEl = modal.querySelector("#photoQueueStatus");

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
    batchListEl,
    batchSummaryEl,
    downloadAllBtn,
    downloadSelectedBtn,
    manifestBtn,
    scriptBtn,
    nextTeamBtn,
    queueStatusEl,
    currentMissionKey: null,
    selectedByMission: new Map(),
    requiredSlotsMap: new Map(),
    selectedBatchByMission: new Map(),
  };

  missionSelect.addEventListener("change", () => {
    renderMissionGallery(missionSelect.value);
  });

  approveBtn.addEventListener("click", () => {
    const missionKey = missionSelect.value;
    const selected = Array.from(currentPhotoContext.selectedByMission.get(missionKey) || []);
    const targetSlots = selected.length ? selected : (currentPhotoContext.requiredSlotsMap.get(missionKey) || []);
    if (!targetSlots.length || !targetSlots.every((slotId) => missions[missionKey]?.[slotId]?.url)) {
      showHQToast("승인할 슬롯을 선택하거나 모든 필수 슬롯이 업로드되어야 합니다.", "warn", 2800);
      return;
    }
    approveMission(projectId, teamId, missionKey);
  });

  retryBtn.addEventListener("click", () => {
    const missionKey = missionSelect.value;
    requestRetry(projectId, teamId, missionKey);
  });
  downloadAllBtn?.addEventListener("click", () => {
    const missionKey = missionSelect.value;
    downloadMissionAssets(projectId, teamId, missionKey);
  });
  downloadSelectedBtn?.addEventListener("click", () => {
    const missionKey = missionSelect.value;
    const selected = Array.from(currentPhotoContext.selectedByMission.get(missionKey) || []);
    if (!selected.length) {
      showHQToast("다운로드할 사진을 선택하세요.", "warn", 2600);
      return;
    }
    downloadMissionAssets(projectId, teamId, missionKey, selected);
  });
  manifestBtn?.addEventListener("click", () => {
    const missionKey = missionSelect.value;
    const selected = Array.from(currentPhotoContext.selectedByMission.get(missionKey) || []);
    downloadMissionManifest(projectId, teamId, missionKey, selected.length ? selected : null);
  });
  scriptBtn?.addEventListener("click", () => {
    const missionKey = missionSelect.value;
    const selected = Array.from(currentPhotoContext.selectedByMission.get(missionKey) || []);
    downloadMissionShellScript(projectId, teamId, missionKey, selected.length ? selected : null);
  });
  nextTeamBtn?.addEventListener("click", () => {
    const nextTeamId = getNextPendingPhotoTeam(projectId, teamId);
    if (!nextTeamId) {
      showHQToast("현재 대기 중인 다른 팀이 없습니다.", "warn", 2400);
      return;
    }
    handlePhotoClick(projectId, nextTeamId);
  });

  missionSelect.value = missionKeys[missionKeys.length - 1];
  renderMissionGallery(missionSelect.value);
  updatePhotoQueueStatus();
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
    batchListEl,
    batchSummaryEl,
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
  renderMissionBatches(missionKey, slots, batchListEl, batchSummaryEl);

  thumbsEl.innerHTML = slotOrder
    .map((slotId) => {
      const item = slots[slotId];
      const label = getSlotLabel(teamId, missionKey, slotId);
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
    const label = getSlotLabel(teamId, missionKey, slotId);
    media.addEventListener("mouseenter", () => updatePreview(slots, slotId));
    media.addEventListener("click", () => updatePreview(slots, slotId));
    if (item) {
      hasFiles = true;
      const fileName = buildDownloadFileName(teamId, teamName, missionId, slotId, label, item.url, item.originalName);
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
    const selectedSlots = Array.from(selectedSet).filter((slotId) => slots[slotId]?.url);
    approveBtn.disabled = !(selectedSlots.length || isMissionReady(slots, slotOrder));
    approveBtn.textContent = selectedSlots.length ? `선택 승인 (${selectedSlots.length})` : "전체 승인";
  }
  if (retryBtn) {
    retryBtn.disabled = !Array.from(selectedSet).some((slotId) => slots[slotId]?.url);
    retryBtn.textContent = Array.from(selectedSet).some((slotId) => slots[slotId]?.url)
      ? `선택 재도전 (${Array.from(selectedSet).filter((slotId) => slots[slotId]?.url).length})`
      : "재도전";
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
  updatePhotoQueueStatus();
}

function updateSelectedDownloadState(missionKey) {
  if (!currentPhotoContext?.downloadSelectedBtn) return;
  const selected = currentPhotoContext.selectedByMission.get(missionKey) || new Set();
  currentPhotoContext.downloadSelectedBtn.disabled = !selected.size;
}

function renderMissionBatches(missionKey, slots = {}, batchListEl, batchSummaryEl) {
  if (!batchListEl || !batchSummaryEl || !currentPhotoContext) return;
  const batches = groupSlotsByBatch(slots);
  const selectedBatchId = currentPhotoContext.selectedBatchByMission.get(missionKey) || "";
  batchSummaryEl.textContent = `${batches.length}묶음`;
  if (!batches.length) {
    batchListEl.innerHTML = `<div class="photo-batch photo-batch--empty">배치 정보가 없습니다.</div>`;
    return;
  }
  batchListEl.innerHTML = batches.map((batch) => `
    <button
      type="button"
      class="photo-batch ${selectedBatchId === batch.batchId ? "is-active" : ""}"
      data-batch-id="${escapeAttr(batch.batchId)}"
    >
      <strong>${escapeHtml(batch.batchLabel)}</strong>
      <span>${batch.slotCount}개 슬롯 · ${batch.fileCount}개 파일</span>
      <span>${batch.uploadedAtLabel}</span>
    </button>
  `).join("");
  batchListEl.querySelectorAll("[data-batch-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const batchId = button.dataset.batchId || "";
      const current = currentPhotoContext.selectedBatchByMission.get(missionKey) || "";
      const nextBatchId = current === batchId ? "" : batchId;
      currentPhotoContext.selectedBatchByMission.set(missionKey, nextBatchId);
      const selectedSet = currentPhotoContext.selectedByMission.get(missionKey) || new Set();
      selectedSet.clear();
      if (nextBatchId) {
        batches.find((item) => item.batchId === nextBatchId)?.slotIds.forEach((slotId) => selectedSet.add(slotId));
      }
      renderMissionGallery(missionKey);
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

function getSlotLabel(teamId, missionKey, slotId) {
  const missionId = missionKey.split("_")[1];
  const mission = resolveMissionEntry(teamId, missionId);
  return formatSlotLabelFromMission(mission, slotId, { fallbackSlots: DEFAULT_SLOT_TEMPLATE });
}

function getPendingPhotoMissionKeys(teamId) {
  const teamUploads = uploadsCache[teamId] || {};
  return Object.keys(teamUploads)
    .filter((missionKey) => missionKey.startsWith("mission_"))
    .sort((a, b) => Number(a.split("_")[1]) - Number(b.split("_")[1]))
    .filter((missionKey) => {
      const requiredSlots = getRequiredSlots(teamId, missionKey);
      if (!requiredSlots.length) return false;
      return evaluateMissionSlotState(teamUploads[missionKey], requiredSlots) === "pending";
    });
}

function getPendingPhotoTeamIds(projectId) {
  const teamIds = new Set([
    ...Object.keys(latestTeamData || {}),
    ...Object.keys(uploadsCache || {}),
  ]);
  return Array.from(teamIds)
    .filter((teamId) => computePhotoStatus(projectId, teamId) === "new")
    .sort((a, b) => {
      const numberA = Number(String(a).replace("Team", "")) || 0;
      const numberB = Number(String(b).replace("Team", "")) || 0;
      return numberA - numberB;
    });
}

function getNextPendingPhotoTeam(projectId, currentTeamId) {
  const pendingTeams = getPendingPhotoTeamIds(projectId);
  if (!pendingTeams.length) return null;
  const currentIndex = pendingTeams.indexOf(currentTeamId);
  if (currentIndex < 0) return pendingTeams[0];
  return pendingTeams[currentIndex + 1] || null;
}

function updatePhotoQueueStatus() {
  if (!currentPhotoContext?.queueStatusEl) return;
  const { projectId, teamId, currentMissionKey, queueStatusEl, nextTeamBtn } = currentPhotoContext;
  const pendingTeams = getPendingPhotoTeamIds(projectId);
  const pendingMissions = getPendingPhotoMissionKeys(teamId);
  const teamPosition = Math.max(1, pendingTeams.indexOf(teamId) + 1);
  queueStatusEl.textContent = pendingTeams.length
    ? `대기 팀 ${teamPosition}/${pendingTeams.length} · 남은 미션 ${pendingMissions.length}`
    : "대기 팀 없음";
  if (nextTeamBtn) {
    nextTeamBtn.disabled = !getNextPendingPhotoTeam(projectId, teamId);
  }
  if (currentMissionKey && pendingMissions.length && !pendingMissions.includes(currentMissionKey)) {
    currentPhotoContext.missionSelect.value = pendingMissions[0];
    renderMissionGallery(pendingMissions[0]);
  }
}

async function approveMission(projectId, teamId, missionKey) {
  const missionId = missionKey.split("_")[1];
  const missionSlots = uploadsCache[teamId]?.[missionKey];
  if (!missionSlots) return;
  const missionNumber = Number(missionId);
  const requiredSlots = getRequiredSlotsFromContext(missionKey, teamId);
  const selectedSlots = Array.from(currentPhotoContext?.selectedByMission.get(missionKey) || [])
    .filter((slotId) => missionSlots[slotId]?.url);
  const approvalSlots = selectedSlots.length ? selectedSlots : requiredSlots;
  if (!approvalSlots.length || !approvalSlots.every((slotId) => missionSlots[slotId]?.url)) {
    showHQToast("승인할 슬롯을 선택하거나 모든 필수 슬롯이 업로드되어야 합니다.", "warn", 2800);
    return;
  }

  const updates = {};
  approvalSlots.forEach((slotId) => {
    updates[`uploads_meta/${projectId}/${teamId}/${missionKey}/${slotId}/status`] = "approved";
  });
  const missionConfig = resolveMissionEntry(teamId, missionId);
  const missionStep = getStepConfig(missionConfig, "missionStep");
  const delaySeconds = Number(missionStep.autoAdvanceSeconds) || 0;
  const allApproved = requiredSlots.length > 0
    && requiredSlots.every((slotId) => {
      if (approvalSlots.includes(slotId)) return missionSlots[slotId]?.url;
      return missionSlots[slotId]?.url && missionSlots[slotId]?.status === "approved";
    });

  if (allApproved && delaySeconds > 0) {
    updates[`projects/${projectId}/teams/${teamId}/missions/${missionId}/stepStatus`] = "delay";
    updates[`projects/${projectId}/teams/${teamId}/missions/${missionId}/unlockAt`] = Date.now() + delaySeconds * 1000;
  } else if (allApproved) {
    updates[`projects/${projectId}/teams/${teamId}/missions/${missionId}/stage`] = "done";
    updates[`projects/${projectId}/teams/${teamId}/missions/${missionId}/panel`] = null;
    updates[`projects/${projectId}/teams/${teamId}/missions/${missionId}/stepStatus`] = null;
    updates[`projects/${projectId}/teams/${teamId}/missions/${missionId}/unlockAt`] = null;
    updates[`projects/${projectId}/teams/${teamId}/missions/${missionId}/completedAt`] = Date.now();

    if (Number.isFinite(missionNumber) && missionNumber < missionTotal) {
      const nextMission = String(missionNumber + 1);
      const nextMissionData = latestTeamData[teamId]?.missions?.[nextMission];
      if (!nextMissionData || nextMissionData.stage === "locked") {
        updates[`projects/${projectId}/teams/${teamId}/missions/${nextMission}/stage`] = "code";
        updates[`projects/${projectId}/teams/${teamId}/missions/${nextMission}/panel`] = null;
        updates[`projects/${projectId}/teams/${teamId}/missions/${nextMission}/stepStatus`] = null;
        updates[`projects/${projectId}/teams/${teamId}/missions/${nextMission}/unlockAt`] = null;
        updates[`projects/${projectId}/teams/${teamId}/missions/${nextMission}/completedAt`] = null;
      }
    }
  }

  try {
    await update(ref(db), updates);
    approvalSlots.forEach((slotId) => {
      if (uploadsCache[teamId]?.[missionKey]?.[slotId]) {
        uploadsCache[teamId][missionKey][slotId].status = "approved";
      }
    });
    await appendOpsLog(projectId, "hq_photo_approve", {
      source: "hq",
      teamId,
      teamLabel: getTeamLabel(teamId),
      missionId,
      delaySeconds,
      slots: approvalSlots,
      allApproved,
    });
    await push(ref(db, `chat/${projectId}/${teamId}`), {
      sender: "HQ",
      text: `[본부] 사진 승인 완료 - Mission ${missionId}`,
      createdAt: serverTimestamp(),
    });
    currentPhotoContext?.selectedByMission.get(missionKey)?.clear();
    const remainingForTeam = getPendingPhotoMissionKeys(teamId);
    if (!allApproved && currentPhotoContext?.teamId === teamId) {
      renderMissionGallery(missionKey);
      showHQToast("선택한 슬롯만 승인했습니다. 남은 슬롯을 계속 확인하세요.", "success");
      return;
    }
    if (remainingForTeam.length && currentPhotoContext?.teamId === teamId) {
      currentPhotoContext.missionSelect.value = remainingForTeam[0];
      renderMissionGallery(remainingForTeam[0]);
      showHQToast("사진 승인 완료. 같은 팀의 다음 대기 미션으로 이동합니다.", "success");
      return;
    }
    const nextTeamId = getNextPendingPhotoTeam(projectId, teamId);
    if (nextTeamId) {
      showHQToast("사진 승인 완료. 다음 대기 팀으로 이동합니다.", "success");
      handlePhotoClick(projectId, nextTeamId);
      return;
    }
    showHQToast("사진이 승인되었습니다.", "success");
    closePhotoModal();
  } catch (error) {
    console.error(error);
    showHQToast("승인 중 오류가 발생했습니다.", "error", 3600);
  }
}

async function requestRetry(projectId, teamId, missionKey) {
  if (!currentPhotoContext) return;
  const selected = Array.from(
    currentPhotoContext.selectedByMission.get(missionKey) || []
  );
  if (selected.length === 0) {
    showHQToast("재도전할 사진을 선택하세요.", "warn", 2600);
    return;
  }
  const reason = await requestHQReason(
    "재도전 사유를 입력하세요.",
    "예) 사진이 흐립니다. 인원 전체가 나오게 다시 촬영해 주세요.",
    HQ_RETRY_REASON_TEMPLATES
  );
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
  updates[`projects/${projectId}/teams/${teamId}/missions/${missionId}/stepStatus`] = null;
  updates[`projects/${projectId}/teams/${teamId}/missions/${missionId}/unlockAt`] = null;

  try {
    await update(ref(db), updates);
    selected.forEach((slotId) => {
      if (uploadsCache[teamId]?.[missionKey]?.[slotId]) {
        uploadsCache[teamId][missionKey][slotId].status = "retry";
        uploadsCache[teamId][missionKey][slotId].retryReason = reason;
      }
    });
    await appendOpsLog(projectId, "hq_photo_retry", {
      source: "hq",
      teamId,
      teamLabel: getTeamLabel(teamId),
      missionId,
      slots: selected,
      reason,
    });
    await push(ref(db, `chat/${projectId}/${teamId}`), {
      sender: "HQ",
      text: `[본부] 사진 재도전 요청: ${reason}`,
      createdAt: serverTimestamp(),
    });
    showHQToast("재도전 요청을 전송했습니다.", "success");
    currentPhotoContext.selectedByMission.get(missionKey).clear();
    renderMissionGallery(missionKey);
  } catch (error) {
    console.error(error);
    showHQToast("재도전 요청 중 오류가 발생했습니다.", "error", 3600);
  }
}

function downloadMissionAssets(projectId, teamId, missionKey, slotsFilter = null) {
  const missionSlots = uploadsCache[teamId]?.[missionKey];
  if (!missionSlots) {
    showHQToast("다운로드할 파일이 없습니다.", "warn", 2600);
    return;
  }
  const missionId = missionKey.split("_")[1];
  const teamLabel = getTeamLabel(teamId);
  let hasFile = false;
  Object.entries(missionSlots).forEach(([slotId, slot]) => {
    if (slotsFilter && slotsFilter.length && !slotsFilter.includes(slotId)) {
      return;
    }
    if (!slot?.url) return;
    hasFile = true;
    const fileName = buildDownloadFileName(teamId, teamLabel, missionId, slotId, getSlotLabel(teamId, missionKey, slotId), slot.url, slot.originalName);
    triggerDownload(slot.url, fileName);
  });
  if (!hasFile) {
    showHQToast("다운로드할 파일이 없습니다.", "warn", 2600);
  }
}

function downloadMissionManifest(projectId, teamId, missionKey, slotsFilter = null) {
  const missionSlots = uploadsCache[teamId]?.[missionKey];
  if (!missionSlots) {
    showHQToast("내보낼 파일이 없습니다.", "warn", 2600);
    return;
  }
  const missionId = missionKey.split("_")[1];
  const teamLabel = getTeamLabel(teamId);
  const rows = [
    [
      "project_id",
      "team_id",
      "team_label",
      "mission_id",
      "slot_id",
      "slot_label",
      "status",
      "batch_id",
      "original_name",
      "download_name",
      "storage_path",
      "download_url",
      "uploaded_at",
    ],
  ];
  Object.entries(missionSlots).forEach(([slotId, slot]) => {
    if (slotsFilter && slotsFilter.length && !slotsFilter.includes(slotId)) return;
    if (!slot?.url) return;
    const slotLabel = getSlotLabel(teamId, missionKey, slotId);
    rows.push([
      projectId,
      teamId,
      teamLabel,
      missionId,
      slotId,
      slotLabel,
      slot.status || "pending",
      slot.batchId || "",
      slot.originalName || "",
      buildDownloadFileName(teamId, teamLabel, missionId, slotId, slotLabel, slot.url, slot.originalName),
      slot.storagePath || "",
      slot.url || "",
      slot.uploadedAt ? formatDateTime(slot.uploadedAt) : "",
    ]);
  });
  if (rows.length <= 1) {
    showHQToast("내보낼 파일이 없습니다.", "warn", 2600);
    return;
  }
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const fileName = `${projectId}_${teamId}_M${missionId}_manifest.csv`;
  triggerTextDownload(csv, fileName, "text/csv;charset=utf-8;");
  showHQToast("매니페스트 CSV를 저장했습니다.", "success");
}

function downloadMissionShellScript(projectId, teamId, missionKey, slotsFilter = null) {
  const missionSlots = uploadsCache[teamId]?.[missionKey];
  if (!missionSlots) {
    showHQToast("내보낼 파일이 없습니다.", "warn", 2600);
    return;
  }
  const missionId = missionKey.split("_")[1];
  const teamLabel = getTeamLabel(teamId);
  const rows = [];
  Object.entries(missionSlots).forEach(([slotId, slot]) => {
    if (slotsFilter && slotsFilter.length && !slotsFilter.includes(slotId)) return;
    if (!slot?.url) return;
    const slotLabel = getSlotLabel(teamId, missionKey, slotId);
    rows.push([
      projectId,
      projectMeta.name || projectId,
      teamId,
      teamLabel,
      missionId,
      missionKey,
      "",
      "",
      slotId,
      slotLabel,
      slot.status || "pending",
      slot.batchId || "",
      slot.originalName || "",
      buildDownloadFileName(teamId, teamLabel, missionId, slotId, slotLabel, slot.url, slot.originalName),
      slot.storagePath || "",
      slot.url || "",
      slot.uploadedAt ? formatDateTime(slot.uploadedAt) : "",
    ]);
  });
  if (!rows.length) {
    showHQToast("내보낼 파일이 없습니다.", "warn", 2600);
    return;
  }
  const script = buildShellScriptFromRows(rows, {
    rootDir: `${slugifyLabel(teamLabel) || teamId}_mission_${missionId}`,
  });
  triggerTextDownload(script, `${projectId}_${teamId}_${missionKey}_download.sh`, "text/x-shellscript;charset=utf-8;");
  showHQToast("미션 다운로드 스크립트를 저장했습니다.", "success");
}

function downloadProjectPhotoManifest(projectId) {
  const rows = buildProjectPhotoRows(projectId);
  if (rows.length <= 1) {
    showHQToast("내보낼 사진 데이터가 없습니다.", "warn", 2600);
    return;
  }

  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const fileName = `${projectId}_photo_manifest_all.csv`;
  triggerTextDownload(csv, fileName, "text/csv;charset=utf-8;");
  showHQToast("프로젝트 전체 사진 CSV를 저장했습니다.", "success");
}

function downloadProjectPhotoSlidesCsv(projectId) {
  const rows = buildProjectPhotoRows(projectId);
  if (rows.length <= 1) {
    showHQToast("내보낼 사진 데이터가 없습니다.", "warn", 2600);
    return;
  }
  const slideRows = [[
    "slot_no",
    "slot_label",
    "team_id",
    "team_label",
    "mission_id",
    "route_key",
    "download_name",
    "download_url",
    "batch_id",
    "uploaded_at",
  ]];
  rows.slice(1)
    .sort((a, b) => {
      const slotA = extractSlotSequence(a[8], a[9]);
      const slotB = extractSlotSequence(b[8], b[9]);
      if (slotA !== slotB) return slotA - slotB;
      return teamNumber(a[2]) - teamNumber(b[2]);
    })
    .forEach((row) => {
      slideRows.push([
        extractSlotSequence(row[8], row[9]),
        row[9],
        row[2],
        row[3],
        row[4],
        row[6],
        row[13],
        row[15],
        row[11],
        row[16],
      ]);
    });
  const csv = slideRows.map((row) => row.map(csvEscape).join(",")).join("\n");
  triggerTextDownload(csv, `${projectId}_photo_slides.csv`, "text/csv;charset=utf-8;");
  showHQToast("슬라이드 제작용 CSV를 저장했습니다.", "success");
}

function buildProjectPhotoRows(projectId) {
  const teamIds = new Set([
    ...Object.keys(latestTeamData || {}),
    ...Object.keys(uploadsCache || {}),
  ]);
  const rows = [[
    "project_id",
    "project_name",
    "team_id",
    "team_label",
    "mission_id",
    "mission_key",
    "route_key",
    "route_label",
    "slot_id",
    "slot_label",
    "status",
    "batch_id",
    "original_name",
    "download_name",
    "storage_path",
    "download_url",
    "uploaded_at",
  ]];
  Array.from(teamIds)
    .sort((a, b) => teamNumber(a) - teamNumber(b))
    .forEach((teamId) => {
      const teamUploads = uploadsCache[teamId] || {};
      Object.keys(teamUploads)
        .filter((missionKey) => missionKey.startsWith("mission_"))
        .sort((a, b) => Number(a.split("_")[1]) - Number(b.split("_")[1]))
        .forEach((missionKey) => {
          const missionId = missionKey.split("_")[1];
          const missionEntry = resolveMissionEntry(teamId, missionId);
          const routeKey = String(missionEntry?.routeKey || "").trim();
          const routeLabel = String(missionEntry?.routeLabel || "").trim();
          const missionSlots = teamUploads[missionKey] || {};
          const preferredOrder = getRequiredSlots(teamId, missionKey);
          const orderedSlotIds = preferredOrder.length ? preferredOrder : Object.keys(missionSlots).sort();
          orderedSlotIds.forEach((slotId) => {
            const slot = missionSlots[slotId];
            if (!slot?.url) return;
            const teamLabel = getTeamLabel(teamId);
            const slotLabel = getSlotLabel(teamId, missionKey, slotId);
            rows.push([
              projectId,
              projectMeta.name || projectId,
              teamId,
              teamLabel,
              missionId,
              missionKey,
              routeKey,
              routeLabel,
              slotId,
              slotLabel,
              slot.status || "pending",
              slot.batchId || "",
              slot.originalName || "",
              buildDownloadFileName(teamId, teamLabel, missionId, slotId, slotLabel, slot.url, slot.originalName),
              slot.storagePath || "",
              slot.url || "",
              slot.uploadedAt ? formatDateTime(slot.uploadedAt) : "",
            ]);
          });
        });
    });
  return rows;
}

function downloadProjectPhotoScript(projectId) {
  const rows = buildProjectPhotoRows(projectId);
  if (rows.length <= 1) {
    showHQToast("내보낼 사진 데이터가 없습니다.", "warn", 2600);
    return;
  }
  const script = buildShellScriptFromRows(rows.slice(1), {
    rootDir: `${slugifyLabel(projectMeta.name || projectId) || projectId}_photo_downloads`,
  });
  triggerTextDownload(script, `${projectId}_photo_download_all.sh`, "text/x-shellscript;charset=utf-8;");
  showHQToast("프로젝트 전체 다운로드 스크립트를 저장했습니다.", "success");
}

function downloadProjectEventBundle(projectId) {
  downloadProjectPhotoManifest(projectId);
  downloadProjectPhotoSlidesCsv(projectId);
  downloadProjectPhotoScript(projectId);
  showHQToast("종료 패키지 파일을 순서대로 저장했습니다.", "success", 3400);
}

function triggerDownload(url, fileName) {
  downloadFile(url, fileName);
}

function triggerTextDownload(content, fileName, mimeType = "text/plain;charset=utf-8;") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function shellSafe(value = "") {
  return String(value ?? "").replace(/'/g, `'\"'\"'`);
}

function buildShellScriptFromRows(rows = [], options = {}) {
  const rootDir = String(options.rootDir || "photo_downloads").trim() || "photo_downloads";
  const lines = [
    "#!/bin/zsh",
    "set -euo pipefail",
    "",
    `ROOT_DIR='${shellSafe(rootDir)}'`,
    "mkdir -p \"$ROOT_DIR\"",
    "",
  ];
  rows.forEach((row) => {
    const [
      projectId,
      projectName,
      teamId,
      teamLabel,
      missionId,
      missionKey,
      routeKey,
      routeLabel,
      slotId,
      slotLabel,
      status,
      batchId,
      originalName,
      downloadName,
      storagePath,
      downloadUrl,
    ] = row;
    const projectDir = slugifyLabel(projectName || projectId) || projectId;
    const teamDir = slugifyLabel(teamLabel || teamId) || teamId;
    const missionDir = `M${missionId}_${slugifyLabel(routeLabel || routeKey || missionKey || "mission") || `mission_${missionId}`}`;
    const slotDir = `${slotId}_${slugifyLabel(slotLabel || slotId) || slotId}`;
    lines.push(`mkdir -p "$ROOT_DIR/${shellSafe(projectDir)}/${shellSafe(teamDir)}/${shellSafe(missionDir)}/${shellSafe(slotDir)}"`);
    lines.push(`curl -L --fail --output "$ROOT_DIR/${shellSafe(projectDir)}/${shellSafe(teamDir)}/${shellSafe(missionDir)}/${shellSafe(slotDir)}/${shellSafe(downloadName || originalName || `${teamId}_${missionId}_${slotId}`)}" '${shellSafe(downloadUrl)}'`);
    lines.push("");
  });
  return `${lines.join("\n")}\n`;
}

function csvEscape(value = "") {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function clampMissionTotal(value) {
  const num = Number.isFinite(value) ? value : 9;
  return Math.max(1, Math.min(20, num));
}

function syncProjectCountdown(projectId, meta = {}) {
  if (!projectId || !meta.endAt) return;
  const now = Date.now();
  const duration = Math.max(60, Math.floor((meta.endAt - now) / 1000));
  if (!Number.isFinite(duration) || duration <= 0) return;
  const signature = `${meta.endAt}-${duration}`;
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

function subscribeDriveBackupStatus(projectId, container) {
  if (!container || !projectId) return;
  onValue(ref(db, `drive_backups/${projectId}`), (snapshot) => {
    latestDriveBackups = snapshot.val() || {};
    renderDriveBackupStatus(container);
  });
  onValue(ref(db, "drive_backups_errors"), (snapshot) => {
    const raw = snapshot.val() || {};
    latestDriveBackupErrors = Object.fromEntries(
      Object.entries(raw).filter(([, value]) => value?.projectId === projectId)
    );
    renderDriveBackupStatus(container);
  });
}

function renderDriveBackupStatus(container) {
  if (!container) return;
  const successCount = Object.values(latestDriveBackups || {}).reduce((teamSum, missions) => (
    teamSum + Object.values(missions || {}).reduce((missionSum, slots) => missionSum + Object.keys(slots || {}).length, 0)
  ), 0);
  const errors = Object.values(latestDriveBackupErrors || {})
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, 5);
  container.innerHTML = [
    `<div class="hq-drive-status__item"><strong>성공 백업</strong>${successCount}건이 Drive 백업 로그에 기록되어 있습니다.</div>`,
    `<div class="hq-drive-status__item${errors.length ? " hq-drive-status__item--error" : ""}"><strong>최근 실패</strong>${
      errors.length
        ? errors.map((item) => `${item.teamId || "-"} / M${item.missionId || "-"} / ${item.error || "오류"}`).join("<br>")
        : "최근 Drive 백업 실패가 없습니다."
    }</div>`,
  ].join("");
}

async function appendOpsLog(projectId, action, details = {}) {
  if (!projectId) return;
  try {
    await push(ref(db, `ops_logs/${projectId}`), {
      action,
      details,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn(`Ops log skipped: ${action}`, error);
  }
}

function subscribeHQOpsTimeline(projectId, container) {
  if (typeof opsTimelineUnsubscribe === "function") {
    opsTimelineUnsubscribe();
    opsTimelineUnsubscribe = null;
  }
  if (!projectId || !container) {
    latestHQOpsTimelineItems = [];
    renderHQOpsTimeline(container, []);
    return;
  }
  opsTimelineUnsubscribe = onValue(ref(db, `ops_logs/${projectId}`), (snapshot) => {
    const raw = snapshot.val() || {};
    latestHQOpsTimelineItems = Object.entries(raw)
      .map(([id, value]) => ({ id, ...value }))
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
      .slice(0, 10);
    renderHQOpsTimeline(container, latestHQOpsTimelineItems);
  });
}

function renderHQOpsTimeline(container, items = []) {
  if (!container) return;
  const filteredItems = filterHQOpsTimelineItems(items, hqOpsTimelineFilter);
  container.innerHTML = filteredItems.length
    ? filteredItems
        .map((item) => {
          const details = item.details || {};
          return `
            <article class="hq-ops-timeline__item">
              <div class="hq-ops-timeline__meta">
                <span>${getHQActionLabel(item.action || "")}</span>
                <span>${item.createdAt ? formatHQDateTime(item.createdAt) : "-"}</span>
              </div>
              <div class="hq-ops-timeline__title">${details.teamLabel || details.teamId || details.target || "운영 이벤트"}</div>
              <div class="hq-ops-timeline__summary">${getHQActionSummary(item.action || "", details)}</div>
            </article>
          `;
        })
        .join("")
    : `<div class="hq-ops-timeline__empty">${
        items.length ? "현재 필터에 맞는 운영 로그가 없습니다." : "운영 로그가 아직 없습니다."
      }</div>`;
}

function getHQActionLabel(action = "") {
  const labels = {
    announcement_broadcast: "전체 공지",
    announcement_team: "팀 공지",
    hq_step_approve: "HQ 단계 승인",
    hq_photo_approve: "사진 승인",
    hq_photo_retry: "재도전 요청",
    hq_team_reset: "팀 리셋",
    mission_bypass: "특별 코드 통과",
    project_finish: "프로젝트 종료",
  };
  return labels[action] || action;
}

function getHQActionSummary(action = "", details = {}) {
  switch (action) {
    case "announcement_broadcast":
    case "announcement_team":
      return details.text || "";
    case "hq_step_approve":
      return `M${details.missionId || ""} · ${details.step === "codeStep" ? "코드" : "미션"} 승인`;
    case "hq_photo_approve":
      return `M${details.missionId || ""}${details.delaySeconds ? ` · ${details.delaySeconds}초 후 이동` : ""}`;
    case "hq_photo_retry":
      return `M${details.missionId || ""} · ${details.reason || ""}`;
    case "mission_bypass":
      return `M${details.missionId || ""} · ${details.step === "codeStep" ? "코드" : "미션"}`;
    default:
      return details.projectName || details.teamId || "";
  }
}

function formatHQDateTime(timestamp) {
  return new Date(timestamp).toLocaleString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
