const DEFAULT_TOTAL_MISSIONS = 9;

function stageClassName(stage) {
  switch (stage) {
    case "done":
      return "hq-mission--done";
    case "mission":
      return "hq-mission--mission";
    case "code":
      return "hq-mission--code";
    default:
      return "hq-mission--locked";
  }
}

function bubbleMarkup(stage, panel) {
  const bubbles = {
    code: ["hq-bubble", "bubble-code"],
    mission: ["hq-bubble", "bubble-mission"],
  };

  if (stage === "done") {
    bubbles.code.push("done");
    bubbles.mission.push("done");
  } else if (panel === "code") {
    bubbles.code.push("active");
  } else if (panel === "mission") {
    bubbles.mission.push("active");
  }

  return `
    <div class="hq-mission-bubbles">
      <span class="${bubbles.code.join(" ")}">C</span>
      <span class="${bubbles.mission.join(" ")}">M</span>
    </div>
  `;
}

function formatDelayLabel(unlockAt) {
  const target = Number(unlockAt) || 0;
  if (!target) return "자동 이동";
  const remaining = Math.max(0, Math.ceil((target - Date.now()) / 1000));
  return `${remaining}초`;
}

export function initHQBoardModule({ containerId = "hqBoard", teams = [], onChatOpen } = {}) {
  const container = document.getElementById(containerId);
  if (!container) {
    return {
      update: () => {},
      setPhotoStatus: () => {},
      setChatAlert: () => {},
      setChatHandler: () => {},
    };
  }

  const state = {
    teams: Array.isArray(teams) ? [...teams] : [],
    chatUnread: {},
    chatHandler: onChatOpen,
    cachedMarkup: "",
  };

  function render(list = state.teams) {
    container.classList.toggle("hq-board--dense", list.length >= 20);
    container.classList.toggle("hq-board--compact", list.length >= 28);
    const fragments = [];

    list.forEach((team, index) => {
      const total = team.missionTotal ?? DEFAULT_TOTAL_MISSIONS;
      const missions = team.missions ?? {};
      const completed = team.missionsCompleted ?? 0;
      const number = team.number ?? index + 1;
      const alias = team.alias || team.label || team.name || "";
      const displayName = alias ? `${number}팀 ${alias}` : `${number}팀`;
      const stateBadges = [];
      if (team.hqPending) {
        stateBadges.push(`
          <span class="team-state-badge team-state-badge--hq">
            HQ · M${team.hqPending.missionNumber} ${team.hqPending.stepLabel}
          </span>
        `);
      }
      if (team.delayPending) {
        stateBadges.push(`
          <span class="team-state-badge team-state-badge--delay">
            이동 · M${team.delayPending.missionNumber} ${formatDelayLabel(team.delayPending.unlockAt)}
          </span>
        `);
      }
      if (team.currentStage === "code" && team.currentCodeNumber) {
        stateBadges.push(`
          <span class="team-state-badge team-state-badge--code">
            코드 ${team.currentCodeNumber}${team.currentCodeLabel ? ` · ${team.currentCodeLabel}` : ""}
          </span>
        `);
      } else if (team.currentRouteKey) {
        stateBadges.push(`
          <span class="team-state-badge team-state-badge--route">
            공통 ${team.currentRouteKey}${team.currentRouteLabel && team.currentRouteLabel !== team.currentRouteKey ? ` · ${team.currentRouteLabel}` : ""}
          </span>
        `);
      }

      state.chatUnread[team.id] = state.chatUnread[team.id] ?? 0;
      const tiles = [];
      for (let i = 1; i <= total; i++) {
        const missionData = missions[i] || {};
        const stage = missionData.stage || (i === 1 ? "code" : "locked");
        const panel = missionData.panel || null;
        tiles.push(`
          <div class="hq-mission ${stageClassName(stage)}">
            ${bubbleMarkup(stage, panel)}
            <div class="hq-mission-number">${i}</div>
          </div>
        `);
      }

      fragments.push(`
        <div class="team-box" data-team-id="${team.id}">
          <div class="team-left">
            <div class="team-name">${displayName}</div>
            ${stateBadges.length ? `<div class="team-state-badges">${stateBadges.join("")}</div>` : ""}
            <div class="progress-info">${completed}/${total}</div>
            <div class="team-actions">
              <button class="chat-alert-btn${state.chatUnread[team.id] > 0 ? " alert" : ""}" data-team-id="${team.id}">
                ${state.chatUnread[team.id] > 0 ? `Chat (${state.chatUnread[team.id]})` : "Chat"}
              </button>
            </div>
          </div>
          <div class="hq-mission-grid">
            ${tiles.join("")}
          </div>
        </div>
      `);
    });

    const markup = fragments.join("");
    if (state.cachedMarkup === markup) return;
    state.cachedMarkup = markup;
    container.innerHTML = markup;

    container.querySelectorAll(".chat-alert-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const teamId = button.dataset.teamId;
        state.chatUnread[teamId] = 0;
        button.classList.remove("alert");
        button.textContent = "Chat";
        if (typeof state.chatHandler === "function") {
          state.chatHandler(teamId);
        }
      });
    });
  }

  render();

  return {
    update(nextTeams = []) {
      state.teams = Array.isArray(nextTeams) ? [...nextTeams] : [];
      render();
    },
    setChatAlert(teamId, unreadCount = 0) {
      const safeCount = Math.max(0, unreadCount | 0);
      state.chatUnread[teamId] = safeCount;
      const button = container.querySelector(`.chat-alert-btn[data-team-id="${teamId}"]`);
      if (button) {
        if (safeCount > 0) {
          button.classList.add("alert");
          button.textContent = `Chat (${safeCount})`;
        } else {
          button.classList.remove("alert");
          button.textContent = "Chat";
        }
      }
    },
    setChatHandler(handler) {
      state.chatHandler = handler;
    },
  };
}
