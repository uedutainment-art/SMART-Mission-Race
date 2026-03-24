import { db, ref, set, update, onValue, push, serverTimestamp } from "./firebase_config.js";
import {
  STEP_MODES,
  createDefaultMissionEntry,
  getPhotoConfigFromMission,
  getStepConfig,
  isPhotoMissionConfig,
  isStepAnswerCorrect,
  normalizeMissionEntry,
} from "./mission_rules.js";
import { createDefaultMissionState } from "./mission_state.js";
import { resolveMissionConfigFromProject } from "./project_mission_resolver.js";

const PANEL_ID = "mission-panel";
const ALLOWED_STAGES = new Set(["locked", "code", "mission", "done"]);
const ALLOWED_STEP_STATUS = new Set([null, "awaiting_hq", "delay"]);
const STAGE_ALIASES = {
  finish: "done",
  finished: "done",
  complete: "done",
  completed: "done",
  challenge: "code",
  start: "code",
  active: "mission",
};

function buildUploadLink(projectId, teamId, missionNumber) {
  const linkUrl = new URL("./photo_upload.html", window.location.href);
  linkUrl.searchParams.set("project", projectId);
  linkUrl.searchParams.set("team", teamId);
  linkUrl.searchParams.set("mission", missionNumber);
  return linkUrl.toString();
}

function isLikelyMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent || "");
}

