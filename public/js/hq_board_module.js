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

function photoStatusLabel(status = "default") {
  switch (status) {
    case "new":
      return { text: "Photo", className: "photo-status new" };
    case "done":
      return { text: "Photo ✓", className: "photo-status done" };
    default:
      return { text: "Photo", className: "photo-status" };
  }
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
    photoStatus: {},
    chatHandler: onChatOpen,
    photoHandler: null,
    cachedMarkup: "",
  };

  function render(list = state.teams) {
    const fragments = [];

    list.forEach((team, index) => {
      const total = team.missionTotal ?? DEFAULT_TOTAL_MISSIONS;
      const missions = team.missions ?? {};
      const completed = team.missionsCompleted ?? 0;
      const number = team.number ?? index + 1;
      const alias = team.alias || team.label || team.name || "";
      const displayName = alias ? `${number}팀 ${alias}` : `${number}팀`;

      state.chatUnread[team.id] = state.chatUnread[team.id] ?? 0;
      state.photoStatus[team.id] = team.photoStatus ?? state.photoStatus[team.id] ?? "default";

      const { text: photoText, className: photoClass } = photoStatusLabel(state.photoStatus[team.id]);

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
            <div class="progress-info">${completed}/${total}</div>
            <div class="team-actions">
              <button class="${photoClass}" data-team-id="${team.id}">${photoText}</button>
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

    container.querySelectorAll(".photo-status").forEach((button) => {
      button.addEventListener("click", () => {
        const teamId = button.dataset.teamId;
        if (typeof state.photoHandler === "function") {
          state.photoHandler(teamId);
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
    setPhotoStatus(teamId, status = "default") {
      state.photoStatus[teamId] = status;
      const button = container.querySelector(`.photo-status[data-team-id="${teamId}"]`);
      if (button) {
        const { text, className } = photoStatusLabel(status);
        button.className = className;
        button.dataset.teamId = teamId;
        button.textContent = text;
      }
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
    setPhotoHandler(handler) {
      state.photoHandler = handler;
    },
  };
}
