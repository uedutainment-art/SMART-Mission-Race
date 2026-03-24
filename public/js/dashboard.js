import { initMissionModule } from "./mission_module.js";
import { initRankModule } from "./rank_module.js";
import { initMyRankModule } from "./my_rank_module.js";
import { initTimeModule } from "./time_module.js";
import { initChatModule } from "./chat_module.js";
import { requireTeamSession } from "./session_module.js";

document.addEventListener("DOMContentLoaded", () => {
  const session = requireTeamSession();
  if (!session) return;
  document.querySelectorAll("#currentActionCard, .current-action-card").forEach((element) => element.remove());
  document.body.classList.add("dashboard-page");
  const {
    teamId,
    teamName,
    teamNumber,
    teamTotal,
    projectId,
    projectName,
    projectLogo,
    projectFinishNotice,
    projectEndAt,
    hideTeamChat,
    missionTotal: sessionMissionTotal,
  } = session;
  const teamLabel = buildTeamLabel(teamNumber, teamName);
  const missionTotal = sessionMissionTotal || 9;

  const titleEl = document.getElementById("eventName");
  if (titleEl) {
    titleEl.textContent = projectName || "SMART Mission Race";
  }
  const logoImg = document.getElementById("missionLogo");
  if (logoImg) {
    if (projectLogo) {
      logoImg.src = projectLogo;
      logoImg.classList.remove("hidden");
    } else {
      logoImg.removeAttribute("src");
      logoImg.classList.add("hidden");
    }
  }
  const taglineEl = document.getElementById("tagline");
  if (taglineEl) {
    taglineEl.textContent = "SMART Mission Race | Powered by Uedutainment";
  }

  const badge = document.getElementById("teamBadge");
  if (badge) badge.textContent = teamLabel;

  const currentActionTitle = document.getElementById("currentActionTitle");
  const currentActionDetail = document.getElementById("currentActionDetail");
  const currentActionButton = document.getElementById("currentActionButton");
  const currentActionCard = document.getElementById("currentActionCard");
  const currentActionDone = document.getElementById("currentActionDone");
  const chatContainer = document.getElementById("chatModule");
  const progressSummary = document.getElementById("teamProgressSummary");
  const hasVisibleChat = () => Boolean(chatContainer && !chatContainer.hidden && !chatContainer.classList.contains("hidden"));
  const getStatusButtonLabel = () => (hasVisibleChat() ? "채팅 확인" : "현재 상태 확인");
  let currentMissionToOpen = null;

  if (currentActionCard) {
    currentActionCard.classList.add("hidden");
    currentActionCard.hidden = true;
  }
  if (progressSummary) {
    progressSummary.classList.add("hidden");
    progressSummary.hidden = true;
  }
  if (chatContainer) {
    chatContainer.classList.add("hidden");
    chatContainer.hidden = true;
  }

  currentActionButton?.addEventListener("click", () => {
    if (Number.isFinite(currentMissionToOpen) && currentMissionToOpen > 0) {
      document.querySelector(`.mission[data-mission="${currentMissionToOpen}"]`)?.click();
      return;
    }
    if (hasVisibleChat()) {
      chatContainer?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  initMissionModule({
    projectId,
    missionAreaId: "missionArea",
    totalMissions: missionTotal,
    teamId,
    onStateChange: (summary) => {
      const summaryEl = document.getElementById("teamProgressSummary");
      if (!summaryEl || !summary) return;
      currentMissionToOpen = summary.currentMission || null;
      if (summary.finished) {
        const finishNotice = projectFinishNotice || "채팅과 본부 안내를 확인하고 마지막 안내를 기다리세요.";
        summaryEl.textContent = "모든 미션을 완료했습니다. 본부 안내를 확인하세요.";
        updateCurrentAction({
          cardEl: currentActionCard,
          titleEl: currentActionTitle,
          detailEl: currentActionDetail,
          doneEl: currentActionDone,
          buttonEl: currentActionButton,
          title: "모든 미션을 마쳤습니다.",
          detail: finishNotice,
          showDone: true,
          buttonLabel: getStatusButtonLabel(),
        });
        return;
      }
      if (!summary.currentMission) {
        summaryEl.textContent = "현재 진행 상태를 확인하는 중입니다.";
        updateCurrentAction({
          cardEl: currentActionCard,
          titleEl: currentActionTitle,
          detailEl: currentActionDetail,
          doneEl: currentActionDone,
          buttonEl: currentActionButton,
          title: "현재 진행 상태를 확인하고 있습니다.",
          detail: "잠시만 기다리면 지금 해야 할 일을 안내합니다.",
          buttonLabel: getStatusButtonLabel(),
        });
        return;
      }
      if (summary.stepStatus === "delay") {
        const targetLabel = summary.stage === "mission" ? "다음 미션" : "미션 단계";
        summaryEl.textContent = `${summary.advanceRemaining}초 후 ${targetLabel}가 열립니다. 남은 미션 ${summary.remaining}개`;
        updateCurrentAction({
          cardEl: currentActionCard,
          titleEl: currentActionTitle,
          detailEl: currentActionDetail,
          doneEl: currentActionDone,
          buttonEl: currentActionButton,
          title: `${summary.advanceRemaining}초만 기다리면 다음 단계가 열립니다.`,
          detail: summary.stage === "mission" ? "현재 미션이 정리되면 다음 미션으로 자동 이동합니다." : "코드 확인이 끝나면 바로 미션 단계로 넘어갑니다.",
          buttonLabel: "현재 미션 보기",
        });
        return;
      }
      if (summary.stepStatus === "awaiting_hq" && summary.stepMode === "hq") {
        summaryEl.textContent = `MISSION ${summary.currentMission}은 본부 확인 중입니다. 남은 미션 ${summary.remaining}개`;
        updateCurrentAction({
          cardEl: currentActionCard,
          titleEl: currentActionTitle,
          detailEl: currentActionDetail,
          doneEl: currentActionDone,
          buttonEl: currentActionButton,
          title: "본부에서 확인하고 있습니다.",
          detail: "추가 입력은 필요 없습니다. 채팅 답변이나 다음 안내를 기다리세요.",
          buttonLabel: getStatusButtonLabel(),
        });
        return;
      }
      if (summary.isPhotoMission && summary.stage === "mission") {
        const photoTextMap = {
          approved: "사진 승인 완료",
          retry: "다시 올려야 할 사진이 있습니다",
          pending: "사진 제출 완료, 본부 확인 중",
          partial: "필요한 사진이 아직 남아 있습니다",
          empty: "사진 업로드가 필요합니다",
        };
        const photoText = photoTextMap[summary.photoStatus] || "사진 진행중";
        summaryEl.textContent = `MISSION ${summary.currentMission} · ${photoText} · 남은 미션 ${summary.remaining}개`;
        const photoActionMap = {
          approved: {
            title: "사진 승인이 끝났습니다.",
            detail: "현재 미션을 눌러 다음 단계가 열렸는지 확인하세요.",
            buttonLabel: "현재 미션 보기",
          },
          retry: {
            title: "다시 찍어야 하는 사진이 있습니다.",
            detail: "표시된 사진만 다시 올리면 됩니다. 나머지는 다시 올릴 필요가 없습니다.",
            buttonLabel: "현재 미션 보기",
          },
          pending: {
            title: "사진을 모두 제출했습니다.",
            detail: "본부가 확인 중입니다. 승인되면 다음 단계로 이어집니다.",
            buttonLabel: getStatusButtonLabel(),
          },
          partial: {
            title: "사진을 더 올려야 합니다.",
            detail: "빠진 컷만 채우면 됩니다. 현재 미션을 열어 필요한 사진을 확인하세요.",
            buttonLabel: "현재 미션 보기",
          },
          empty: {
            title: "사진 미션을 시작하세요.",
            detail: "현재 미션을 열고 필요한 사진을 올리세요.",
            buttonLabel: "현재 미션 보기",
          },
        };
        updateCurrentAction({
          cardEl: currentActionCard,
          titleEl: currentActionTitle,
          detailEl: currentActionDetail,
          doneEl: currentActionDone,
          buttonEl: currentActionButton,
          ...(photoActionMap[summary.photoStatus] || {
            title: "사진 미션을 진행하세요.",
            detail: "현재 미션을 열어 사진 안내를 확인하세요.",
            buttonLabel: "현재 미션 보기",
          }),
        });
        return;
      }
      const stageText = summary.stage === "mission" ? "현재 미션을 진행하세요." : "현재 코드 정답을 입력하세요.";
      summaryEl.textContent = `MISSION ${summary.currentMission} 진행 중 · 남은 미션 ${summary.remaining}개`;
      updateCurrentAction({
        cardEl: currentActionCard,
        titleEl: currentActionTitle,
        detailEl: currentActionDetail,
        doneEl: currentActionDone,
        buttonEl: currentActionButton,
        title: stageText,
        detail: summary.stage === "mission" ? "현재 미션을 눌러 안내를 확인하고 완료하세요." : "현재 미션을 눌러 코드 이미지를 보고 정답을 입력하세요.",
        buttonLabel: "현재 미션 보기",
      });
    },
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

  const useSharedCountdown = Boolean(projectEndAt && projectId);
  const countdownPath = useSharedCountdown ? `projects/${projectId}/countdown` : null;
  const defaultDuration = useSharedCountdown
    ? Math.max(60, Math.floor((projectEndAt - Date.now()) / 1000))
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
    timeOptions.startTime = null;
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

  if (!hideTeamChat && false) {
    initChatModule({
      containerId: "chatModule",
      projectId,
      teamId,
      teamLabel,
    });
  }
});

function updateCurrentAction({ cardEl, titleEl, detailEl, doneEl, buttonEl, title, detail, buttonLabel, showDone = false }) {
  if (cardEl) return;
  if (titleEl) titleEl.textContent = title || "";
  if (detailEl) detailEl.textContent = detail || "";
  if (doneEl) {
    doneEl.hidden = !showDone;
    doneEl.classList.toggle("hidden", !showDone);
  }
  if (buttonEl) buttonEl.textContent = buttonLabel || "현재 미션 보기";
}

function buildTeamLabel(number, name) {
  if (number) {
    return name ? `${number}팀 ${name}` : `${number}팀`;
  }
  return name || "TEAM";
}
