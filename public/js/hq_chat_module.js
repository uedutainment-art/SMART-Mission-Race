import { db, ref, push, onChildAdded, serverTimestamp } from "./firebase_config.js";

const BROADCAST_ROOM_ID = "__broadcast";

export function initHQChatModule({
  containerId = "hqChat",
  projectId = "default",
  teams = [{ id: "Team1", label: "Team 1" }],
  role = "HQ",
  placeholder = "메시지를 입력하세요...",
  welcomeMessage = "[HQ 시스템] 채팅 연결 대기 중...",
  onTeamMessage,
  onMessagesRead,
  onMessageNotify,
} = {}) {
  const container = document.getElementById(containerId);
  if (!container) return { send: () => {} };

  const tabsId = `${containerId}-tabs`;
  const messagesId = `${containerId}-messages`;
  const inputId = `${containerId}-input`;
  const buttonId = `${containerId}-send`;

  const teamEntries = [
    { id: BROADCAST_ROOM_ID, label: "전체 공지", fullLabel: "전체 공지" },
    ...teams.map((team, index) => ({
      id: team.id,
      label: `${index + 1}Team`,
      fullLabel: team.label || team.name || team.id || `${index + 1}Team`,
    })),
  ];

  const defaultActiveId = BROADCAST_ROOM_ID;

  container.innerHTML = `
    <div class="chat-tabs" id="${tabsId}"></div>
    <div class="messages" id="${messagesId}"></div>
    <div class="input-area">
      <input id="${inputId}" placeholder="${placeholder}" />
      <button id="${buttonId}" type="button">전송</button>
    </div>
  `;

  const tabsEl = container.querySelector(`#${tabsId}`);
  const messagesEl = container.querySelector(`#${messagesId}`);
  const inputEl = container.querySelector(`#${inputId}`);
  const buttonEl = container.querySelector(`#${buttonId}`);

  const state = {
    activeTeam: defaultActiveId,
    messages: {},
    unread: {},
  };
  let lastSendAt = 0;

  if (welcomeMessage) {
    ensureTeamState(state.activeTeam);
    state.messages[state.activeTeam].push({
      id: "__welcome__",
      sender: "시스템",
      text: welcomeMessage,
      createdAt: Date.now(),
      teamId: state.activeTeam,
    });
  }

  const chatBasePath = `chat/${projectId || "default"}`;

  teamEntries.forEach((entry) => {
    renderTab(entry, entry.id === state.activeTeam);
    attachListener(entry.id);
  });

  function renderTab(entry, isActive = false) {
    const tab = document.createElement("button");
    tab.className = "chat-tab";
    tab.dataset.teamId = entry.id;
    tab.textContent = entry.label;
    if (isActive) {
      tab.classList.add("active");
      state.activeTeam = entry.id;
    }
    tabsEl.appendChild(tab);
  }

  function updateTabs() {
    const tabButtons = tabsEl.querySelectorAll(".chat-tab");
    tabButtons.forEach((button) => {
      const teamId = button.dataset.teamId;
      button.classList.toggle("active", teamId === state.activeTeam);

      let badge = button.querySelector(".badge");
      if (teamId !== BROADCAST_ROOM_ID && state.unread[teamId]) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "badge";
          button.appendChild(badge);
        }
        badge.textContent = `${state.unread[teamId]}`;
      } else if (badge) {
        badge.remove();
      }
    });
  }

  function updatePlaceholder() {
    if (!inputEl) return;
    if (state.activeTeam === BROADCAST_ROOM_ID) {
      inputEl.placeholder = "전체 공지 메시지를 입력하세요...";
    } else {
      const activeEntry = teamEntries.find((entry) => entry.id === state.activeTeam);
      const label = activeEntry?.fullLabel || activeEntry?.label || state.activeTeam;
      inputEl.placeholder = `${label}에게 보낼 메시지...`;
    }
  }

  tabsEl.addEventListener("click", (event) => {
    const button = event.target.closest(".chat-tab");
    if (!button) return;
    const teamId = button.dataset.teamId;
    if (teamId === state.activeTeam) return;
    state.activeTeam = teamId;
    state.unread[teamId] = 0;
    updateTabs();
    renderMessages(teamId);
    updatePlaceholder();
    if (typeof onMessagesRead === "function" && teamId !== BROADCAST_ROOM_ID) {
      onMessagesRead(teamId);
    }
  });

  function ensureTeamState(teamId) {
    if (!state.messages[teamId]) {
      state.messages[teamId] = [];
    }
    if (!state.unread[teamId]) {
      state.unread[teamId] = 0;
    }
  }

  function attachListener(teamId) {
    const chatRef = ref(db, `${chatBasePath}/${teamId}`);
    ensureTeamState(teamId);

    onChildAdded(chatRef, (snapshot) => {
      const value = snapshot.val();
      if (!value) return;
      const message = {
        id: snapshot.key,
        sender: value.sender || (teamId === BROADCAST_ROOM_ID ? "HQ" : teamId),
        text: value.text || "",
        createdAt: value.createdAt || Date.now(),
        teamId,
      };

      if (message.sender !== role && typeof onMessageNotify === "function") {
        onMessageNotify(teamId, message);
      }

      const list = state.messages[teamId];
      if (!list.find((item) => item.id === message.id)) {
        list.push(message);
        list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      }

      if (teamId === state.activeTeam) {
        renderMessages(teamId);
        state.unread[teamId] = 0;
        updateTabs();
        if (typeof onMessagesRead === "function" && teamId !== BROADCAST_ROOM_ID) {
          onMessagesRead(teamId);
        }
      } else if (message.sender !== role) {
        state.unread[teamId] += 1;
        updateTabs();
        if (typeof onTeamMessage === "function" && teamId !== BROADCAST_ROOM_ID) {
          onTeamMessage(teamId, message, state.unread[teamId]);
        }
      }
    });
  }

  function renderMessages(teamId) {
    messagesEl.innerHTML = "";
    const list = state.messages[teamId] || [];
    list.forEach((message) => {
      const senderColor =
        message.teamId === BROADCAST_ROOM_ID
          ? "#ffd966"
          : message.sender === role
          ? "#4cc9f0"
          : "#ffeb8a";
      const senderLabel =
        message.teamId === BROADCAST_ROOM_ID
          ? "전체공지"
          : message.sender === role
          ? "HQ"
          : message.sender;
      appendMessage(messagesEl, message.text, senderLabel, senderColor);
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendMessage(target, text, sender, color) {
    const row = document.createElement("div");
    row.textContent = `[${sender}] ${text}`;
    if (color) row.style.color = color;
    target.appendChild(row);
  }

  function activeChatRef() {
    return ref(db, `${chatBasePath}/${state.activeTeam}`);
  }

  function sendMessage() {
    const value = inputEl.value.trim();
    if (!value) return;
    const now = Date.now();
    if (now - lastSendAt < 200) return; // 막 연속 입력 방지
    lastSendAt = now;
    const refToUse = activeChatRef();
    push(refToUse, {
      sender: role,
      text: value,
      createdAt: serverTimestamp(),
    });
    inputEl.value = "";
  }

  function clearTeamHistory(teamId) {
    if (!teamId) return;
    ensureTeamState(teamId);
    state.messages[teamId] = [];
    state.unread[teamId] = 0;
    if (state.activeTeam === teamId) {
      state.activeTeam = BROADCAST_ROOM_ID;
      ensureTeamState(state.activeTeam);
      updateTabs();
      renderMessages(state.activeTeam);
      updatePlaceholder();
    } else {
      updateTabs();
    }
  }

  buttonEl.addEventListener("click", sendMessage);
  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      if (event.isComposing) return; // 한글 등 IME 입력 중 엔터는 무시하여 중복 전송 방지
      event.preventDefault();
      sendMessage();
    }
  });

  renderMessages(state.activeTeam);
  updateTabs();
  updatePlaceholder();

  return {
    send: (message, targetTeamId = state.activeTeam) => {
      if (!message) return;
      const refToUse = ref(db, `${chatBasePath}/${targetTeamId}`);
      push(refToUse, {
        sender: role,
        text: message,
        createdAt: serverTimestamp(),
      });
    },
    setActiveTeam(teamId) {
      if (!teamEntries.find((entry) => entry.id === teamId)) return;
      state.activeTeam = teamId;
      state.unread[teamId] = 0;
      updateTabs();
      renderMessages(teamId);
      updatePlaceholder();
      if (typeof onMessagesRead === "function" && teamId !== BROADCAST_ROOM_ID) {
        onMessagesRead(teamId);
      }
    },
    getActiveTeam() {
      return state.activeTeam;
    },
    clearTeamHistory,
  };
}
