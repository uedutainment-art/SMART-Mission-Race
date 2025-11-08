import { db, ref, set, update, onValue, get } from "./firebase_config.js";

const PANEL_ID = "mission-panel";
const ALLOWED_STAGES = new Set(["locked", "code", "mission", "done"]);
const STAGE_ALIASES = {
  finish: "done",
  finished: "done",
  complete: "done",
  completed: "done",
  challenge: "code",
  start: "code",
  active: "mission",
};

function createDefaultMissionState(totalMissions) {
  const initial = {};
  for (let i = 1; i <= totalMissions; i++) {
    initial[i] = {
      stage: i === 1 ? "code" : "locked",
      panel: null,
    };
  }
  return initial;
}

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
} = {}) {
  const missionArea = document.getElementById(missionAreaId);
  if (!missionArea || !projectId) return;

  missionArea.innerHTML = "";

  let missionAnswers = {};
  let photoSettings = {};
const missionBoxes = new Map();
const missionState = {};
const missionsRootRef = ref(db, `projects/${projectId}/teams/${teamId}/missions`);
const teamAnswersRef = ref(db, `projects/${projectId}/teams/${teamId}/config/missions`);
  const searchParams = new URLSearchParams(window.location.search);
  const resetRequested = (() => {
    const value = (searchParams.get("resetMissions") || "").toLowerCase();
    return value === "1" || value === "true" || value === "yes" || value === "reset";
  })();

let currentMission = null;
let qrPopupEl = null;

  function defaultAnswer() {
    return {
      codeAnswer: "1",
      missionAnswer: "1",
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
    if (missionAnswers[missionNumber]) {
      return {
        photoSlots: Number(missionAnswers[missionNumber].photoSlots) || 0,
        specialSlots: Number(missionAnswers[missionNumber].specialSlots) || 0,
      };
    }
    return { photoSlots: 0, specialSlots: 0 };
  }

  function isPhotoMission(missionNumber) {
    const config = getPhotoConfig(missionNumber);
    if ((config.photoSlots || 0) > 0 || (config.specialSlots || 0) > 0) {
      return true;
    }
    return false;
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
      if (currentMission === i && stage === "done" && panel.style.display === "flex") {
        handleClosePanel();
      }
      previousDone = stage === "done";
    }

    if (needsNormalization) {
      update(missionsRootRef, normalized);
    }
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
    title.textContent = `MISSION ${missionNumber} - CODE`;
    const imageTemplate = answer.codeImageUrl
      ? `<div class="mission-img"><img src="${answer.codeImageUrl}" alt="CODE ${missionNumber}" style="width:100%;height:100%;object-fit:contain;" /></div>`
      : `<div class="code-img">CODE ${missionNumber} 이미지</div>`;
    body.innerHTML = `
      ${imageTemplate}
      <div class="field-row">
        <input type="text" id="codeInput" placeholder="정답 입력" />
        <button class="primary" id="codeSubmit">확인</button>
      </div>`;
    body.querySelector("#codeSubmit").onclick = () => {
      const v = body.querySelector("#codeInput").value.trim();
      if (v === (answer.codeAnswer || "1")) {
        missionState[missionNumber].stage = "mission";
        missionState[missionNumber].panel = "mission";
        updateCurrentMissionState();
        showMission(missionNumber);
      } else {
        alert("정답이 아닙니다.");
      }
    };
  }

  function showMission(missionNumber) {
    const answer = resolveMissionAnswer(missionNumber);
    title.textContent = `MISSION ${missionNumber} - 미션`;
    const imageTemplate = answer.missionImageUrl
      ? `<div class="mission-img"><img src="${answer.missionImageUrl}" alt="MISSION ${missionNumber}" style="width:100%;height:100%;object-fit:contain;" /></div>`
      : `<div class="mission-img">미션 ${missionNumber} 이미지</div>`;

    if (isPhotoMission(missionNumber)) {
      body.innerHTML = `
        ${imageTemplate}
        <div class="field-row">
          <input type="text" id="missionInput" placeholder="정답 입력" />
          <button class="primary" id="missionSubmit">확인</button>
          <button class="primary" id="qrBtn">📷 업로드</button>
          <button class="primary" id="hqApprove">✅ HQ 승인</button>
        </div>`;
      body.querySelector("#missionSubmit").onclick = () => {
        const v = body.querySelector("#missionInput").value.trim();
        if (v === (answer.missionAnswer || "1")) {
          completeMission(missionNumber);
        } else {
          alert("정답이 아닙니다.");
        }
      };
      body.querySelector("#qrBtn").onclick = showQr;
      body.querySelector("#hqApprove").onclick = () => completeMission(missionNumber);
    } else {
      body.innerHTML = `
        ${imageTemplate}
        <div class="field-row">
          <input type="text" id="missionInput" placeholder="정답 입력" />
          <button class="primary" id="missionSubmit">확인</button>
        </div>`;
      body.querySelector("#missionSubmit").onclick = () => {
        const v = body.querySelector("#missionInput").value.trim();
        if (v === (answer.missionAnswer || "1")) {
          completeMission(missionNumber);
        } else {
          alert("정답이 아닙니다.");
        }
      };
    }
  }

  function showQr() {
    closeQrPopup();
    qrPopupEl = document.createElement("div");
    qrPopupEl.id = "qrPopup";
    qrPopupEl.style.position = "fixed";
    qrPopupEl.style.inset = "0";
    qrPopupEl.style.background = "rgba(0,0,0,0.7)";
    qrPopupEl.style.display = "flex";
    qrPopupEl.style.justifyContent = "center";
    qrPopupEl.style.alignItems = "center";
    qrPopupEl.innerHTML = `<div id="qrInner" style="background:#1f2933;padding:20px 30px;border-radius:12px;text-align:center;">
      <h3>📸 사진 업로드 QR</h3>
      <div id="qrcode"></div>
      <a id="openLink" target="_blank" style="display:block;margin-top:12px;color:#4cc9f0;">직접 링크 열기</a><br>
      <button id="closeQr" style="margin-top:15px;background:#3b82f6;border:none;padding:8px 14px;color:#fff;border-radius:6px;cursor:pointer;">닫기</button>
    </div>`;
    document.body.appendChild(qrPopupEl);
    const link = buildUploadLink(projectId, teamId, currentMission);
    /* global QRCode */
    new QRCode(qrPopupEl.querySelector("#qrcode"), { text: link, width: 180, height: 180 });
    qrPopupEl.querySelector("#openLink").href = link;
    qrPopupEl.querySelector("#closeQr").onclick = () => closeQrPopup();
  }

  function completeMission(missionNumber) {
    missionState[missionNumber].stage = "done";
    missionState[missionNumber].panel = null;
    updateMissionBox(missionNumber);
    updateCurrentMissionState();
    panel.style.display = "none";
    closeQrPopup();
    const next = missionNumber + 1;
    if (missionState[next]) {
      missionState[next].stage = "code";
      missionState[next].panel = null;
      updateMissionBox(next);
      updateCurrentMissionState();
    }
  }

  function updateCurrentMissionState() {
    update(missionsRootRef, missionState);
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
      closeQrPopup();
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

  function closeQrPopup() {
    if (qrPopupEl) {
      qrPopupEl.remove();
      qrPopupEl = null;
    }
  }
}
