import { initMissionModule } from "./mission_module.js";
import { initRankModule } from "./rank_module.js";
import { initMyRankModule } from "./my_rank_module.js";
import { initTimeModule } from "./time_module.js";
import { initChatModule } from "./chat_module.js";
import { requireTeamSession } from "./session_module.js";

document.addEventListener("DOMContentLoaded", () => {
  const session = requireTeamSession();
  if (!session) return;
  document.body.classList.add("dashboard-page");
  const {
    teamId,
    teamName,
    teamNickname,
    teamNumber,
    teamTotal,
    projectId,
    projectName,
    projectSubtitle = "",
    projectLogo,
    projectStartAt = null,
    projectEndAt = null,
    projectEducationAt = null,
    missionTotal: sessionMissionTotal,
  } = session;
  const teamLabel = buildTeamLabel(teamName, teamNickname, teamNumber);
  const missionTotal = sessionMissionTotal || 9;
  const missionAreaEl = document.getElementById("missionArea");

  const titleEl = document.getElementById("eventName");
  if (titleEl) {
    titleEl.textContent = projectName || "SMART Mission Race";
  }
  const subtitleEl = document.getElementById("eventSubtitle");
  if (subtitleEl) {
    subtitleEl.textContent = projectSubtitle || "";
    subtitleEl.style.visibility = projectSubtitle ? "visible" : "hidden";
  }
  const logoImg = document.getElementById("missionLogo");
  if (logoImg && projectLogo) {
    logoImg.src = projectLogo;
  }
  const taglineEl = document.getElementById("tagline");
  if (taglineEl) {
    taglineEl.textContent = "SMART Mission Race | Powered by Uedutainment";
  }

  const badge = document.getElementById("teamBadge");
  if (badge) badge.textContent = teamLabel;

  initMissionModule({
    projectId,
    missionAreaId: "missionArea",
    totalMissions: missionTotal,
    teamId,
  });

  const myRankDisplay = initMyRankModule({
    elementId: "rankNow",
    totalTeams: teamTotal || 10,
    initialRank: 3,
  });

  initRankModule({
    listId: "rankList",
    highlightTeam: teamId,
    projectId,
    missionTotal,
    includeNickname: true,
    onChange: (sorted) => {
      if (!Array.isArray(sorted)) return;
      const myIndex = sorted.findIndex((team) => team.id === teamId);
      if (myIndex >= 0) {
        myRankDisplay.update(myIndex + 1, sorted.length || teamTotal || 10);
      }
    },
  });

  const countdownTarget = projectEducationAt || projectEndAt || null;
  const useSharedCountdown = Boolean(countdownTarget && projectId);
  const countdownPath = useSharedCountdown ? `projects/${projectId}/countdown` : null;
  const now = Date.now();
  const derivedDuration = countdownTarget
    ? Math.max(60, Math.floor((countdownTarget - now) / 1000))
    : 660;

  const timeOptions = {
    noteId: "timerNote",
    warningThreshold: 600,
    warningMessage: "⚠️ 10분 미만! 서두르세요.",
    finishedMessage: "⏱️ 시간이 종료되었습니다. 더 이상 조작할 수 없습니다.",
    formatCurrentTime: (date) =>
      date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }),
  };

  if (useSharedCountdown) {
    timeOptions.startTime = now;
    timeOptions.endTime = countdownTarget;
    timeOptions.sharedCountdownPath = countdownPath;
    timeOptions.autoCreate = false;
    timeOptions.countdownSeconds = null;
  } else {
    timeOptions.startTime = null;
    timeOptions.endTime = countdownTarget;
    timeOptions.sharedCountdownPath = null;
    timeOptions.autoCreate = false;
    timeOptions.countdownSeconds = derivedDuration;
  }

  const chatModule = initChatModule({
    containerId: "chatModule",
    projectId,
    teamId,
    teamLabel,
  });

  function lockDashboard() {
    if (document.body.classList.contains("dashboard-locked")) return;
    document.body.classList.add("dashboard-locked");
    missionAreaEl?.classList.add("locked-grid");
    chatModule?.disable?.();
    const missionPanel = document.getElementById("mission-panel");
    if (missionPanel) {
      missionPanel.style.display = "none";
    }
    showLockBanner();
  }

  function showLockBanner() {
    if (document.getElementById("dashboardLockBanner")) return;
    const banner = document.createElement("div");
    banner.id = "dashboardLockBanner";
    banner.textContent = "⏱️ 교육 시간이 종료되었습니다. 더 이상 조작할 수 없습니다.";
    document.body.appendChild(banner);
  }

  timeOptions.onFinished = lockDashboard;

  initTimeModule("currentTime", "remainTime", timeOptions);

});

function buildTeamLabel(officialName, nickname, number) {
  const baseName = ensureTeamLabel(officialName, number);
  if (nickname) {
    return `${baseName} ${nickname}`.trim();
  }
  return baseName;
}

function ensureTeamLabel(label, number) {
  let baseName = (label || "").trim();
  if (!baseName && Number.isFinite(number)) {
    baseName = `${number}팀`;
  }
  const digitsOnly = baseName.replace(/\s+/g, "");
  if (/^\d+$/.test(digitsOnly)) {
    return `${digitsOnly}팀`;
  }
  if (/^\d+팀$/.test(digitsOnly)) {
    return digitsOnly;
  }
  return baseName || (Number.isFinite(number) ? `${number}팀` : "TEAM");
}
