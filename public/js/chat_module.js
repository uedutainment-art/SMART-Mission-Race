import { db, ref, push, onChildAdded, serverTimestamp } from "./firebase_config.js";

const BROADCAST_ROOM_ID = "__broadcast";

export function initChatModule({
  containerId,
  projectId = "default",
  teamId = "Team1",
  teamLabel = "Team1",
} = {}) {
  const container = document.getElementById(containerId);
  if (!container) return { send: () => {} };

  const messagesId = `${containerId}-messages`;
  const inputId = `${containerId}-input`;
  const buttonId = `${containerId}-send`;
  const unreadId = `${containerId}-unread`;

  container.innerHTML = `
    <div class="chat-shell">
      <div class="chat-header-row">
        <div class="chat-header">문의 / 본부 답변</div>
        <div class="chat-unread hidden" id="${unreadId}">새 답변 0</div>
      </div>
      <div class="chat-guide">본부에서 답장을 보내면 아래에 바로 표시됩니다.</div>
      <div class="chatbox">
      <div class="messages" id="${messagesId}"></div>
      <div class="input-area">
        <input id="${inputId}" placeholder="메시지를 입력하세요..." />
        <button id="${buttonId}">전송</button>
      </div>
      </div>
    </div>`;

  const messagesEl = container.querySelector(`#${messagesId}`);
  const inputEl = container.querySelector(`#${inputId}`);
  const buttonEl = container.querySelector(`#${buttonId}`);
  const unreadEl = container.querySelector(`#${unreadId}`);

  const messageKeys = new Set();
  let unreadCount = 0;
  let unreadPulseTimer = null;

  function renderUnread() {
    if (!unreadEl) return;
    unreadEl.textContent = `새 답변 ${unreadCount}`;
    unreadEl.classList.toggle("hidden", unreadCount <= 0);
  }

  function triggerUnreadHint() {
    if (!unreadEl) return;
    unreadEl.classList.remove("chat-unread--pulse");
    void unreadEl.offsetWidth;
    unreadEl.classList.add("chat-unread--pulse");
    if (unreadPulseTimer) window.clearTimeout(unreadPulseTimer);
    unreadPulseTimer = window.setTimeout(() => {
      unreadEl.classList.remove("chat-unread--pulse");
    }, 1600);
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([90, 40, 90]);
    }
  }

  function clearUnread() {
    unreadCount = 0;
    renderUnread();
    unreadEl?.classList.remove("chat-unread--pulse");
  }

  function markChatViewed() {
    clearUnread();
  }

  function appendMessage({ sender, text, scope, countUnread = true }) {
    const row = document.createElement("div");
    row.className = "chat-message";
    const prefix =
      scope === "broadcast"
        ? "[전체공지]"
        : sender === teamId
        ? `[${teamLabel}]`
        : "[HQ]";
    row.textContent = `${prefix} ${text}`;
    row.classList.add(sender === teamId ? "chat-message--team" : "chat-message--hq");
    if (scope === "broadcast") row.classList.add("chat-message--broadcast");
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    if (countUnread && sender !== teamId) {
      const chatVisible = document.visibilityState === "visible" && document.activeElement === inputEl;
      if (!chatVisible) {
        unreadCount += 1;
        renderUnread();
        triggerUnreadHint();
      }
    }
  }

  function handleSnapshot(scope) {
    return (snapshot) => {
      const key = `${scope}-${snapshot.key}`;
      if (messageKeys.has(key)) return;
      messageKeys.add(key);

      const value = snapshot.val() ?? {};
      appendMessage({
        sender: value.sender || (scope === "broadcast" ? "HQ" : teamId),
        text: value.text || "",
        scope,
        countUnread: true,
      });
    };
  }

  const chatBase = `chat/${projectId || "default"}`;
  const teamChatRef = ref(db, `${chatBase}/${teamId}`);
  const broadcastRef = ref(db, `${chatBase}/${BROADCAST_ROOM_ID}`);

  onChildAdded(teamChatRef, handleSnapshot("team"));
  onChildAdded(broadcastRef, handleSnapshot("broadcast"));

  function sendMessage() {
    const value = inputEl.value.trim();
    if (!value) return;
    push(teamChatRef, {
      sender: teamId,
      text: value,
      createdAt: serverTimestamp(),
    });
    inputEl.value = "";
  }

  buttonEl.addEventListener("click", sendMessage);
  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendMessage();
    }
  });
  inputEl.addEventListener("focus", markChatViewed);
  inputEl.addEventListener("click", markChatViewed);
  messagesEl.addEventListener("click", markChatViewed);
  messagesEl.addEventListener("touchstart", markChatViewed, { passive: true });
  unreadEl?.addEventListener("click", () => {
    messagesEl.scrollIntoView({ behavior: "smooth", block: "start" });
    markChatViewed();
  });

  appendMessage({
    sender: "HQ",
    text: "HQ와 연결되었습니다.",
    scope: "team",
    countUnread: false,
  });

  return {
    send: sendMessage,
  };
}