export function initMissionModule({
  projectId,
  teamId = "Team1",
  totalMissions = 9,
  missionAreaId = "missionArea",
  onStateChange = null,
} = {}) {
  const missionArea = document.getElementById(missionAreaId);
  if (!missionArea || !projectId) return;

  missionArea.innerHTML = "";

  let missionAnswers = {};
  let photoSettings = {};
  let photoUploads = {};
  let legacyMissionAnswers = {};
  let routingConfig = null;
  let teamOverrideConfig = {};
  let projectMeta = {};
  let currentMission = null;
  let qrPopupEl = null;
  let panelMessageTimer = null;
  let bypassCode = "";
  let advanceTimer = null;

  const missionBoxes = new Map();
  const missionState = {};
  const missionsRootRef = ref(db, `projects/${projectId}/teams/${teamId}/missions`);
  const teamAnswersRef = ref(db, `projects/${projectId}/teams/${teamId}/config/missions`);
  const routingRef = ref(db, `projects/${projectId}/routing`);
  const teamOverrideRef = ref(db, `projects/${projectId}/teamOverrides/${teamId}`);
  const uploadsRef = ref(db, `uploads_meta/${projectId}/${teamId}`);
  const metaRef = ref(db, `projects/${projectId}/meta`);

  const searchParams = new URLSearchParams(window.location.search);
  const resetRequested = (() => {
    const value = (searchParams.get("resetMissions") || "").toLowerCase();
    return value === "1" || value === "true" || value === "yes" || value === "reset";
  })();

  function defaultAnswer() {
    return createDefaultMissionEntry();
  }

  function resolveMissionAnswer(missionNumber) {
    return normalizeMissionEntry(missionAnswers[missionNumber] || defaultAnswer());
  }

  function rebuildMissionAnswers() {
    const nextAnswers = {};
    const nextPhotoSettings = {};
    for (let missionNumber = 1; missionNumber <= totalMissions; missionNumber += 1) {
      const legacyMission = legacyMissionAnswers?.[missionNumber] || legacyMissionAnswers?.[String(missionNumber)] || {};
      const resolved = resolveMissionConfigFromProject({
        teamId,
        missionNumber,
        missionTotal: totalMissions,
        routing: routingConfig,
        teamOverride: teamOverrideConfig,
        legacyMission,
        meta: projectMeta,
      });
      nextAnswers[missionNumber] = resolved;
      nextPhotoSettings[missionNumber] = getPhotoConfigFromMission(resolved);
    }
    missionAnswers = nextAnswers;
    photoSettings = nextPhotoSettings;
    refreshPhotoBadges();
    emitStateChange();
  }

  function getPhotoConfig(missionNumber) {
    const config = photoSettings[missionNumber];
    if (config) return config;
    return getPhotoConfigFromMission(resolveMissionAnswer(missionNumber));
  }

  function isPhotoMission(missionNumber) {
    return isPhotoMissionConfig(resolveMissionAnswer(missionNumber));
  }

  function isTeamPhotoHidden() {
    return projectMeta?.hideTeamPhoto === true;
  }

  function getActiveStepKey(missionNumber) {
    return missionState[missionNumber]?.stage === "mission" ? "missionStep" : "codeStep";
  }

  function getActiveStepConfig(missionNumber) {
    return getStepConfig(resolveMissionAnswer(missionNumber), getActiveStepKey(missionNumber));
  }

  function normalizeMissionStateEntry(raw = {}, missionNumber = 1, previousDone = true) {
    let needsNormalization = false;
    let stage = raw.stage;
    if (!ALLOWED_STAGES.has(stage) && typeof stage === "string") {
      const aliasKey = stage.toLowerCase();
      if (STAGE_ALIASES[aliasKey]) {
        stage = STAGE_ALIASES[aliasKey];
        needsNormalization = true;
      }
    }
    if (!ALLOWED_STAGES.has(stage)) {
      stage = missionNumber === 1 ? "code" : "locked";
      needsNormalization = true;
    }

    let panel = raw.panel ?? null;
    let stepStatus = raw.stepStatus ?? null;
    let unlockAt = Number(raw.unlockAt) || null;
    let completedAt = Number(raw.completedAt) || null;

    if (!previousDone && missionNumber !== 1) {
      if (stage !== "locked" || panel !== null || stepStatus !== null || unlockAt !== null || completedAt !== null) {
        needsNormalization = true;
      }
      stage = "locked";
      panel = null;
      stepStatus = null;
      unlockAt = null;
      completedAt = null;
    } else {
      if (stage === "locked") {
        stage = "code";
        panel = null;
        stepStatus = null;
        unlockAt = null;
        completedAt = null;
        needsNormalization = true;
      }
      if (stage === "code" && panel !== null && panel !== "code") {
        panel = "code";
        needsNormalization = true;
      }
      if (stage === "mission" && panel !== "mission") {
        panel = "mission";
        needsNormalization = true;
      }
    }

    if (stage !== "code" && stage !== "mission") {
      if (stage !== "done" && (panel !== null || stepStatus !== null || unlockAt !== null || completedAt !== null)) {
        needsNormalization = true;
      }
      panel = null;
      stepStatus = null;
      unlockAt = null;
      if (stage !== "done") {
        completedAt = null;
      }
    }

    if (!ALLOWED_STEP_STATUS.has(stepStatus)) {
      stepStatus = null;
      needsNormalization = true;
    }
    if (stepStatus !== "delay" && unlockAt !== null) {
      unlockAt = null;
      needsNormalization = true;
    }
    if (stepStatus === "delay" && !unlockAt) {
      stepStatus = null;
      unlockAt = null;
      needsNormalization = true;
    }
    if (stage === "done" && !completedAt) {
      completedAt = Date.now();
      needsNormalization = true;
    }
    if (stage !== "done" && completedAt !== null) {
      completedAt = null;
      needsNormalization = true;
    }

    return {
      state: { stage, panel, stepStatus, unlockAt, completedAt },
      needsNormalization,
    };
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
      stepStatus: null,
      unlockAt: null,
      completedAt: null,
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
    legacyMissionAnswers = snapshot.val() || {};
    rebuildMissionAnswers();
  });
  onValue(routingRef, (snapshot) => {
    routingConfig = snapshot.val() || null;
    rebuildMissionAnswers();
  });
  onValue(teamOverrideRef, (snapshot) => {
    teamOverrideConfig = snapshot.val() || {};
    rebuildMissionAnswers();
  });

  onValue(metaRef, (snapshot) => {
    projectMeta = snapshot.val() || {};
    bypassCode = String(projectMeta.adminBypassCode || "").trim();
    rebuildMissionAnswers();
    if (currentMission && panel.style.display === "flex") {
      openPanel(currentMission);
    }
  });

  onValue(uploadsRef, (snapshot) => {
    photoUploads = snapshot.val() || {};
    refreshPhotoBadges();
    emitStateChange();
    if (currentMission && panel.style.display === "flex") {
      openPanel(currentMission);
    }
  });

  onValue(missionsRootRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      set(missionsRootRef, createDefaultMissionState(totalMissions));
      return;
    }

    let needsNormalization = false;
    let previousDone = true;
    const normalized = {};
    const dueTransitions = [];

    for (let i = 1; i <= totalMissions; i++) {
      const { state, needsNormalization: rowNeedsNormalization } = normalizeMissionStateEntry(data[i] || {}, i, previousDone);
      if (rowNeedsNormalization) needsNormalization = true;
      missionState[i] = state;
      normalized[i] = state;
      if (state.stepStatus === "delay" && state.unlockAt && state.unlockAt <= Date.now()) {
        dueTransitions.push(i);
      }
      previousDone = state.stage === "done";
    }

    if (dueTransitions.length) {
      dueTransitions.forEach((missionNumber) => finalizeStepTransitionLocal(missionNumber));
      updateCurrentMissionState();
      return;
    }

    if (needsNormalization) {
      update(missionsRootRef, normalized);
    }

    for (let i = 1; i <= totalMissions; i++) {
      updateMissionBox(i);
    }
    if (currentMission && panel.style.display === "flex") {
      if (missionState[currentMission]?.stage === "done") {
        handleClosePanel();
      } else {
        openPanel(currentMission);
      }
    }
    syncAdvanceTicker();
    emitStateChange();
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

  function focusPanelInput(input) {
    if (!input) return;
    const applyFocus = () => {
      try {
        input.focus({ preventScroll: true });
      } catch (_error) {
        input.focus();
      }
    };
    applyFocus();
    window.requestAnimationFrame(applyFocus);
  }

  function showCode(missionNumber) {
    const answer = resolveMissionAnswer(missionNumber);
    const stepConfig = getStepConfig(answer, "codeStep");
    const state = missionState[missionNumber] || {};
    title.textContent = `MISSION ${missionNumber} - CODE`;
    const imageTemplate = answer.codeImageUrl
      ? `<div class="mission-img"><img src="${answer.codeImageUrl}" alt="CODE ${missionNumber}" style="width:100%;height:100%;object-fit:contain;" /></div>`
      : `<div class="code-img">CODE ${missionNumber} 이미지</div>`;

    if (state.stepStatus === "delay") {
      body.innerHTML = `
        ${imageTemplate}
        <div class="photo-panel-note photo-panel-note--pending">${getDelayMessage(missionNumber, "codeStep")}</div>
      `;
      return;
    }

    if (stepConfig.mode === STEP_MODES.HQ) {
      if (state.stepStatus !== "awaiting_hq") {
        missionState[missionNumber].stepStatus = "awaiting_hq";
        missionState[missionNumber].unlockAt = null;
        updateCurrentMissionState();
      }
      body.innerHTML = `
        ${imageTemplate}
        <div class="photo-panel-note photo-panel-note--pending">본부에서 확인 중입니다. 잠시만 기다리세요.</div>
        ${buildBypassField("code")}
        <div class="panel-feedback" id="panelFeedback" hidden></div>
      `;
      bindBypassSubmit(missionNumber, "codeStep");
      return;
    }

    if (stepConfig.mode === STEP_MODES.PHOTO_HQ) {
      const photoStatus = getPhotoMissionStatus(missionNumber);
      if (isTeamPhotoHidden()) {
        body.innerHTML = `
          ${imageTemplate}
          <div class="photo-panel-note photo-panel-note--pending">이번 운영에서는 팀 사진 업로드 기능이 숨겨져 있습니다. 운영진 안내를 따라 주세요.</div>
          <div class="panel-feedback" id="panelFeedback" hidden></div>
          ${stepConfig.allowBypass !== false ? buildBypassField("code") : ""}`;
        if (stepConfig.allowBypass !== false) {
          bindBypassSubmit(missionNumber, "codeStep");
        }
        return;
      }
      body.innerHTML = `
        ${imageTemplate}
        <div class="photo-panel-note photo-panel-note--${photoStatus}">${getPhotoPanelMessage(photoStatus)}</div>
        <div class="panel-feedback" id="panelFeedback" hidden></div>
        <div class="field-row">
          <button class="primary" id="uploadLinkBtn">${isLikelyMobileDevice() ? "사진 올리기" : "업로드 열기"}</button>
          <button class="primary" id="qrBtn">QR 보기</button>
        </div>
        ${stepConfig.allowBypass !== false ? buildBypassField("code") : ""}`;
      bindUploadActions(missionNumber);
      if (stepConfig.allowBypass !== false) {
        bindBypassSubmit(missionNumber, "codeStep");
      }
      return;
    }

    body.innerHTML = `
      ${imageTemplate}
      <div class="panel-feedback" id="panelFeedback" hidden></div>
      <form class="field-row" id="codeForm">
        <input type="text" id="codeInput" placeholder="${stepConfig.mode === STEP_MODES.QR ? "강사/장소 QR 입력" : "정답 입력"}" />
        <button class="primary" id="codeSubmit" type="submit">확인</button>
      </form>`;

    const submitCodeAnswer = () => {
      const value = body.querySelector("#codeInput").value.trim();
      if (isStepAnswerCorrect(value, answer, "codeStep", bypassCode)) {
        handleStepSuccess(missionNumber, "codeStep", value === bypassCode);
        if (bypassCode && value === bypassCode) {
          showPanelFeedback("특별 코드로 코드 단계를 통과했습니다.", "info");
        }
      } else {
        showPanelFeedback("정답이 아닙니다. 다시 확인해 주세요.", "error");
      }
    };
    const codeForm = body.querySelector("#codeForm");
    codeForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      submitCodeAnswer();
    });
    const codeInput = body.querySelector("#codeInput");
    focusPanelInput(codeInput);
  }

  function showMission(missionNumber) {
    const answer = resolveMissionAnswer(missionNumber);
    const stepConfig = getStepConfig(answer, "missionStep");
    const state = missionState[missionNumber] || {};
    title.textContent = `MISSION ${missionNumber} - 미션`;
    const imageTemplate = answer.missionImageUrl
      ? `<div class="mission-img"><img src="${answer.missionImageUrl}" alt="MISSION ${missionNumber}" style="width:100%;height:100%;object-fit:contain;" /></div>`
      : `<div class="mission-img">미션 ${missionNumber} 이미지</div>`;

    if (state.stepStatus === "delay") {
      body.innerHTML = `
        ${imageTemplate}
        <div class="photo-panel-note photo-panel-note--pending">${getDelayMessage(missionNumber, "missionStep")}</div>
      `;
      return;
    }

    if (stepConfig.mode === STEP_MODES.HQ) {
      if (state.stepStatus !== "awaiting_hq") {
        missionState[missionNumber].stepStatus = "awaiting_hq";
        missionState[missionNumber].unlockAt = null;
        updateCurrentMissionState();
      }
      body.innerHTML = `
        ${imageTemplate}
        <div class="photo-panel-note photo-panel-note--pending">본부에서 확인 중입니다. 잠시만 기다리세요.</div>
        ${buildBypassField("mission")}
        <div class="panel-feedback" id="panelFeedback" hidden></div>
      `;
      bindBypassSubmit(missionNumber, "missionStep");
      return;
    }

    if (isPhotoMission(missionNumber)) {
      const photoStatus = getPhotoMissionStatus(missionNumber);
      if (stepConfig.mode === STEP_MODES.PHOTO_HQ) {
        if (isTeamPhotoHidden()) {
          body.innerHTML = `
            ${imageTemplate}
            <div class="photo-panel-note photo-panel-note--pending">이번 운영에서는 팀 사진 업로드 기능이 숨겨져 있습니다. 운영진 안내를 따라 주세요.</div>
            <div class="panel-feedback" id="panelFeedback" hidden></div>
            ${stepConfig.allowBypass !== false ? buildBypassField("mission") : ""}`;
          if (stepConfig.allowBypass !== false) {
            bindBypassSubmit(missionNumber, "missionStep");
          }
          return;
        }
        body.innerHTML = `
          ${imageTemplate}
          <div class="photo-panel-note photo-panel-note--${photoStatus}">${getPhotoPanelMessage(photoStatus)}</div>
          <div class="panel-feedback" id="panelFeedback" hidden></div>
          <div class="field-row">
            <button class="primary" id="uploadLinkBtn">${isLikelyMobileDevice() ? "사진 올리기" : "업로드 열기"}</button>
            <button class="primary" id="qrBtn">QR 보기</button>
          </div>
          ${stepConfig.allowBypass !== false ? buildBypassField("mission") : ""}`;
        bindUploadActions(missionNumber);
        if (stepConfig.allowBypass !== false) {
          bindBypassSubmit(missionNumber, "missionStep");
        }
        return;
      }

        body.innerHTML = `
          ${imageTemplate}
          <div class="photo-panel-note photo-panel-note--${photoStatus}">${getPhotoPanelMessage(photoStatus)}</div>
          <div class="panel-feedback" id="panelFeedback" hidden></div>
          <form class="field-row" id="missionForm">
            <input type="text" id="missionInput" placeholder="${stepConfig.mode === STEP_MODES.QR ? "강사/장소 QR 입력" : "정답 입력"}" />
            <button class="primary" id="missionSubmit" type="submit">확인</button>
            ${isTeamPhotoHidden() ? "" : `<button class="primary" id="uploadLinkBtn" type="button">${isLikelyMobileDevice() ? "사진 올리기" : "업로드 열기"}</button>
            <button class="primary" id="qrBtn" type="button">QR 보기</button>`}
          </form>`;
      const submitMissionAnswer = () => {
        const value = body.querySelector("#missionInput").value.trim();
        if (isStepAnswerCorrect(value, answer, "missionStep", bypassCode)) {
          if (bypassCode && value === bypassCode) {
            handleStepSuccess(missionNumber, "missionStep", true);
            showPanelFeedback("특별 코드로 현재 미션을 통과했습니다.", "info");
            return;
          }
          missionState[missionNumber].stepStatus = "awaiting_hq";
          missionState[missionNumber].unlockAt = null;
          updateCurrentMissionState();
          showPanelFeedback("정답 확인이 끝났습니다. 필요한 사진을 올리고 본부 확인을 기다리세요.", "info");
        } else {
          showPanelFeedback("정답이 아닙니다. 다시 확인해 주세요.", "error");
        }
      };
      const missionForm = body.querySelector("#missionForm");
      missionForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        submitMissionAnswer();
      });
      const missionInput = body.querySelector("#missionInput");
      focusPanelInput(missionInput);
      if (!isTeamPhotoHidden()) {
        bindUploadActions(missionNumber);
      }
      return;
    }

    body.innerHTML = `
      ${imageTemplate}
      <div class="panel-feedback" id="panelFeedback" hidden></div>
      <form class="field-row" id="missionForm">
        <input type="text" id="missionInput" placeholder="${stepConfig.mode === STEP_MODES.QR ? "강사/장소 QR 입력" : "정답 입력"}" />
        <button class="primary" id="missionSubmit" type="submit">확인</button>
      </form>`;
    const submitMissionAnswer = () => {
      const value = body.querySelector("#missionInput").value.trim();
      if (isStepAnswerCorrect(value, answer, "missionStep", bypassCode)) {
        handleStepSuccess(missionNumber, "missionStep", value === bypassCode);
        if (bypassCode && value === bypassCode) {
          showPanelFeedback("특별 코드로 현재 미션을 통과했습니다.", "info");
        }
      } else {
        showPanelFeedback("정답이 아닙니다. 다시 확인해 주세요.", "error");
      }
    };
    const missionForm = body.querySelector("#missionForm");
    missionForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      submitMissionAnswer();
    });
    const missionInput = body.querySelector("#missionInput");
    focusPanelInput(missionInput);
  }

  function bindUploadActions(missionNumber) {
    body.querySelector("#uploadLinkBtn")?.addEventListener("click", () => {
      const link = buildUploadLink(projectId, teamId, missionNumber);
      if (isLikelyMobileDevice()) {
        window.location.href = link;
        return;
      }
      window.open(link, "_blank", "noopener");
    });
    body.querySelector("#qrBtn")?.addEventListener("click", () => showQr(missionNumber));
  }

  function showQr(missionNumber = currentMission) {
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
      <h3>사진 업로드 QR</h3>
      <p style="margin:8px 0 0;color:#cbd5e1;font-size:13px;line-height:1.5;">다른 휴대폰으로 올릴 때만 QR을 사용하세요. 지금 기기에서 진행 중이면 아래 링크로 바로 열 수 있습니다.</p>
      <div id="qrcode"></div>
      <a id="openLink" target="_blank" style="display:block;margin-top:12px;color:#4cc9f0;">이 기기에서 바로 열기</a><br>
      <button id="closeQr" style="margin-top:15px;background:#3b82f6;border:none;padding:8px 14px;color:#fff;border-radius:6px;cursor:pointer;">닫기</button>
    </div>`;
    document.body.appendChild(qrPopupEl);
    const link = buildUploadLink(projectId, teamId, missionNumber);
    /* global QRCode */
    new QRCode(qrPopupEl.querySelector("#qrcode"), { text: link, width: 180, height: 180 });
    qrPopupEl.querySelector("#openLink").href = link;
    qrPopupEl.querySelector("#closeQr").onclick = () => closeQrPopup();
  }

  function handleStepSuccess(missionNumber, stepKey, usedBypass = false) {
    const stepConfig = getStepConfig(resolveMissionAnswer(missionNumber), stepKey);
    if (usedBypass) {
      if (stepConfig.allowBypass !== false) {
        appendBypassLog(missionNumber, stepKey);
      }
      if (stepKey === "codeStep") {
        openMissionStage(missionNumber);
      } else {
        completeMission(missionNumber);
      }
      return;
    }
    const delaySeconds = Number(stepConfig.autoAdvanceSeconds) || 0;
    if (delaySeconds > 0) {
      missionState[missionNumber].stepStatus = "delay";
      missionState[missionNumber].unlockAt = Date.now() + delaySeconds * 1000;
      updateCurrentMissionState();
      syncAdvanceTicker();
      openPanel(missionNumber);
      return;
    }

    if (stepKey === "codeStep") {
      openMissionStage(missionNumber);
    } else {
      completeMission(missionNumber);
    }
  }

  function openMissionStage(missionNumber) {
    missionState[missionNumber].stage = "mission";
    missionState[missionNumber].panel = "mission";
    missionState[missionNumber].stepStatus = null;
    missionState[missionNumber].unlockAt = null;
    missionState[missionNumber].completedAt = null;
    updateMissionBox(missionNumber);
    updateCurrentMissionState();
    showMission(missionNumber);
  }

  function applyCompleteMissionLocal(missionNumber) {
    missionState[missionNumber].stage = "done";
    missionState[missionNumber].panel = null;
    missionState[missionNumber].stepStatus = null;
    missionState[missionNumber].unlockAt = null;
    missionState[missionNumber].completedAt = Date.now();
    const next = missionNumber + 1;
    if (missionState[next] && missionState[next].stage === "locked") {
      missionState[next].stage = "code";
      missionState[next].panel = null;
      missionState[next].stepStatus = null;
      missionState[next].unlockAt = null;
      missionState[next].completedAt = null;
    }
  }

  function finalizeStepTransitionLocal(missionNumber) {
    const state = missionState[missionNumber];
    if (!state) return;
    const stepKey = state.stage === "mission" ? "missionStep" : "codeStep";
    state.stepStatus = null;
    state.unlockAt = null;
    if (stepKey === "codeStep") {
      state.stage = "mission";
      state.panel = "mission";
      state.completedAt = null;
    } else {
      applyCompleteMissionLocal(missionNumber);
    }
  }

  function completeMission(missionNumber) {
    applyCompleteMissionLocal(missionNumber);
    for (let i = 1; i <= totalMissions; i++) {
      updateMissionBox(i);
    }
    updateCurrentMissionState();
    panel.style.display = "none";
    closeQrPopup();
  }

  function updateCurrentMissionState() {
    update(missionsRootRef, missionState);
  }

  function syncAdvanceTicker() {
    if (advanceTimer) {
      window.clearInterval(advanceTimer);
      advanceTimer = null;
    }
    const hasDelay = Object.values(missionState).some((entry) => entry?.stepStatus === "delay" && entry?.unlockAt);
    if (!hasDelay) return;
    advanceTimer = window.setInterval(() => {
      let changed = false;
      Object.entries(missionState).forEach(([missionNumber, state]) => {
        if (state?.stepStatus === "delay" && state?.unlockAt && state.unlockAt <= Date.now()) {
          finalizeStepTransitionLocal(Number(missionNumber));
          changed = true;
        }
      });
      if (changed) {
        for (let i = 1; i <= totalMissions; i++) {
          updateMissionBox(i);
        }
        updateCurrentMissionState();
      } else {
        emitStateChange();
        if (currentMission && panel.style.display === "flex") {
          openPanel(currentMission);
        }
      }
    }, 1000);
  }

  function emitStateChange() {
    if (typeof onStateChange !== "function") return;
    const doneCount = Object.values(missionState).filter((entry) => entry?.stage === "done").length;
    const currentEntry = Object.entries(missionState).find(
      ([, entry]) => entry?.stage === "code" || entry?.stage === "mission"
    );
    const currentMissionNumber = currentEntry ? Number(currentEntry[0]) : null;
    const currentState = currentEntry?.[1] || null;
    const stepKey = currentState?.stage === "mission" ? "missionStep" : "codeStep";
    const currentMissionAnswer = currentMissionNumber ? resolveMissionAnswer(currentMissionNumber) : null;
    onStateChange({
      finished: doneCount >= totalMissions,
      completed: doneCount,
      remaining: Math.max(0, totalMissions - doneCount),
      currentMission: currentMissionNumber,
      stage: currentState?.stage || null,
      stepStatus: currentState?.stepStatus || null,
      unlockAt: currentState?.unlockAt || null,
      advanceRemaining:
        currentState?.stepStatus === "delay" && currentState?.unlockAt
          ? Math.max(0, Math.ceil((currentState.unlockAt - Date.now()) / 1000))
          : 0,
      stepMode: currentMissionNumber ? getStepConfig(currentMissionAnswer, stepKey).mode : null,
      isPhotoMission: currentMissionNumber ? isPhotoMission(currentMissionNumber) : false,
      photoStatus: currentMissionNumber ? getPhotoMissionStatus(currentMissionNumber) : "none",
      codeLabel: String(currentMissionAnswer?.codeLabel || "").trim(),
      routeKey: String(currentMissionAnswer?.routeKey || "").trim().toUpperCase(),
      routeLabel: String(currentMissionAnswer?.routeLabel || "").trim(),
    });
  }

  function updateMissionBox(missionNumber) {
    const box = missionBoxes.get(missionNumber);
    if (!box) return;
    box.className = "mission";
    delete box.dataset.stepStatus;
    const state = missionState[missionNumber];
    if (!state) {
      box.classList.add("locked");
      return;
    }
    if (state.stage === "done") {
      box.classList.add("mission", "finish");
      closeQrPopup();
    } else if (state.stepStatus === "awaiting_hq") {
      box.classList.add("mission", "challenge", "stage-mission");
      box.dataset.stepStatus = "awaiting_hq";
    } else if (state.stepStatus === "delay") {
      box.classList.add("mission", "challenge", "stage-mission");
      box.dataset.stepStatus = "delay";
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
    let overlay = document.getElementById(PANEL_ID);
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = PANEL_ID;
    overlay.innerHTML = `
      <div id="panel-inner">
        <button class="close-btn" id="closePanel">×</button>
        <div id="panel-title"></div>
        <div id="panel-body"></div>
      </div>`;
    document.body.appendChild(overlay);
    return overlay;
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
      const status = getPhotoMissionStatus(missionNumber);
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "photo-badge";
        box.appendChild(badge);
      }
      badge.dataset.state = status;
      badge.textContent = getPhotoBadgeText(status);
      box.classList.add("photo-enabled");
    } else if (badge) {
      badge.remove();
      box.classList.remove("photo-enabled");
    } else {
      box.classList.remove("photo-enabled");
    }
  }

  function getPhotoMissionStatus(missionNumber) {
    if (!isPhotoMission(missionNumber)) return "none";
    const config = getPhotoConfig(missionNumber);
    const requiredSlots = [];
    for (let i = 1; i <= (Number(config.photoSlots) || 0); i++) {
      requiredSlots.push(`Photo${i}`);
    }
    for (let i = 1; i <= (Number(config.specialSlots) || 0); i++) {
      requiredSlots.push(`S${i}`);
    }
    if (!requiredSlots.length) return "none";
    const missionKey = `mission_${missionNumber}`;
    const uploads = photoUploads[missionKey] || {};
    const uploadedItems = requiredSlots.map((slotId) => uploads[slotId]).filter((item) => item?.url);
    if (!uploadedItems.length) return "empty";
    const statuses = requiredSlots.map((slotId) => uploads[slotId]?.status || "missing");
    if (statuses.some((status) => status === "retry")) return "retry";
    if (statuses.every((status) => status === "approved")) return "approved";
    if (uploadedItems.length < requiredSlots.length) return "partial";
    return "pending";
  }

  function getPhotoBadgeText(status) {
    switch (status) {
      case "approved":
        return "승인";
      case "retry":
        return "재도전";
      case "pending":
        return "대기";
      case "partial":
        return "업로드";
      default:
        return "📸";
    }
  }

  function getPhotoPanelMessage(status) {
    switch (status) {
      case "approved":
        return "사진 확인이 끝났습니다. 현재 단계를 다시 열어 다음 단계로 진행하세요.";
      case "retry":
        return "다시 찍어야 하는 사진이 있습니다. 표시된 사진만 다시 올리면 됩니다.";
      case "pending":
        return "필요한 사진을 모두 보냈습니다. 본부 확인을 기다리세요.";
      case "partial":
        return "아직 올리지 않은 사진이 남아 있습니다.";
      default:
        return "안내된 사진을 올리면 본부가 확인합니다.";
    }
  }

  function getDelayMessage(missionNumber, stepKey) {
    const state = missionState[missionNumber] || {};
    const remain = state.unlockAt ? Math.max(0, Math.ceil((state.unlockAt - Date.now()) / 1000)) : 0;
    const currentConfig = getStepConfig(resolveMissionAnswer(missionNumber), stepKey);
    const label = stepKey === "codeStep"
      ? currentConfig.mode === STEP_MODES.PHOTO_HQ ? "미션 단계" : "미션 단계"
      : "다음 미션";
    return `${remain}초 후 ${label}가 자동으로 열립니다.`;
  }

  function buildBypassField(stepType = "code") {
    return `
      <form class="field-row field-row--compact" id="stepBypassForm">
        <input type="text" id="stepBypassInput" placeholder="특별 코드 입력" />
        <button class="primary" id="stepBypassSubmit" type="submit">${stepType === "code" ? "코드 통과" : "미션 통과"}</button>
      </form>
    `;
  }

  function bindBypassSubmit(missionNumber, stepKey) {
    const input = body.querySelector("#stepBypassInput");
    const button = body.querySelector("#stepBypassSubmit");
    const form = body.querySelector("#stepBypassForm");
    if (!input || !button || !form) return;
    const submitBypass = () => {
      const value = input.value.trim();
      if (!bypassCode || value !== bypassCode) {
        showPanelFeedback("특별 코드가 아닙니다.", "error");
        return;
      }
      const stepConfig = getStepConfig(resolveMissionAnswer(missionNumber), stepKey);
      if (stepConfig.allowBypass === false) {
        showPanelFeedback("이 단계는 특별 코드를 허용하지 않습니다.", "error");
        return;
      }
      handleStepSuccess(missionNumber, stepKey, true);
      showPanelFeedback("특별 코드로 현재 단계를 통과했습니다.", "info");
    };
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitBypass();
    });
    focusPanelInput(input);
  }

  function appendBypassLog(missionNumber, stepKey) {
    push(ref(db, `ops_logs/${projectId}`), {
      action: "mission_bypass",
      details: {
        source: "team",
        teamId,
        missionId: missionNumber,
        step: stepKey,
      },
      createdAt: serverTimestamp(),
    }).catch((error) => {
      console.warn("mission_bypass log skipped", error);
    });
  }

  function closeQrPopup() {
    if (qrPopupEl) {
      qrPopupEl.remove();
      qrPopupEl = null;
    }
  }

  function showPanelFeedback(message, type = "info") {
    const feedbackEl = body.querySelector("#panelFeedback");
    if (!feedbackEl) return;
    feedbackEl.hidden = false;
    feedbackEl.className = `panel-feedback panel-feedback--${type}`;
    feedbackEl.textContent = message;
    if (panelMessageTimer) {
      window.clearTimeout(panelMessageTimer);
    }
    panelMessageTimer = window.setTimeout(() => {
      feedbackEl.hidden = true;
      feedbackEl.textContent = "";
    }, 2600);
  }
}
