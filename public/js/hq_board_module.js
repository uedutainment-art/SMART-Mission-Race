const DEFAULT_TOTAL_MISSIONS = 9;

function normalizePhotoState(value) {
  if (!value) return { status: "default", count: 0 };
  if (typeof value === "string") return { status: value, count: 0 };
  return {
    status: value.status || "default",
    count: Number(value.count) || 0,
  };
}

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
    bubbles.code.push("active-code");
  } else if (panel === "mission") {
    bubbles.mission.push("active-mission");
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
      return { text: "Photo", className: "photo-status photo-new" };
    case "done":
      return { text: "Photo ✓", className: "photo-status photo-done" };
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
      const displayName =
        team.label ||
        (Number.isFinite(number) ? `${number}팀` : team.id || "TEAM");

      state.chatUnread[team.id] = state.chatUnread[team.id] ?? 0;
      state.photoStatus[team.id] = normalizePhotoState(
        state.photoStatus[team.id] ?? team.photoStatus
      );

      const photoState = normalizePhotoState(state.photoStatus[team.id]);
      const { text: photoText, className: photoClass } = photoStatusLabel(photoState.status);
      const photoBadgeVisible = photoState.status === "new" && photoState.count > 0;
      const photoBadgeMarkup = `<span class="btn-badge${photoBadgeVisible ? "" : " hidden"}">${
        photoState.count || 0
      }</span>`;
      const chatCount = state.chatUnread[team.id] || 0;
      const chatBadgeMarkup = `<span class="btn-badge${chatCount > 0 ? "" : " hidden"}">${chatCount}</span>`;
      const chatButtonClass = `chat-alert-btn${chatCount > 0 ? " chat-new" : ""}`;

      const tiles = [];
      for (let i = 1; i <= total; i++) {
        const missionData = missions[i] || {};
        const stage = missionData.stage || (i === 1 ? "code" : "locked");
        const panel = missionData.panel || null;
        const tileClasses = ["hq-mission", stageClassName(stage)];
        if (stage !== "done" && panel === "code") {
          tileClasses.push("mission-active-code");
        } else if (stage !== "done" && panel === "mission") {
          tileClasses.push("mission-active-mission");
        }
        tiles.push(`
          <div class="${tileClasses.join(" ")}">
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
              <button class="${photoClass}" data-team-id="${team.id}">
                <span class="btn-label">${photoText}</span>
                ${photoBadgeMarkup}
              </button>
              <button class="${chatButtonClass}" data-team-id="${team.id}">
                <span class="btn-label">Chat</span>
                ${chatBadgeMarkup}
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
        button.classList.remove("chat-new");
        const labelEl = button.querySelector(".btn-label");
        if (labelEl) labelEl.textContent = "Chat";
        setButtonBadge(button, 0);
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
    setPhotoStatus(teamId, payload = { status: "default", count: 0 }) {
      const normalized = normalizePhotoState(payload);
      state.photoStatus[teamId] = normalized;
      const button = container.querySelector(`.photo-status[data-team-id="${teamId}"]`);
      if (button) {
        const { text, className } = photoStatusLabel(normalized.status);
        button.className = className;
        button.dataset.teamId = teamId;
        const labelEl = button.querySelector(".btn-label");
        if (labelEl) labelEl.textContent = text;
        setButtonBadge(button, normalized.status === "new" ? normalized.count : 0);
      }
    },
    setChatAlert(teamId, unreadCount = 0) {
      const safeCount = Math.max(0, unreadCount | 0);
      state.chatUnread[teamId] = safeCount;
      const button = container.querySelector(`.chat-alert-btn[data-team-id="${teamId}"]`);
      if (button) {
        if (safeCount > 0) {
          button.classList.add("chat-new");
        } else {
          button.classList.remove("chat-new");
        }
        setButtonBadge(button, safeCount);
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

function setButtonBadge(button, count = 0) {
  if (!button) return;
  let badge = button.querySelector(".btn-badge");
  if (count > 0) {
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "btn-badge";
      button.appendChild(badge);
    }
    badge.textContent = count;
    badge.classList.remove("hidden");
  } else if (badge) {
    badge.classList.add("hidden");
  }
}
