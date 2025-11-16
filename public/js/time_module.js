import { db, ref, onValue, set } from "./firebase_config.js";

// 시간 표시 모듈 (공유 카운트다운 지원)
export function initTimeModule(currentId, remainId, options = {}) {
  const currentEl = document.getElementById(currentId);
  const remainEl = document.getElementById(remainId);
  const noteEl = options.noteId ? document.getElementById(options.noteId) : null;

  const {
    startTime,
    endTime,
    countdownSeconds = null,
    warningThreshold = 600,
    warningClass = "warning",
    warningMessage = "⚠️ 시간이 얼마 남지 않았습니다.",
    finishedMessage = "⏱️ 시간이 종료되었습니다.",
    sharedCountdownPath,
    autoCreate = true,
    formatCurrentTime,
    formatRemain,
    onFinished = null,
  } = options;

  let intervalId = null;
  let finishedTriggered = false;

  function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function setWarning(active, finished = false) {
    if (!remainEl) return;
    if (active) {
      remainEl.classList.add(warningClass);
      if (noteEl) noteEl.textContent = warningMessage;
    } else if (finished) {
      remainEl.classList.add(warningClass);
      if (noteEl) noteEl.textContent = finishedMessage;
    } else {
      remainEl.classList.remove(warningClass);
      if (noteEl) noteEl.textContent = "";
    }
  }

  function startUpdateLoop(targetEndMs) {
    if (intervalId) {
      clearInterval(intervalId);
    }
    finishedTriggered = false;

    function tick() {
      const now = Date.now();
      const remainingMs = Math.max(0, targetEndMs - now);
      const remainingSeconds = Math.floor(remainingMs / 1000);

      if (currentEl) {
        const formatted = typeof formatCurrentTime === "function"
          ? formatCurrentTime(new Date(now))
          : new Date(now).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
        currentEl.textContent = formatted;
      }

      if (remainEl) {
        const formattedRemain = typeof formatRemain === "function"
          ? formatRemain(remainingSeconds)
          : formatDuration(remainingSeconds);
        remainEl.textContent = formattedRemain;
      }

      if (remainingSeconds === 0) {
        setWarning(false, true);
        clearInterval(intervalId);
        intervalId = null;
        if (!finishedTriggered && typeof onFinished === "function") {
          finishedTriggered = true;
          onFinished();
        }
        return;
      }

      if (warningThreshold !== null && remainingSeconds <= warningThreshold) {
        setWarning(true);
      } else {
        setWarning(false);
      }
    }

    tick();
    intervalId = setInterval(tick, 1000);
  }

  if (sharedCountdownPath) {
    const countdownRef = ref(db, sharedCountdownPath);
    let initialised = false;

    onValue(countdownRef, (snapshot) => {
      const data = snapshot.val();
      if (!data && autoCreate && !initialised) {
        const now = Date.now();
        const duration = countdownSeconds ?? 0;
        set(countdownRef, { startAt: now, duration });
        return;
      }
      if (!data || !data.startAt) return;

      initialised = true;
      const duration = (data.duration ?? countdownSeconds ?? 0) * 1000;
      const targetEnd = data.startAt + duration;
      startUpdateLoop(targetEnd);
    });
    return;
  }

  const parsedEnd = endTime != null ? Number(endTime) : NaN;
  if (!Number.isNaN(parsedEnd)) {
    startUpdateLoop(parsedEnd);
    return;
  }

  if (countdownSeconds !== null) {
    const targetEnd = Date.now() + countdownSeconds * 1000;
    startUpdateLoop(targetEnd);
    return;
  }

  // 기본값: 1시간 카운트다운
  const defaultTarget = Date.now() + 3600 * 1000;
  startUpdateLoop(defaultTarget);
}
