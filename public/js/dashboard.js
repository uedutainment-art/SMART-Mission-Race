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
    teamNumber,
    teamTotal,
    projectId,
    projectName,
    projectLogo,
    projectStartAt,
    projectEndAt,
    missionTotal: sessionMissionTotal,
  } = session;
  const teamLabel = buildTeamLabel(teamNumber, teamName);
  const missionTotal = sessionMissionTotal || 9;

  const titleEl = document.getElementById("eventName");
  if (titleEl) {
    titleEl.textContent = projectName || "SMART Mission Race";
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
    onChange: (sorted) => {
      if (!Array.isArray(sorted)) return;
      const myIndex = sorted.findIndex((team) => team.id === teamId);
      if (myIndex >= 0) {
        myRankDisplay.update(myIndex + 1, sorted.length || teamTotal || 10);
      }
    },
  });

  const useSharedCountdown = Boolean(projectStartAt && projectEndAt && projectId);
  const countdownPath = useSharedCountdown ? `projects/${projectId}/countdown` : null;
  const defaultDuration = useSharedCountdown
    ? Math.max(60, Math.floor((projectEndAt - projectStartAt) / 1000))
    : 660;

  const timeOptions = {
    noteId: "timerNote",
    warningThreshold: 600,
    warningMessage: "⚠️ 10분 미만! 서두르세요.",
    finishedMessage: "⏱️ 시간이 종료되었습니다.",
    formatCurrentTime: (date) =>
      date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }),
  };

  if (useSharedCountdown) {
    timeOptions.startTime = projectStartAt;
    timeOptions.endTime = projectEndAt;
    timeOptions.sharedCountdownPath = countdownPath;
    timeOptions.autoCreate = false;
    timeOptions.countdownSeconds = null;
  } else {
    timeOptions.startTime = null;
    timeOptions.endTime = null;
    timeOptions.sharedCountdownPath = null;
    timeOptions.autoCreate = false;
    timeOptions.countdownSeconds = defaultDuration;
  }

  initTimeModule("currentTime", "remainTime", timeOptions);

  initChatModule({
    containerId: "chatModule",
    projectId,
    teamId,
    teamLabel,
  });
});

function buildTeamLabel(number, name) {
  if (number) {
    return name ? `${number}팀 ${name}` : `${number}팀`;
  }
  return name || "TEAM";
}
