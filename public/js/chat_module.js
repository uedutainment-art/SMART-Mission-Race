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

  container.innerHTML = `
    <div class="chatbox">
      <div class="messages" id="${messagesId}"></div>
      <div class="input-area">
        <input id="${inputId}" placeholder="메시지를 입력하세요..." />
        <button id="${buttonId}">전송</button>
      </div>
    </div>`;

  const messagesEl = container.querySelector(`#${messagesId}`);
  const inputEl = container.querySelector(`#${inputId}`);
  const buttonEl = container.querySelector(`#${buttonId}`);

  const messageKeys = new Set();

  function appendMessage({ sender, text, scope }) {
    const row = document.createElement("div");
    const prefix =
      scope === "broadcast"
        ? "[전체공지]"
        : sender === teamId
        ? `[${teamLabel}]`
        : "[HQ]";
    row.textContent = `${prefix} ${text}`;
    row.style.color = sender === teamId ? "#ffeb8a" : "#4cc9f0";
    if (scope === "broadcast") {
      row.style.color = "#ffd966";
    }
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
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

  appendMessage({
    sender: "HQ",
    text: "HQ와 연결되었습니다.",
    scope: "team",
  });

  return {
    send: sendMessage,
  };
}
