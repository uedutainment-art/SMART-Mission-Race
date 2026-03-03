import { db, ref, set, update, onValue, get, firestore, doc, getDoc } from "./firebase_config.js";
import { createDefaultMissionState, sanitizeMasterPass, ALLOWED_STAGES, STAGE_ALIASES } from "./utils.js";

const PANEL_ID = "mission-panel";


const adminSettingsConfigRef = doc(firestore, "adminSettings", "config");
const realtimeMasterPassRef = ref(db, "adminSettings/config/missionMasterPass");


function buildUploadLink(projectId, teamId, missionNumber) {
  const linkUrl = new URL("/photo_upload.html", window.location.origin);
  linkUrl.searchParams.set("project", projectId);
  linkUrl.searchParams.set("team", teamId);
  linkUrl.searchParams.set("mission", missionNumber);
  return linkUrl.toString();
}

export function initMissionModule({
  projectId,
  teamId = "Team1",
  totalMissions = 9,
  missionAreaId = "missionArea",
  masterPass = "",
} = {}) {
  const missionArea = document.getElementById(missionAreaId);
  if (!missionArea || !projectId) return;

  missionArea.innerHTML = "";

  let resolvedMasterPass = sanitizeMasterPass(masterPass);
  loadGlobalMasterPass();

  let missionAnswers = {};
  let photoSettings = {};
  const missionBoxes = new Map();
  const missionState = {};
  const missionsRootRef = ref(db, `projects/${projectId}/teams/${teamId}/missions`);
  const teamAnswersRef = ref(db, `projects/${projectId}/teams/${teamId}/config/missions`);
  let completionModalEl = null;
  let completionShown = false;
  const searchParams = new URLSearchParams(window.location.search);
  const resetRequested = (() => {
    const value = (searchParams.get("resetMissions") || "").toLowerCase();
    return value === "1" || value === "true" || value === "yes" || value === "reset";
  })();

  let currentMission = null;
  let photoOverlayEl = null;



  async function loadGlobalMasterPass() {
    try {
      const snapshot = await getDoc(adminSettingsConfigRef);
      if (snapshot.exists()) {
        const remoteValue = snapshot.data()?.missionMasterPass;
        if (remoteValue) {
          resolvedMasterPass = sanitizeMasterPass(remoteValue);
          return;
        }
      }
      await loadRealtimeMasterPass();
    } catch (error) {
      console.warn("마스터 정답을 불러오지 못했습니다.", error);
      await loadRealtimeMasterPass();
    }
  }

  async function loadRealtimeMasterPass() {
    try {
      const snap = await get(realtimeMasterPassRef);
      const val = snap?.val?.();
      if (val) {
        resolvedMasterPass = sanitizeMasterPass(val);
      }
    } catch (error) {
      console.warn("실시간 DB에서 마스터 정답을 불러오지 못했습니다.", error);
    }
  }

  function isCorrectAnswer(inputValue, expectedValue) {
    const normalizedInput = (inputValue || "").trim();
    if (!normalizedInput) return false;
    if (normalizedInput === resolvedMasterPass) return true;
    return normalizedInput === (expectedValue || "");
  }

  function getAnswerCodeValue(answer = {}) {
    return (answer.answerCode || answer.codeAnswer || answer.missionAnswer || "").trim();
  }

  function getCodeExpectedValue(missionNumber) {
    const answer = resolveMissionAnswer(missionNumber);
    return (answer.codeAnswer || "").trim();
  }

  function getMissionExpectedValue(missionNumber) {
    const answer = resolveMissionAnswer(missionNumber);
    return (answer.missionAnswer || "").trim();
  }

  function defaultAnswer() {
    return {
      answerAssetId: "",
      answerCode: "",
      answerImageUrl: "",
      codeAnswer: "",
      missionAnswer: "",
      codeImageUrl: "",
      missionImageUrl: "",
      enabled: true,
    };
  }

  function resolveMissionAnswer(missionNumber) {
    return missionAnswers[missionNumber] || defaultAnswer();
  }

  function getPhotoConfig(missionNumber) {
    const config = photoSettings[missionNumber];
    if (config) return config;
    const answers = missionAnswers[missionNumber] || {};
    return {
      photoSlots: Number(answers.photoSlots) || 0,
      specialSlots: Number(answers.specialSlots) || 0,
      photoTarget: answers.photoTarget || "",
    };
  }

  function resolvePhotoTarget(missionNumber) {
    const config = getPhotoConfig(missionNumber);
    return config.photoTarget || "";
  }

  function isPhotoMission(missionNumber) {
    return Boolean(resolvePhotoTarget(missionNumber));
  }

  for (let i = 1; i <= totalMissions; i++) {
    const box = document.createElement("div");
    box.className = "mission locked";
    box.dataset.mission = i;
    box.innerHTML = `<span class="mission-label">MISSION ${i}</span>`;
    if (i === 1) {
      box.classList.remove("locked");
      box.classList.add("challenge", "stage-code");
    }
    missionArea.appendChild(box);
    missionBoxes.set(i, box);
    missionState[i] = {
      stage: i === 1 ? "code" : "locked",
      panel: null,
    };
  }
  refreshPhotoBadges();

  if (resetRequested) {
    set(missionsRootRef, createDefaultMissionState(totalMissions));
    searchParams.delete("resetMissions");
    const nextSearch = searchParams.toString();
    const newUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", newUrl);
  }

  const panel = ensurePanel();
  const closeButton = panel.querySelector("#closePanel");
  const title = panel.querySelector("#panel-title");
  const body = panel.querySelector("#panel-body");

  closeButton.addEventListener("click", handleClosePanel);
  panel.addEventListener("click", (event) => {
    if (event.target === panel) {
      handleClosePanel();
    }
  });

  missionArea.addEventListener("click", (event) => {
    const box = event.target.closest(".mission");
    if (!box) return;
    const missionNumber = Number(box.dataset.mission);
    const state = missionState[missionNumber];
    if (!state || state.stage === "locked") return;
    openPanel(missionNumber);
  });

  onValue(teamAnswersRef, (snapshot) => {
    missionAnswers = snapshot.val() || {};
    photoSettings = {};
    Object.entries(missionAnswers).forEach(([missionNumber, payload]) => {
      photoSettings[missionNumber] = {
        photoSlots: Number(payload.photoSlots) || 0,
        specialSlots: Number(payload.specialSlots) || 0,
        photoTarget: payload.photoTarget || "",
      };
    });
    refreshPhotoBadges();
  });
  onValue(missionsRootRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      set(missionsRootRef, createDefaultMissionState(totalMissions));
      return;
    }

    let needsNormalization = false;
    const normalized = {};
    let previousDone = true;

    for (let i = 1; i <= totalMissions; i++) {
      const raw = data[i] || {};
      const previousStage = missionState[i]?.stage;
      let stage = raw.stage;
      if (!ALLOWED_STAGES.has(stage) && typeof stage === "string") {
        const aliasKey = stage.toLowerCase();
        if (STAGE_ALIASES[aliasKey]) {
          stage = STAGE_ALIASES[aliasKey];
          needsNormalization = true;
        }
      }
      if (!ALLOWED_STAGES.has(stage)) {
        stage = i === 1 ? "code" : "locked";
        needsNormalization = true;
      }

      let panelState = raw.panel ?? null;

      if (!previousDone && i !== 1) {
        if (stage !== "locked") needsNormalization = true;
        stage = "locked";
        panelState = null;
      } else {
        if (stage === "locked") {
          stage = "code";
          panelState = null;
          needsNormalization = true;
        }
        if (stage === "code" && panelState !== null && panelState !== "code") {
          panelState = "code";
          needsNormalization = true;
        }
        if (stage === "mission" && panelState !== "mission") {
          panelState = "mission";
          needsNormalization = true;
        }
      }

      if (stage !== "code" && stage !== "mission") {
        if (panelState !== null) needsNormalization = true;
        panelState = null;
      }

      if (i === 1 && stage !== "done") {
        if (stage !== "code") needsNormalization = true;
        stage = "code";
        if (panelState !== null) {
          panelState = null;
          needsNormalization = true;
        }
      }

      missionState[i] = { stage, panel: panelState };
      normalized[i] = { stage, panel: panelState };
      updateMissionBox(i);
      if (stage === "done" && previousStage !== "done" && isPhotoMission(i)) {
        alert(`HQ에서 Mission ${i} 사진을 승인했습니다.`);
      }
      if (currentMission === i && stage === "done" && panel.style.display === "flex") {
        handleClosePanel();
      }
      previousDone = stage === "done";
    }

    if (needsNormalization) {
      update(missionsRootRef, normalized);
    }
    checkMissionCompletion();
  });

  function openPanel(missionNumber) {
    const state = missionState[missionNumber];
    if (!state) return;

    currentMission = missionNumber;
    panel.style.display = "flex";

    if (state.stage === "done") {
      title.textContent = `MISSION ${missionNumber}`;
      body.innerHTML = `<p>✅ 미션이 완료되었습니다.</p>`;
      return;
    }

    if (state.stage === "code") {
      showCode(missionNumber);
    } else {
      showMission(missionNumber);
    }
  }

  function showCode(missionNumber) {
    const answer = resolveMissionAnswer(missionNumber);
    const photoTarget = resolvePhotoTarget(missionNumber);
    const showCodePhotoButton = photoTarget === "code";
    const answerCodeValue = getCodeExpectedValue(missionNumber);
    const codeImageUrl = answer.codeImageUrl || answer.missionImageUrl || answer.answerImageUrl || "";
    title.textContent = `MISSION ${missionNumber} - CODE`;
    const imageTemplate = codeImageUrl
      ? `<div class="mission-img"><img src="${codeImageUrl}" alt="CODE ${missionNumber}" style="width:100%;height:100%;object-fit:contain;" /></div>`
      : `<div class="code-img">CODE ${missionNumber} 이미지</div>`;
    const photoBtnHtml = showCodePhotoButton
      ? `<button type="button" class="photo-upload-btn" id="photoUploadBtn">📸 사진 업로드</button>`
      : "";
    body.innerHTML = `
      ${imageTemplate}
      <form class="field-row mission-form" id="codeForm">
        <input type="text" id="codeInput" placeholder="정답 입력" />
        <button class="primary" id="codeSubmit" type="submit">확인</button>
        ${photoBtnHtml}
      </form>`;
    const codeForm = body.querySelector("#codeForm");
    codeForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      const v = codeForm.querySelector("#codeInput")?.value.trim();
      if (isCorrectAnswer(v, answerCodeValue)) {
        missionState[missionNumber].stage = "mission";
        missionState[missionNumber].panel = "mission";
        updateCurrentMissionState();
        showMission(missionNumber);
      } else {
        alert("정답이 아닙니다.");
      }
    });
    const photoBtn = body.querySelector("#photoUploadBtn");
    if (photoBtn) {
      photoBtn.addEventListener("click", () => openPhotoOverlay(missionNumber));
    } else {
      closePhotoOverlay();
    }
  }

  function showMission(missionNumber) {
    const answer = resolveMissionAnswer(missionNumber);
    const photoTarget = resolvePhotoTarget(missionNumber);
    const showMissionPhotoButton = photoTarget === "mission";
    const answerCodeValue = getMissionExpectedValue(missionNumber);
    const missionImageUrl = answer.missionImageUrl || answer.codeImageUrl || answer.answerImageUrl || "";
    title.textContent = `MISSION ${missionNumber} - 미션`;
    const imageTemplate = missionImageUrl
      ? `<div class="mission-img"><img src="${missionImageUrl}" alt="MISSION ${missionNumber}" style="width:100%;height:100%;object-fit:contain;" /></div>`
      : `<div class="mission-img">미션 ${missionNumber} 이미지</div>`;
    const photoButtonHtml = showMissionPhotoButton
      ? `<button type="button" class="photo-upload-btn" id="photoUploadBtn">📸 사진 업로드</button>`
      : "";
    body.innerHTML = `
      <div class="mission-content">
        ${imageTemplate}
        <form class="field-row mission-form" id="missionForm">
          <input type="text" id="missionInput" placeholder="정답 입력" />
          <button class="primary" id="missionSubmit" type="submit">확인</button>
          ${photoButtonHtml}
        </form>
      </div>`;

    const missionForm = body.querySelector("#missionForm");
    missionForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      const v = missionForm.querySelector("#missionInput")?.value.trim();
      if (isCorrectAnswer(v, answerCodeValue)) {
        completeMission(missionNumber);
      } else {
        alert("정답이 아닙니다.");
      }
    });

    const photoBtn = body.querySelector("#photoUploadBtn");
    if (photoBtn) {
      photoBtn.addEventListener("click", () => openPhotoOverlay(missionNumber));
    }
  }

  function completeMission(missionNumber) {
    missionState[missionNumber].stage = "done";
    missionState[missionNumber].panel = null;
    updateMissionBox(missionNumber);
    updateCurrentMissionState();
    panel.style.display = "none";
    closePhotoOverlay();
    const next = missionNumber + 1;
    if (missionState[next]) {
      missionState[next].stage = "code";
      missionState[next].panel = null;
      updateMissionBox(next);
      updateCurrentMissionState();
    }
    checkMissionCompletion();
  }

  function updateCurrentMissionState() {
    update(missionsRootRef, missionState);
  }

  function openPhotoOverlay(missionNumber) {
    const link = buildUploadLink(projectId, teamId, missionNumber);
    closePhotoOverlay();
    const overlay = document.createElement("div");
    overlay.className = "photo-overlay";
    overlay.innerHTML = `
      <div class="photo-overlay__card">
        <button class="photo-overlay__close" aria-label="닫기">×</button>
        <h3>MISSION ${missionNumber} 사진 업로드</h3>
        <div class="photo-overlay__qr" id="photoOverlayQr"></div>
        <p class="photo-overlay__hint">
          QR을 스캔하거나 아래 버튼을 눌러 사진을 업로드하세요.
        </p>
        <a class="photo-overlay__link" href="${link}" target="_blank" rel="noopener">업로드 페이지 열기</a>
      </div>`;
    document.body.appendChild(overlay);
    photoOverlayEl = overlay;
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closePhotoOverlay();
    });
    const closeBtn = overlay.querySelector(".photo-overlay__close");
    closeBtn?.addEventListener("click", closePhotoOverlay);
    const qrTarget = overlay.querySelector("#photoOverlayQr");
    if (qrTarget && typeof QRCode !== "undefined") {
      qrTarget.innerHTML = "";
      new QRCode(qrTarget, { text: link, width: 200, height: 200 });
    } else if (qrTarget) {
      qrTarget.textContent = "QR을 불러오는 중입니다.";
    }
  }

  function closePhotoOverlay() {
    if (photoOverlayEl) {
      photoOverlayEl.remove();
      photoOverlayEl = null;
    }
  }

  function updateMissionBox(missionNumber) {
    const box = missionBoxes.get(missionNumber);
    if (!box) return;
    box.className = "mission";
    const state = missionState[missionNumber];
    if (!state) {
      box.classList.add("locked");
      return;
    }
    if (state.stage === "done") {
      box.classList.add("mission", "finish");
    } else if (state.stage === "mission") {
      box.classList.add("mission", "challenge", "stage-mission");
    } else if (state.stage === "code") {
      box.classList.add("mission", "challenge", "stage-code");
    } else {
      box.classList.add("mission", "locked");
    }
    updatePhotoBadge(missionNumber);
  }

  function handleClosePanel() {
    panel.style.display = "none";
    closePhotoOverlay();
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;
    panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div id="panel-inner">
        <button class="close-btn" id="closePanel">×</button>
        <div id="panel-title"></div>
        <div id="panel-body"></div>
      </div>`;
    document.body.appendChild(panel);
    return panel;
  }

  function refreshPhotoBadges() {
    missionBoxes.forEach((_box, missionNumber) => updatePhotoBadge(missionNumber));
  }

  function updatePhotoBadge(missionNumber) {
    const box = missionBoxes.get(missionNumber);
    if (!box) return;
    let badge = box.querySelector(".photo-badge");
    const enabled = isPhotoMission(missionNumber);
    if (enabled) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "photo-badge";
        badge.textContent = "📸";
        box.appendChild(badge);
      }
      box.classList.add("photo-enabled");
    } else if (badge) {
      badge.remove();
      box.classList.remove("photo-enabled");
    } else {
      box.classList.remove("photo-enabled");
    }
  }

  function checkMissionCompletion() {
    const allDone = areAllMissionsDone();
    if (allDone && !completionShown) {
      showCompletionModal();
    } else if (!allDone && completionShown) {
      completionShown = false;
      closeCompletionModal();
    }
  }

  function areAllMissionsDone() {
    const entries = Object.values(missionState);
    if (!entries.length) return false;
    return entries.every((entry) => entry?.stage === "done");
  }

  function showCompletionModal() {
    completionShown = true;
    closeCompletionModal();
    const modal = document.createElement("div");
    modal.className = "completion-modal";
    modal.innerHTML = `
      <div class="completion-modal__card">
        <button class="completion-modal__close" aria-label="닫기">×</button>
        <p class="completion-modal__badge">🎉</p>
        <h3 class="completion-modal__title">모든 미션 완료!</h3>
        <p class="completion-modal__text">대단해요! 팀이 모든 미션을 성공적으로 마쳤습니다.</p>
        <button class="completion-modal__button" type="button">확인</button>
      </div>
    `;
    document.body.appendChild(modal);
    completionModalEl = modal;
    const closeBtn = modal.querySelector(".completion-modal__close");
    const okBtn = modal.querySelector(".completion-modal__button");
    closeBtn?.addEventListener("click", closeCompletionModal);
    okBtn?.addEventListener("click", closeCompletionModal);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeCompletionModal();
    });
  }

  function closeCompletionModal() {
    if (completionModalEl) {
      completionModalEl.remove();
      completionModalEl = null;
    }
  }

}
