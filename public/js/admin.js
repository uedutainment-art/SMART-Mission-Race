import {
  db,
  ref,
  onValue,
  update,
  storage,
  sRef,
  uploadBytes,
  getDownloadURL,
  firestore,
  doc,
  getDoc,
  setDoc,
  get,
  collection,
  getDocs,
  deleteDoc,
} from "./firebase_config.js";
import { storeProjectContext } from "./project_context.js";

const defaultTeamCount = 10;
const DEFAULT_MISSION_TOTAL = 9;
const DEFAULT_MASTER_PASS = "0313";
let missionTotal = DEFAULT_MISSION_TOTAL;
let globalMasterPass = DEFAULT_MASTER_PASS;
const adminConfigDoc = doc(firestore, "adminSettings", "config");
const qrLibraryCollection = collection(firestore, "qrLibrary");

const PROJECT_PAGE_SIZE = 10;
let currentProjectPage = 1;

const elements = {
  projectTableBody: document.querySelector("#projectTable tbody"),
  newProjectBtn: document.getElementById("newProjectBtn"),
  deleteProjectBtn: document.getElementById("deleteProjectBtn"),
  refreshBtn: document.getElementById("refreshProjectsBtn"),
  projectForm: document.getElementById("projectForm"),
  projectPagePrev: document.getElementById("projectPagePrev"),
  projectPageNext: document.getElementById("projectPageNext"),
  projectPageInfo: document.getElementById("projectPageInfo"),
  projectQrList: document.getElementById("projectQrList"),
  projectQrBox: document.getElementById("projectQrBox"),
  qrOpenBtn: document.getElementById("qrOpenBtn"),
  qrDownloadBtn: document.getElementById("qrDownloadBtn"),
  qrInlineLink: document.getElementById("qrInlineLink"),
  selectAllProjects: document.getElementById("selectAllProjects"),
  projectNameInput: document.getElementById("projectNameInput"),
  projectSubtitleInput: document.getElementById("projectSubtitleInput"),
  projectCodeInput: document.getElementById("projectCodeInput"),
  masterPasswordInput: document.getElementById("masterPasswordInput"),
  globalMasterPassView: document.getElementById("globalMasterPassView"),
  globalMasterPassEdit: document.getElementById("globalMasterPassEdit"),
  globalMasterPassValue: document.getElementById("globalMasterPassValue"),
  globalMasterPassInput: document.getElementById("globalMasterPassInput"),
  editGlobalMasterPassBtn: document.getElementById("editGlobalMasterPassBtn"),
  saveGlobalMasterPassBtn: document.getElementById("saveGlobalMasterPassBtn"),
  cancelGlobalMasterPassBtn: document.getElementById("cancelGlobalMasterPassBtn"),
  missionQrManageBtn: document.getElementById("openMissionQrBtn"),
  educationDateInput: document.getElementById("educationDateInput"),
  educationTimeInput: document.getElementById("educationTimeInput"),
  educationDateBtn: document.getElementById("educationDateBtn"),
  educationTimeBtn: document.getElementById("educationTimeBtn"),
  organizerInput: document.getElementById("organizerInput"),
  venueInput: document.getElementById("venueInput"),
  participantInput: document.getElementById("participantInput"),
  teamCountInput: document.getElementById("teamCountInput"),
  sharedLogoInput: document.getElementById("sharedLogoInput"),
  sharedLogoPreview: document.getElementById("sharedLogoPreview"),
  backgroundImageInput: document.getElementById("backgroundImageInput"),
  backgroundImagePreview: document.getElementById("backgroundImagePreview"),
  teamTableBody: document.querySelector("#teamTable tbody"),
  missionCountInput: document.getElementById("missionCountInput"),
  saveBtn: document.getElementById("saveProjectBtn"),
  resetBtn: document.getElementById("resetResultsBtn"),
  openHQBtn: document.getElementById("openHQBtn"),
  bulkCodeButton: document.getElementById("openBulkCodeModalBtn"),
  bulkCodeModal: document.getElementById("bulkCodeModal"),
  bulkCodeModalTitle: document.getElementById("bulkCodeModalTitle"),
  bulkCodeModalDesc: document.getElementById("bulkCodeModalDesc"),
  bulkCodeModalApply: document.getElementById("bulkCodeModalApply"),
  bulkCodeModalClose: document.getElementById("bulkCodeModalClose"),
  bulkCodeModalCancel: document.getElementById("bulkCodeModalCancel"),
  bulkCodeList: document.getElementById("bulkCodeList"),
  codeAssetSummary: document.getElementById("codeAssetSummary"),
  missionAssetSummary: document.getElementById("missionAssetSummary"),
  assetManageButtons: document.querySelectorAll(".asset-manage-btn"),
  assetModal: document.getElementById("assetModal"),
  assetModalTitle: document.getElementById("assetModalTitle"),
  assetModalClose: document.getElementById("assetModalClose"),
  assetModalCancel: document.getElementById("assetModalCancel"),
  assetCountInput: document.getElementById("assetCountInput"),
  assetSlotList: document.getElementById("assetSlotList"),
  missionModal: document.getElementById("missionModal"),
  missionModalBody: document.getElementById("missionModalBody"),
  missionModalTitle: document.getElementById("missionModalTitle"),
  missionModalSave: document.getElementById("missionModalSave"),
  missionModalClose: document.getElementById("missionModalClose"),
  missionModalCancel: document.getElementById("missionModalCancel"),
  photoConfigToggle: document.getElementById("photoConfigToggle"),
  photoConfigPanel: document.getElementById("photoConfigPanel"),
  photoConfigSelect: document.getElementById("photoConfigSelect"),
  photoConfigApply: document.getElementById("photoConfigApply"),
  photoConfigClear: document.getElementById("photoConfigClear"),
  photoConfigCurrent: document.getElementById("photoConfigCurrent"),
  photoConfigClose: document.getElementById("photoConfigClose"),
  qrManagerModal: document.getElementById("qrManagerModal"),
  qrManagerClose: document.getElementById("qrManagerClose"),
  missionQrCodeInput: document.getElementById("missionQrCodeInput"),
  missionQrGenerateBtn: document.getElementById("missionQrGenerateBtn"),
  missionQrPreview: document.getElementById("missionQrPreview"),
  missionQrDownloadBtn: document.getElementById("missionQrDownloadBtn"),
  missionQrPrintBtn: document.getElementById("missionQrPrintBtn"),
  missionQrDeleteBtn: document.getElementById("missionQrDeleteBtn"),
  missionQrUrlDisplay: document.getElementById("missionQrUrlDisplay"),
  missionQrTableBody: document.getElementById("missionQrTableBody"),
  missionQrRefreshBtn: document.getElementById("missionQrRefreshBtn"),
};

let projectsCache = {};
let currentProjectId = null;
let teamProfiles = {};
let missionConfigs = {};
let activeMissionTeam = null;
let metaLogoUrl = "";
let photoConfigVisible = false;
let metaBackgroundUrl = "";
const selectedProjects = new Set();
const missionAssets = {
  code: [],
  mission: [],
};
let activeAssetType = null;
let assetModalCount = 0;
const missionQrCache = new Map();
let missionQrPreviewDataUrl = null;
let missionQrCurrentCode = null;

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return ch;
    }
  });
}

if (elements.missionCountInput) {
  updateMissionTotal(Number(elements.missionCountInput.value) || missionTotal);
}

function clampMissionCount(value) {
  const num = Number.isFinite(value) ? value : DEFAULT_MISSION_TOTAL;
  return Math.max(1, Math.min(20, num));
}

const projectsRef = ref(db, "projects");

function sanitizeKey(value = "") {
  return value.replace(/[.#$/[\]]/g, "_").trim();
}

function resolveProjectId() {
  if (currentProjectId) return currentProjectId;
  const master = elements.masterPasswordInput.value.trim();
  return sanitizeKey(master);
}

function getProjectIdOrAlert(message = "먼저 마스터 비밀번호를 입력하세요.") {
  const projectId = resolveProjectId();
  if (!projectId) {
    alert(message);
    return null;
  }
  return projectId;
}

init();

function init() {
  initializeMissionState();
  refreshMissionAssetLists();
  renderTeamRows(Number(elements.teamCountInput.value) || defaultTeamCount);
  attachEventHandlers();
  initGlobalControls();
  if (elements.photoConfigToggle) {
    elements.photoConfigToggle.disabled = true;
    elements.photoConfigToggle.setAttribute("aria-expanded", "false");
  }
  onValue(projectsRef, (snapshot) => {
    projectsCache = snapshot.val() || {};
    renderProjectList();
    if (currentProjectId && projectsCache[currentProjectId]) {
      fillForm(currentProjectId);
    }
  });
}

function initializeMissionState() {
  missionConfigs = {};
  for (let i = 1; i <= defaultTeamCount; i++) {
    const teamId = `Team${i}`;
    missionConfigs[teamId] = createDefaultMissionConfig();
  }
}

function attachEventHandlers() {
  elements.newProjectBtn.addEventListener("click", () => {
    clearForm();
    currentProjectId = null;
    if (elements.projectCodeInput) {
      elements.projectCodeInput.focus();
    } else {
      elements.masterPasswordInput.focus();
    }
  });

  if (elements.deleteProjectBtn) {
    elements.deleteProjectBtn.addEventListener("click", handleDeleteProject);
  }

  if (elements.projectForm) {
    elements.projectForm.addEventListener("submit", (event) => {
      event.preventDefault();
    });
  }

  if (elements.selectAllProjects) {
    elements.selectAllProjects.addEventListener("change", (event) => {
      if (event.target.checked) {
        Object.keys(projectsCache).forEach((id) => selectedProjects.add(id));
      } else {
        selectedProjects.clear();
      }
      updateSelectionUI();
    });
  }

  if (elements.missionCountInput) {
    elements.missionCountInput.addEventListener("change", () => {
      const value = Number(elements.missionCountInput.value) || missionTotal;
      updateMissionTotal(value);
      if (elements.missionModal && !elements.missionModal.hidden && activeMissionTeam) {
        renderMissionModalRows(activeMissionTeam);
      }
      if (elements.bulkCodeModal && !elements.bulkCodeModal.hidden && activeMissionTeam) {
        renderBulkCodeRows(activeMissionTeam);
      }
    });
  }

  elements.refreshBtn.addEventListener("click", () => {
    renderProjectList();
  });

  elements.teamCountInput.addEventListener("change", () => {
    const count = Math.max(1, Math.min(30, Number(elements.teamCountInput.value) || defaultTeamCount));
    elements.teamCountInput.value = count;
    renderTeamRows(count);
  });

  if (elements.sharedLogoInput) {
    elements.sharedLogoInput.addEventListener("change", (event) => {
      handleProjectImageUpload(event.target.files?.[0], {
        type: "logo",
        preview: elements.sharedLogoPreview,
      });
    });
  }

  if (elements.backgroundImageInput) {
    elements.backgroundImageInput.addEventListener("change", (event) => {
      handleProjectImageUpload(event.target.files?.[0], {
        type: "background",
        preview: elements.backgroundImagePreview,
      });
    });
  }

  if (elements.missionModalClose) {
    elements.missionModalClose.addEventListener("click", closeMissionModal);
  }
  if (elements.missionModalCancel) {
    elements.missionModalCancel.addEventListener("click", closeMissionModal);
  }
  if (elements.missionModalSave) {
    elements.missionModalSave.addEventListener("click", saveMissionConfiguration);
  }
  if (elements.missionModal) {
    elements.missionModal.addEventListener("click", (event) => {
      if (event.target === elements.missionModal) {
        closeMissionModal();
      }
    });
  }

  if (elements.photoConfigToggle) {
    elements.photoConfigToggle.addEventListener("click", () => {
      if (!activeMissionTeam) {
        alert("먼저 팀을 선택하세요.");
        return;
      }
      togglePhotoConfigPanel();
    });
  }
  if (elements.photoConfigClose) {
    elements.photoConfigClose.addEventListener("click", () => {
      closePhotoConfigPanel();
    });
  }
  if (elements.photoConfigSelect) {
    elements.photoConfigSelect.addEventListener("change", () => {
      updatePhotoConfigPreview(activeMissionTeam);
    });
  }
  if (elements.photoConfigApply) {
    elements.photoConfigApply.addEventListener("click", () => {
      handlePhotoConfigApply();
    });
  }
  if (elements.photoConfigClear) {
    elements.photoConfigClear.addEventListener("click", () => {
      handlePhotoConfigClear();
    });
  }

  if (elements.bulkCodeButton) {
    elements.bulkCodeButton.addEventListener("click", openBulkCodeModal);
    elements.bulkCodeButton.disabled = false;
  }
  if (elements.bulkCodeModalClose) {
    elements.bulkCodeModalClose.addEventListener("click", closeBulkCodeModal);
  }
  if (elements.bulkCodeModalCancel) {
    elements.bulkCodeModalCancel.addEventListener("click", closeBulkCodeModal);
  }
  if (elements.bulkCodeModalApply) {
    elements.bulkCodeModalApply.addEventListener("click", applyBulkCodesFromModal);
  }
  if (elements.bulkCodeModal) {
    elements.bulkCodeModal.addEventListener("click", (event) => {
      if (event.target === elements.bulkCodeModal) {
        closeBulkCodeModal();
      }
    });
  }

  if (elements.assetManageButtons) {
    elements.assetManageButtons.forEach((button) => {
      button.addEventListener("click", () => openAssetModal(button.dataset.assetType));
    });
  }

  if (elements.assetModalClose) {
    elements.assetModalClose.addEventListener("click", closeAssetModal);
  }
  if (elements.assetModalCancel) {
    elements.assetModalCancel.addEventListener("click", closeAssetModal);
  }
  if (elements.assetModal) {
    elements.assetModal.addEventListener("click", (event) => {
      if (event.target === elements.assetModal) {
        closeAssetModal();
      }
    });
  }
  if (elements.assetCountInput) {
    elements.assetCountInput.addEventListener("change", () => {
      const value = Math.min(50, Math.max(1, Number(elements.assetCountInput.value) || 1));
      assetModalCount = value;
      elements.assetCountInput.value = value;
      renderAssetModalRows();
    });
  }

  attachPickerButton(elements.educationDateBtn, elements.educationDateInput);
  attachPickerButton(elements.educationTimeBtn, elements.educationTimeInput);

  if (elements.projectPagePrev) {
    elements.projectPagePrev.addEventListener("click", () => changeProjectPage(-1));
  }
  if (elements.projectPageNext) {
    elements.projectPageNext.addEventListener("click", () => changeProjectPage(1));
  }

  elements.saveBtn.addEventListener("click", handleSaveProject);
  elements.resetBtn.addEventListener("click", handleResetResults);
  elements.openHQBtn.addEventListener("click", () => {
    const projectId = getProjectIdOrAlert("먼저 프로젝트를 선택하거나 저장하세요.");
    if (!projectId || !projectsCache[projectId]) {
      alert("먼저 프로젝트를 선택하거나 저장하세요.");
      return;
    }
    const meta = projectsCache[projectId]?.meta || {};
    storeProjectContext({
      projectId,
      projectName: meta.name || projectId,
      projectSubtitle: meta.subtitle || "",
      educationAt: meta.educationAt || meta.startAt || null,
      backgroundUrl: meta.backgroundUrl || "",
      logoUrl: meta.logoUrl || meta.dashboardLogoUrl || meta.loginLogoUrl || "",
      teamCount: meta.teamCount || Number(elements.teamCountInput.value) || 0,
    });
    window.open(`/hq.html?project=${encodeURIComponent(projectId)}`, "_blank");
  });
}

function initGlobalControls() {
  if (elements.editGlobalMasterPassBtn) {
    elements.editGlobalMasterPassBtn.addEventListener("click", () => toggleGlobalMasterPassEdit(true));
  }
  if (elements.saveGlobalMasterPassBtn) {
    elements.saveGlobalMasterPassBtn.addEventListener("click", handleSaveGlobalMasterPass);
  }
  if (elements.cancelGlobalMasterPassBtn) {
    elements.cancelGlobalMasterPassBtn.addEventListener("click", () => {
      if (elements.globalMasterPassInput) {
        elements.globalMasterPassInput.value = globalMasterPass;
      }
      toggleGlobalMasterPassEdit(false);
    });
  }
  if (elements.missionQrManageBtn) {
    elements.missionQrManageBtn.addEventListener("click", openMissionQrModal);
  }
  if (elements.qrManagerClose) {
    elements.qrManagerClose.addEventListener("click", closeMissionQrModal);
  }
  if (elements.qrManagerModal) {
    elements.qrManagerModal.addEventListener("click", (event) => {
      if (event.target === elements.qrManagerModal) {
        closeMissionQrModal();
      }
    });
  }
  if (elements.missionQrGenerateBtn) {
    elements.missionQrGenerateBtn.addEventListener("click", handleMissionQrGenerate);
  }
  if (elements.missionQrDownloadBtn) {
    elements.missionQrDownloadBtn.addEventListener("click", () => {
      if (missionQrPreviewDataUrl && missionQrCurrentCode) {
        triggerDownload(missionQrPreviewDataUrl, `${missionQrCurrentCode}-qr`);
      }
    });
  }
  if (elements.missionQrPrintBtn) {
    elements.missionQrPrintBtn.addEventListener("click", handleMissionQrPrint);
  }
  if (elements.missionQrDeleteBtn) {
    elements.missionQrDeleteBtn.addEventListener("click", () => handleMissionQrDelete(missionQrCurrentCode));
  }
  if (elements.missionQrRefreshBtn) {
    elements.missionQrRefreshBtn.addEventListener("click", loadMissionQrLibrary);
  }
  if (elements.missionQrTableBody) {
    elements.missionQrTableBody.addEventListener("click", handleMissionQrTableAction);
  }
  toggleGlobalMasterPassEdit(false);
  loadGlobalMasterPassSetting();
}

function toggleGlobalMasterPassEdit(active) {
  if (elements.globalMasterPassView) {
    elements.globalMasterPassView.hidden = active;
  }
  if (elements.globalMasterPassEdit) {
    elements.globalMasterPassEdit.hidden = !active;
    if (!elements.globalMasterPassEdit.hidden && elements.globalMasterPassInput) {
      elements.globalMasterPassInput.focus();
      elements.globalMasterPassInput.select();
    }
  }
}

function sanitizeMasterPassValue(value = "") {
  const trimmed = value.trim();
  return trimmed || DEFAULT_MASTER_PASS;
}

async function loadGlobalMasterPassSetting() {
  try {
    const snapshot = await getDoc(adminConfigDoc);
    const data = snapshot.exists() ? snapshot.data() || {} : {};
    globalMasterPass = sanitizeMasterPassValue(data.missionMasterPass || DEFAULT_MASTER_PASS);
  } catch (error) {
    console.error("마스터 정답을 불러오지 못했습니다.", error);
    await loadGlobalMasterPassFromRealtime();
  }
  if (elements.globalMasterPassValue) {
    elements.globalMasterPassValue.textContent = globalMasterPass;
  }
  if (elements.globalMasterPassInput) {
    elements.globalMasterPassInput.value = globalMasterPass;
  }
  toggleGlobalMasterPassEdit(false);
}

async function handleSaveGlobalMasterPass() {
  if (!elements.globalMasterPassInput) return;
  const value = sanitizeMasterPassValue(elements.globalMasterPassInput.value);
  try {
    await setDoc(adminConfigDoc, { missionMasterPass: value }, { merge: true });
    globalMasterPass = value;
    if (elements.globalMasterPassValue) {
      elements.globalMasterPassValue.textContent = globalMasterPass;
    }
    alert("마스터 정답이 저장되었습니다.");
    toggleGlobalMasterPassEdit(false);
  } catch (error) {
    console.error("마스터 정답 저장 중 오류", error);
    const fallbackSaved = await saveGlobalMasterPassRealtime(value);
    if (fallbackSaved) {
      globalMasterPass = value;
      if (elements.globalMasterPassValue) {
        elements.globalMasterPassValue.textContent = globalMasterPass;
      }
      alert("마스터 정답이 실시간 DB에 저장되었습니다.");
      toggleGlobalMasterPassEdit(false);
    } else {
      alert("마스터 정답을 저장하지 못했습니다.");
    }
  }
}

async function loadGlobalMasterPassFromRealtime() {
  try {
    const snap = await get(ref(db, "adminSettings/config/missionMasterPass"));
    const val = snap?.val?.();
    if (val) {
      globalMasterPass = sanitizeMasterPassValue(String(val));
    } else {
      globalMasterPass = DEFAULT_MASTER_PASS;
    }
  } catch (error) {
    console.error("실시간 DB에서 마스터 정답을 불러오지 못했습니다.", error);
    globalMasterPass = DEFAULT_MASTER_PASS;
  }
}

async function saveGlobalMasterPassRealtime(value) {
  try {
    await update(ref(db, "adminSettings/config"), {
      missionMasterPass: value,
      missionMasterPassUpdatedAt: Date.now(),
    });
    return true;
  } catch (error) {
    console.error("실시간 DB에 마스터 정답 저장 실패", error);
    return false;
  }
}

function openMissionQrModal() {
  if (!elements.qrManagerModal) return;
  elements.qrManagerModal.hidden = false;
  elements.qrManagerModal.classList.add("active");
  resetMissionQrPreview();
  loadMissionQrLibrary();
  elements.missionQrCodeInput?.focus();
}

function closeMissionQrModal() {
  if (!elements.qrManagerModal) return;
  elements.qrManagerModal.classList.remove("active");
  elements.qrManagerModal.hidden = true;
  resetMissionQrPreview();
}

function resetMissionQrPreview() {
  missionQrPreviewDataUrl = null;
  missionQrCurrentCode = null;
  if (elements.missionQrPreview) {
    elements.missionQrPreview.innerHTML = "<span>미리보기 없음</span>";
  }
  if (elements.missionQrUrlDisplay) {
    elements.missionQrUrlDisplay.textContent = "-";
  }
  setMissionQrActionState(true);
}

function setMissionQrActionState(disabled) {
  const flag = Boolean(disabled);
  if (elements.missionQrDownloadBtn) elements.missionQrDownloadBtn.disabled = flag;
  if (elements.missionQrPrintBtn) elements.missionQrPrintBtn.disabled = flag;
  if (elements.missionQrDeleteBtn) elements.missionQrDeleteBtn.disabled = flag;
}

function normalizeMissionQrCode(value = "") {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

function buildMissionQrUrl(code) {
  const origin = window.location.origin.replace(/\/$/, "");
  return `${origin}/qr-pass?code=${encodeURIComponent(code)}`;
}

async function handleMissionQrGenerate() {
  const code = normalizeMissionQrCode(elements.missionQrCodeInput?.value || "");
  if (!code) {
    alert("imageId를 입력하세요.");
    return;
  }
  const url = buildMissionQrUrl(code);
  const dataUrl = await renderMissionQrPreview(url);
  if (!dataUrl) {
    alert("QR 이미지를 생성하지 못했습니다.");
    return;
  }
  missionQrCurrentCode = code;
  missionQrPreviewDataUrl = dataUrl;
  if (elements.missionQrUrlDisplay) {
    elements.missionQrUrlDisplay.textContent = url;
  }
  setMissionQrActionState(false);
  await saveMissionQrRecord(code, url, dataUrl);
  await loadMissionQrLibrary();
}

async function renderMissionQrPreview(url) {
  if (!elements.missionQrPreview) return null;
  elements.missionQrPreview.innerHTML = "";
  try {
    new QRCode(elements.missionQrPreview, {
      text: url,
      width: 220,
      height: 220,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H,
    });
    const canvas = elements.missionQrPreview.querySelector("canvas");
    return canvas ? canvas.toDataURL("image/png") : null;
  } catch (error) {
    console.error("QR 미리보기 생성 오류", error);
    return null;
  }
}

async function saveMissionQrRecord(code, url, dataUrl) {
  const payload = {
    code,
    url,
    qrImage: dataUrl,
    createdAt: Date.now(),
  };
  try {
    await setDoc(doc(firestore, "qrLibrary", code), payload, { merge: true });
    missionQrCache.set(code, payload);
  } catch (error) {
    console.error("QR 저장 오류", error);
    try {
      await update(ref(db, `qrLibrary/${code}`), payload);
      missionQrCache.set(code, payload);
      alert("QR을 실시간 DB에 저장했습니다.");
    } catch (rtError) {
      console.error("실시간 DB QR 저장 실패", rtError);
      alert("QR 데이터를 저장하지 못했습니다.");
    }
  }
}

async function ensureMissionQrExists(code) {
  if (!code) return;
  const url = buildMissionQrUrl(code);
  const payload = {
    code,
    url,
    qrImage: null,
    createdAt: Date.now(),
  };
  try {
    await setDoc(doc(firestore, "qrLibrary", code), payload, { merge: true });
  } catch (error) {
    console.warn("미션 QR Firestore 저장 실패, 실시간 DB로 시도합니다.", error);
    try {
      await update(ref(db, `qrLibrary/${code}`), payload);
    } catch (rtError) {
      console.error("미션 QR 실시간 DB 저장 실패", rtError);
    }
  }
}

async function loadMissionQrLibrary() {
  if (!elements.missionQrTableBody) return;
  try {
    const snapshot = await getDocs(qrLibraryCollection);
    const entries = [];
    missionQrCache.clear();
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const record = {
        code: data.code || docSnap.id,
        url: data.url || buildMissionQrUrl(docSnap.id),
        qrImage: data.qrImage || null,
        createdAt: data.createdAt || 0,
      };
      missionQrCache.set(record.code, record);
      entries.push(record);
    });
    entries.sort((a, b) => b.createdAt - a.createdAt);
    renderMissionQrTable(entries);
  } catch (error) {
    console.error("QR 목록 로드 오류", error);
    await loadMissionQrLibraryRealtime();
  }
}

async function loadMissionQrLibraryRealtime() {
  if (!elements.missionQrTableBody) return;
  try {
    const snap = await get(ref(db, "qrLibrary"));
    const data = snap?.val?.() || {};
    const entries = Object.entries(data).map(([id, value]) => ({
      code: value?.code || id,
      url: value?.url || buildMissionQrUrl(id),
      qrImage: value?.qrImage || null,
      createdAt: value?.createdAt || 0,
    }));
    missionQrCache.clear();
    entries.forEach((entry) => missionQrCache.set(entry.code, entry));
    entries.sort((a, b) => b.createdAt - a.createdAt);
    renderMissionQrTable(entries);
  } catch (error) {
    console.error("실시간 DB에서 QR 목록을 불러오지 못했습니다.", error);
    elements.missionQrTableBody.innerHTML = `<tr><td colspan="4">QR 목록을 불러오지 못했습니다.</td></tr>`;
  }
}

function renderMissionQrTable(entries = []) {
  if (!elements.missionQrTableBody) return;
  if (!entries.length) {
    elements.missionQrTableBody.innerHTML = `<tr><td colspan="4">등록된 QR이 없습니다.</td></tr>`;
    return;
  }
  const rows = entries
    .map((entry) => {
      const safeCode = escapeHtml(entry.code);
      const imgHtml = entry.qrImage
        ? `<img src="${entry.qrImage}" alt="${safeCode} QR">`
        : "-";
      return `
        <tr>
          <td>${safeCode}</td>
          <td>${imgHtml}</td>
          <td><code>${escapeHtml(entry.url)}</code></td>
          <td>
            <div class="qr-row-actions">
              <button type="button" class="btn btn-secondary btn-small" data-action="download" data-code="${safeCode}">다운로드</button>
              <button type="button" class="btn btn-secondary btn-small" data-action="print" data-code="${safeCode}">인쇄</button>
              <button type="button" class="btn btn-danger btn-small" data-action="delete" data-code="${safeCode}">삭제</button>
            </div>
          </td>
        </tr>`;
    })
    .join("");
  elements.missionQrTableBody.innerHTML = rows;
}

function handleMissionQrTableAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const code = button.dataset.code;
  const entry = missionQrCache.get(code);
  if (!code || !entry) return;
  if (button.dataset.action === "download" && entry.qrImage) {
    triggerDownload(entry.qrImage, `${code}-qr`);
    return;
  }
  if (button.dataset.action === "print" && entry.qrImage) {
    handleMissionQrPrint(entry.qrImage, code);
    return;
  }
  if (button.dataset.action === "delete") {
    handleMissionQrDelete(code);
    event.stopPropagation();
  }
}

function handleMissionQrPrint(dataUrl = missionQrPreviewDataUrl, code = missionQrCurrentCode) {
  if (!dataUrl || !code) return;
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(`
    <html>
      <head><title>${code} QR</title></head>
      <body style="display:flex;align-items:center;justify-content:center;height:100vh;">
        <img src="${dataUrl}" alt="${code} QR" style="width:420px;height:420px;" />
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

async function handleMissionQrDelete(code) {
  if (!code) {
    alert("삭제할 QR을 선택하세요.");
    return;
  }
  if (!confirm(`${code} QR을 삭제할까요?`)) return;
  try {
    await deleteDoc(doc(firestore, "qrLibrary", code));
    missionQrCache.delete(code);
    if (missionQrCurrentCode === code) {
      resetMissionQrPreview();
    }
    await loadMissionQrLibrary();
  } catch (error) {
    console.error("QR 삭제 오류", error);
    alert("QR을 삭제하지 못했습니다.");
  }
}

async function handleDeleteProject() {
  if (selectedProjects.size === 0) {
    alert("삭제할 프로젝트를 체크하세요.");
    return;
  }
  const names = Array.from(selectedProjects).map((id) => projectsCache[id]?.meta?.name || id);
  if (!confirm(`${names.join(", ")} 프로젝트를 삭제하시겠습니까?`)) return;
  if (!confirm("삭제 후에는 복구할 수 없습니다. 진행할까요?")) return;

  const updates = {};
  selectedProjects.forEach((projectId) => {
    updates[`projects/${projectId}`] = null;
    updates[`uploads_meta/${projectId}`] = null;
    updates[`chat/${projectId}`] = null;
  });

  try {
    await update(ref(db), updates);
    selectedProjects.forEach((id) => delete projectsCache[id]);
    if (selectedProjects.has(currentProjectId)) {
      currentProjectId = null;
      clearForm();
    }
    selectedProjects.clear();
    alert("선택한 프로젝트가 삭제되었습니다.");
    renderProjectList();
  } catch (error) {
    console.error(error);
    alert("프로젝트 삭제 중 오류가 발생했습니다.");
  }
}

function renderProjectList() {
  Array.from(selectedProjects).forEach((id) => {
    if (!projectsCache[id]) selectedProjects.delete(id);
  });
  const entries = Object.entries(projectsCache);
  const totalPages = Math.max(1, Math.ceil(entries.length / PROJECT_PAGE_SIZE));
  if (currentProjectPage > totalPages) currentProjectPage = totalPages;
  if (currentProjectPage < 1) currentProjectPage = 1;
  const startIndex = (currentProjectPage - 1) * PROJECT_PAGE_SIZE;
  const pageEntries = entries.slice(startIndex, startIndex + PROJECT_PAGE_SIZE);

  const rows = pageEntries.map(([id, project]) => {
    const meta = project.meta || {};
    const status = meta.status || "planned";
    const educationLabel = meta.educationAt ? formatDateOnly(meta.educationAt) : "-";
    return `
      <tr data-project="${id}">
        <td><input type="checkbox" class="project-select" data-project="${id}" ${selectedProjects.has(id) ? "checked" : ""}></td>
        <td><span class="project-id-pill">${escapeHtml(meta.projectCode || id)}</span></td>
        <td>${escapeHtml(meta.masterPassword || "-")}</td>
        <td>${educationLabel}</td>
        <td>${renderStatusTag(status)}</td>
      </tr>
    `;
  });
  elements.projectTableBody.innerHTML =
    rows.join("") || "<tr><td colspan='5'>등록된 프로젝트가 없습니다.</td></tr>";
  elements.projectTableBody.querySelectorAll("tr[data-project]").forEach((row) => {
    row.addEventListener("click", (event) => {
      const checkbox = event.target.closest(".project-select");
      if (checkbox) {
        toggleSelection(checkbox.dataset.project, checkbox.checked);
        event.stopPropagation();
        return;
      }
      fillForm(row.dataset.project);
    });
  });
  markActiveProjectRow();
  updateSelectionUI();
  renderProjectPagination(totalPages, entries.length);
  renderProjectQrDisplay();
}

function updateMissionTotal(value) {
  missionTotal = clampMissionCount(value);
  if (elements.missionCountInput) {
    elements.missionCountInput.value = missionTotal;
  }
  Object.keys(missionConfigs).forEach((teamId) => ensureMissionConfig(teamId));
  if (elements.teamCountInput) {
    renderTeamRows(Number(elements.teamCountInput.value) || defaultTeamCount);
  }
  if (elements.missionModal && !elements.missionModal.hidden && activeMissionTeam) {
    renderMissionModalRows(activeMissionTeam);
  }
  if (elements.bulkCodeModal && !elements.bulkCodeModal.hidden && activeMissionTeam) {
    if (elements.bulkCodeModalDesc) {
      elements.bulkCodeModalDesc.textContent = `현재 미션 수 ${missionTotal}개에 대해 코드를 입력하세요.`;
    }
    renderBulkCodeRows(activeMissionTeam);
  }
}

function toggleSelection(projectId, checked) {
  if (!projectId) return;
  if (checked) selectedProjects.add(projectId);
  else selectedProjects.delete(projectId);
  updateSelectionUI();
}

function updateSelectionUI() {
  if (elements.selectAllProjects) {
    const total = Object.keys(projectsCache).length;
    elements.selectAllProjects.checked = total > 0 && selectedProjects.size === total;
    elements.selectAllProjects.indeterminate = selectedProjects.size > 0 && selectedProjects.size < total;
  }
  document.querySelectorAll(".project-select").forEach((checkbox) => {
    checkbox.checked = selectedProjects.has(checkbox.dataset.project);
  });
  elements.projectTableBody?.querySelectorAll("tr[data-project]").forEach((row) => {
    row.classList.toggle("selected", selectedProjects.has(row.dataset.project));
  });
  markActiveProjectRow();
}

function markActiveProjectRow() {
  if (!elements.projectTableBody) return;
  elements.projectTableBody.querySelectorAll("tr[data-project]").forEach((row) => {
    row.classList.toggle("active", row.dataset.project === currentProjectId);
  });
}

function changeProjectPage(delta) {
  const entries = Object.entries(projectsCache || {});
  const totalPages = Math.max(1, Math.ceil(entries.length / PROJECT_PAGE_SIZE));
  currentProjectPage = Math.min(totalPages, Math.max(1, currentProjectPage + delta));
  renderProjectList();
}

function renderProjectPagination(totalPages, totalItems) {
  if (!elements.projectPageInfo) return;
  elements.projectPageInfo.textContent = `${currentProjectPage} / ${totalPages}`;
  if (elements.projectPagePrev) {
    elements.projectPagePrev.disabled = currentProjectPage <= 1;
  }
  if (elements.projectPageNext) {
    elements.projectPageNext.disabled = currentProjectPage >= totalPages;
  }
}

function renderProjectQrDisplay(projectId = currentProjectId) {
  const box = elements.projectQrBox;
  const openBtn = elements.qrOpenBtn;
  const downloadBtn = elements.qrDownloadBtn;
  const linkEl = elements.qrInlineLink;
  if (!box || !openBtn || !downloadBtn || !linkEl) return;

  const resetDisplay = () => {
    box.innerHTML = "<span class=\"qr-note\">프로젝트를 선택하면 QR이 표시됩니다.</span>";
    linkEl.textContent = "-";
    openBtn.disabled = true;
    downloadBtn.disabled = true;
    openBtn.onclick = null;
    downloadBtn.onclick = null;
  };

  if (!projectId || !projectsCache[projectId]) {
    resetDisplay();
    return;
  }

  const link = buildTeamLoginUrl(projectId);
  box.innerHTML = "";
  if (typeof QRCode === "function") {
    new QRCode(box, {
      text: link,
      width: 120,
      height: 120,
    });
  } else {
    box.textContent = "QR 라이브러리를 불러올 수 없습니다.";
  }
  linkEl.textContent = link;
  openBtn.disabled = false;
  downloadBtn.disabled = false;
  openBtn.onclick = () => window.open(link, "_blank");
  downloadBtn.onclick = () => downloadQrImage(box, `${projectId}-login`);
}

function buildTeamLoginUrl(projectId) {
  const safeId = encodeURIComponent(projectId);
  const origin = window.location.origin;
  if (origin && origin !== "null") {
    const trimmed = origin.endsWith("/") ? origin.slice(0, -1) : origin;
    return `${trimmed}/team_login.html?project=${safeId}`;
  }
  return `./team_login.html?project=${safeId}`;
}

function downloadQrImage(container, filename) {
  const img = container.querySelector("img");
  if (img && img.src) {
    triggerDownload(img.src, filename);
    return;
  }
  const canvas = container.querySelector("canvas");
  if (canvas) {
    triggerDownload(canvas.toDataURL("image/png"), filename);
  }
}

function triggerDownload(dataUrl, filename = "qr-code") {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `${filename}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function renderStatusTag(status) {
  switch (status) {
    case "running":
      return `<span class="status-tag status-running">진행중</span>`;
    case "finished":
      return `<span class="status-tag status-finished">종료</span>`;
    default:
      return `<span class="status-tag status-planned">준비중</span>`;
  }
}

function clearForm() {
  currentProjectId = null;
  teamProfiles = {};
  missionConfigs = {};
  metaLogoUrl = "";
  metaBackgroundUrl = "";
  missionAssets.code = [];
  missionAssets.mission = [];
  refreshMissionAssetLists();
  document.getElementById("projectForm").reset();
  elements.teamCountInput.value = defaultTeamCount;
  missionTotal = DEFAULT_MISSION_TOTAL;
  if (elements.missionCountInput) elements.missionCountInput.value = missionTotal;
  renderTeamRows(defaultTeamCount);
  if (elements.masterPasswordInput) elements.masterPasswordInput.value = "";
  if (elements.sharedLogoPreview) elements.sharedLogoPreview.src = "";
  if (elements.backgroundImagePreview) elements.backgroundImagePreview.src = "";
  if (elements.projectSubtitleInput) elements.projectSubtitleInput.value = "";
  if (elements.projectCodeInput) elements.projectCodeInput.value = "";
  setEducationInputs(null);
  setActiveMissionTeam(null);
  renderProjectQrDisplay(null);
}

function fillForm(projectId) {
  const project = projectsCache[projectId];
  if (!project) return;
  currentProjectId = projectId;
  const meta = project.meta || {};
  elements.projectNameInput.value = meta.name || "";
  if (elements.projectSubtitleInput) {
    elements.projectSubtitleInput.value = meta.subtitle || "";
  }
  if (elements.projectCodeInput) {
    elements.projectCodeInput.value = meta.projectCode || "";
  }
  elements.masterPasswordInput.value = meta.masterPassword || "";
  setEducationInputs(meta.educationAt || meta.startAt || meta.endAt || null);
  elements.organizerInput.value = meta.organizer || "";
  elements.venueInput.value = meta.venue || "";
  elements.participantInput.value = meta.participantCount || "";
  elements.teamCountInput.value = meta.teamCount || Object.keys(project.teams || {}).length || defaultTeamCount;
  missionTotal = clampMissionCount(meta.missionTotal || DEFAULT_MISSION_TOTAL);
  if (elements.missionCountInput) elements.missionCountInput.value = missionTotal;
  metaLogoUrl = meta.logoUrl || meta.loginLogoUrl || meta.dashboardLogoUrl || "";
  if (elements.sharedLogoPreview) elements.sharedLogoPreview.src = metaLogoUrl || "";
  metaBackgroundUrl = meta.backgroundUrl || "";
  if (elements.backgroundImagePreview) elements.backgroundImagePreview.src = metaBackgroundUrl || "";

  teamProfiles = {};
  Object.entries(project.teams || {}).forEach(([teamId, teamData]) => {
    teamProfiles[teamId] = {
      name:
        teamData.profile?.teamDisplayName ||
        teamData.profile?.officialTeamName ||
        teamData.profile?.name ||
        teamId.replace("Team", "") + "팀",
      password: teamData.profile?.password || "",
    };
  });
  renderTeamRows(Number(elements.teamCountInput.value) || defaultTeamCount);

  loadMissionConfigs(project);
  loadMissionAssets(project);
  renderProjectQrDisplay(projectId);
  markActiveProjectRow();
}

function renderTeamRows(count) {
  const rows = [];
  for (let i = 1; i <= count; i++) {
    const teamId = `Team${i}`;
    if (!teamProfiles[teamId]) {
      teamProfiles[teamId] = { name: `${i}팀`, password: `T${i}` };
    } else {
      if (!teamProfiles[teamId].name) teamProfiles[teamId].name = `${i}팀`;
      if (!teamProfiles[teamId].password) teamProfiles[teamId].password = `T${i}`;
    }
    const profile = teamProfiles[teamId];
    const safeName = escapeHtml(profile.name || `${i}팀`);
    const safePassword = escapeHtml(profile.password || `T${i}`);
    ensureMissionConfig(teamId);
    rows.push(`
      <tr data-team-id="${teamId}">
        <td>${i}팀</td>
        <td><input value="${safeName}" placeholder="공식 팀명 (예: ${i}팀)" /></td>
        <td><input value="${safePassword}" placeholder="비밀번호" /></td>
        <td><button type="button" class="mission-config-btn" data-team-id="${teamId}">입력</button></td>
        <td class="team-status">${renderTeamStatusBadge(teamId)}</td>
      </tr>
    `);
  }
  elements.teamTableBody.innerHTML = rows.join("");
  Object.keys(teamProfiles).forEach((key) => {
    const idx = parseInt(key.replace("Team", ""), 10);
    if (!Number.isFinite(idx) || idx > count) {
      delete teamProfiles[key];
    }
  });
  Object.keys(missionConfigs).forEach((key) => {
    const idx = parseInt(key.replace("Team", ""), 10);
    if (Number.isFinite(idx) && idx > count) {
      delete missionConfigs[key];
    }
  });
  attachTeamNameWatchers();
  attachMissionButtons();
  if (activeMissionTeam && !teamProfiles[activeMissionTeam]) {
    activeMissionTeam = null;
  }
  setActiveMissionTeam(activeMissionTeam);
}

function renderTeamStatusBadge(teamId) {
  if (isTeamMissionComplete(teamId)) {
    return `<span class="status-tag status-complete">완료</span>`;
  }
  return `<span class="status-tag status-pending">미완료</span>`;
}

function updateTeamStatusDisplay(teamId) {
  if (!teamId || !elements.teamTableBody) return;
  const row = elements.teamTableBody.querySelector(`tr[data-team-id="${teamId}"]`);
  if (!row) return;
  const cell = row.querySelector(".team-status");
  if (cell) {
    cell.innerHTML = renderTeamStatusBadge(teamId);
  }
}

function isTeamMissionComplete(teamId) {
  const config = ensureMissionConfig(teamId);
  for (let i = 1; i <= missionTotal; i++) {
    if (!isMissionEntryComplete(config[i])) {
      return false;
    }
  }
  return true;
}

function isMissionEntryComplete(entry = {}) {
  const answerValue = getMissionAnswerValue(entry);
  return Boolean(answerValue && entry.missionImageUrl);
}

function getMissionAnswerValue(entry = {}) {
  return (entry.missionAnswer || entry.answerCode || "").trim();
}

function attachMissionButtons() {
  elements.teamTableBody.querySelectorAll(".mission-config-btn").forEach((button) => {
    button.addEventListener("click", () => openMissionModal(button.dataset.teamId));
  });
}

function attachTeamNameWatchers() {
  if (!elements.teamTableBody) return;
  elements.teamTableBody.querySelectorAll("tr[data-team-id]").forEach((row) => {
    const teamId = row.dataset.teamId;
    const nameInput = row.querySelector("td:nth-child(2) input");
    if (!nameInput) return;
    nameInput.addEventListener("input", () => {
      updateTeamStatusDisplay(teamId);
    });
  });
}

function createDefaultMissionConfig() {
  const config = {};
  for (let i = 1; i <= missionTotal; i++) {
    config[i] = createDefaultMissionEntry();
  }
  return config;
}

function createDefaultMissionEntry() {
  return {
    answerAssetId: "",
    answerCode: "",
    answerImageUrl: "",
    codeAnswer: "",
    missionAnswer: "",
    codeImageUrl: "",
    missionImageUrl: "",
    photoSlots: 0,
    specialSlots: 0,
    photoTarget: "",
  };
}

function describePhotoSlotStatus(entry = {}) {
  const target = entry.photoTarget || "";
  if (target === "code") return "코드 사진 미션";
  if (target === "mission") return "미션 사진 미션";
  const photoCount = Number(entry.photoSlots) || 0;
  const specialCount = Number(entry.specialSlots) || 0;
  if (photoCount + specialCount <= 0) {
    return "사진 미션 미설정";
  }
  return `사진 ${photoCount}개 · 스페셜 ${specialCount}개`;
}

function hasPhotoRequirement(entry = {}) {
  const slots = (Number(entry.photoSlots) || 0) + (Number(entry.specialSlots) || 0);
  return Boolean(entry.photoTarget) || slots > 0;
}

function updateThumbBadge(container, enabled) {
  if (!container) return;
  container.classList.toggle("photo-selected", enabled);
  let badge = container.querySelector(".thumb-badge");
  if (enabled) {
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "thumb-badge";
      badge.textContent = "사진 미션";
      container.appendChild(badge);
    }
  } else if (badge) {
    badge.remove();
  }
}

function ensureMissionConfig(teamId) {
  if (!missionConfigs[teamId]) {
    missionConfigs[teamId] = createDefaultMissionConfig();
  }
  const config = missionConfigs[teamId];
  for (let i = 1; i <= missionTotal; i++) {
    if (!config[i]) config[i] = createDefaultMissionEntry();
  }
  Object.keys(config).forEach((key) => {
    if (Number(key) > missionTotal) delete config[key];
  });
  return config;
}

function normalizeMissionConfig(source = {}) {
  const base = createDefaultMissionConfig();
  const total = missionTotal;
  for (let i = 1; i <= total; i++) {
    if (source[i]) {
      base[i] = { ...base[i], ...source[i] };
    }
  }
  return base;
}

function loadMissionConfigs(project = {}) {
  missionConfigs = {};
  Object.entries(project.teams || {}).forEach(([teamId, teamData]) => {
    missionConfigs[teamId] = normalizeMissionConfig(teamData.config?.missions || {});
  });
}

function loadMissionAssets(project = {}) {
  const assets = project.assets || {};
  missionAssets.code = normalizeAssetList(assets.codeImages);
  missionAssets.mission = normalizeAssetList(assets.missionImages);
  refreshMissionAssetLists();
}

function normalizeAssetList(assetMap = {}) {
  return Object.entries(assetMap || {})
    .map(([id, data]) => ({
      id,
      url: data?.url || "",
      name: data?.name || data?.originalName || `이미지 ${id.slice(-4)}`,
      path: data?.path || "",
      createdAt: data?.createdAt || 0,
      order: data?.order || data?.createdAt || 0,
    }))
    .filter((asset) => asset.url)
    .sort((a, b) => {
      const orderDiff = (a.order || 0) - (b.order || 0);
      if (orderDiff !== 0) return orderDiff;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
}

function refreshMissionAssetLists() {
  updateAssetSummary("code");
  updateAssetSummary("mission");
  if (elements.assetModal && !elements.assetModal.hidden && activeAssetType) {
    renderAssetModalRows();
  }
  if (elements.missionModal && !elements.missionModal.hidden && activeMissionTeam) {
    renderMissionModalRows(activeMissionTeam);
  }
}

function updateAssetSummary(type) {
  const target =
    type === "mission" ? elements.missionAssetSummary : elements.codeAssetSummary;
  if (!target) return;
  const library = missionAssets[type] || [];
  const count = library.length;
  target.textContent = count ? `${count}개 등록됨` : "등록된 이미지가 없습니다.";
}

function formatAssetLabel(asset = {}) {
  const base = asset.name || "이미지";
  if (base.length <= 18) return base;
  return `${base.slice(0, 15)}…`;
}

function attachPickerButton(button, input) {
  if (!button || !input) return;
  button.addEventListener("click", () => {
    if (typeof input.showPicker === "function") input.showPicker();
    else input.focus();
  });
}

function openAssetModal(type = "code") {
  const normalized = type === "mission" ? "mission" : "code";
  activeAssetType = normalized;
  const assets = missionAssets[normalized] || [];
  assetModalCount = Math.max(1, assets.length || 1);
  if (elements.assetCountInput) {
    elements.assetCountInput.value = assetModalCount;
  }
  if (elements.assetModalTitle) {
    const label = normalized === "mission" ? "미션 이미지" : "코드 이미지";
    elements.assetModalTitle.textContent = `${label} 라이브러리 관리`;
  }
  renderAssetModalRows();
  elements.assetModal?.classList.add("active");
  if (elements.assetModal) elements.assetModal.hidden = false;
}

function closeAssetModal() {
  if (!elements.assetModal) return;
  elements.assetModal.classList.remove("active");
  elements.assetModal.hidden = true;
  activeAssetType = null;
}

function renderAssetModalRows() {
  if (!elements.assetSlotList) return;
  if (!activeAssetType) {
    elements.assetSlotList.innerHTML =
      "<div class=\"asset-empty\">관리할 라이브러리를 먼저 선택하세요.</div>";
    return;
  }
  const library = missionAssets[activeAssetType] || [];
  const count = Math.max(1, assetModalCount || library.length || 1);
  assetModalCount = count;
  if (elements.assetCountInput) {
    elements.assetCountInput.value = count;
  }
  const rows = [];
  for (let i = 0; i < count; i++) {
    const slotOrder = i + 1;
    const asset =
      getAssetByOrder(activeAssetType, slotOrder) || library[i] || null;
    const hasImage = Boolean(asset?.url);
    rows.push(`
      <div class="asset-slot" data-slot="${i}" data-order="${slotOrder}" data-asset-id="${
        asset?.id || ""
      }">
        <div class="asset-slot-index">${slotOrder}</div>
        <div class="asset-slot-body">
          <input class="asset-slot-name" value="${escapeHtml(asset?.name || "")}" placeholder="이미지 이름" />
          <div class="asset-drop-zone ${hasImage ? "has-image" : ""}" data-slot="${i}">
            ${
              hasImage
                ? `<img src="${escapeHtml(asset.url)}" alt="asset ${slotOrder}" />`
                : "<span>파일을 끌어다 놓거나 클릭하여 업로드하세요.</span>"
            }
            <input type="file" accept="image/*" hidden />
          </div>
          <div class="asset-slot-status">${hasImage ? "업로드됨" : "미등록"}</div>
        </div>
      </div>
    `);
  }
  elements.assetSlotList.innerHTML = rows.join("");
  attachAssetSlotHandlers();
}

function attachAssetSlotHandlers() {
  if (!elements.assetSlotList) return;
  elements.assetSlotList.querySelectorAll(".asset-slot").forEach((slot) => {
    const slotIndex = Number(slot.dataset.slot);
    const nameInput = slot.querySelector(".asset-slot-name");
    if (nameInput) {
      nameInput.addEventListener("change", () => {
        handleAssetNameChange(slotIndex, nameInput.value.trim());
      });
    }
    const dropZone = slot.querySelector(".asset-drop-zone");
    const fileInput = dropZone?.querySelector('input[type="file"]');
    if (dropZone && fileInput) {
      const prevent = (event, highlight) => {
        event.preventDefault();
        event.stopPropagation();
        dropZone.classList.toggle("drag-over", highlight);
      };
      ["dragenter", "dragover"].forEach((eventName) => {
        dropZone.addEventListener(eventName, (event) => prevent(event, true));
      });
      ["dragleave", "dragend"].forEach((eventName) => {
        dropZone.addEventListener(eventName, (event) => prevent(event, false));
      });
      dropZone.addEventListener("drop", (event) => {
        prevent(event, false);
        const file = event.dataTransfer?.files?.[0];
        if (file) {
          handleAssetFileSelection(slotIndex, file, dropZone);
        }
      });
      dropZone.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        if (file) {
          handleAssetFileSelection(slotIndex, file, dropZone);
        }
      });
    }
  });
}

async function handleAssetNameChange(slotIndex, value) {
  if (!activeAssetType) return;
  const slotOrder = slotIndex + 1;
  const asset =
    getAssetByOrder(activeAssetType, slotOrder) ||
    missionAssets[activeAssetType]?.[slotIndex];
  if (!asset || !asset.id) return;
  if ((asset.name || "") === value) return;
  const projectId = getProjectIdOrAlert("먼저 프로젝트를 선택하거나 저장하세요.");
  if (!projectId) return;
  const assetKey = getAssetBucketKey(activeAssetType);
  try {
    await update(ref(db), {
      [`projects/${projectId}/assets/${assetKey}/${asset.id}/name`]: value || asset.name || "",
    });
    asset.name = value;
    upsertAssetCache(projectId, activeAssetType, asset);
    refreshMissionAssetLists();
  } catch (error) {
    console.error(error);
    alert("이미지 이름 저장 중 오류가 발생했습니다.");
  }
}

async function handleAssetFileSelection(slotIndex, file, dropZone) {
  if (!file) return;
  const type = activeAssetType || "code";
  const projectId = getProjectIdOrAlert("먼저 프로젝트를 선택하거나 저장하세요.");
  if (!projectId) return;
  const slotOrder = slotIndex + 1;
  const slot = dropZone.closest(".asset-slot");
  const nameInput = slot?.querySelector(".asset-slot-name");
  const statusEl = slot?.querySelector(".asset-slot-status");
  const desiredName = nameInput?.value.trim() || file.name;
  if (statusEl) statusEl.textContent = "업로드 중...";
  dropZone.classList.add("has-image");
  dropZone.innerHTML = "<span>업로드 중...</span>";
  try {
    const uploaded = await uploadLibraryAsset(file, projectId, type);
    const assetEntry = await saveMissionAssetMeta(projectId, type, {
      ...uploaded,
      name: desiredName,
      order: slotOrder,
    });
    insertOrReplaceAsset(type, slotOrder, assetEntry);
    upsertAssetCache(projectId, type, assetEntry);
    refreshMissionAssetLists();
    renderAssetModalRows();
  } catch (error) {
    console.error(error);
    alert("이미지 업로드 중 오류가 발생했습니다.");
    if (statusEl) statusEl.textContent = "업로드 실패";
    renderAssetModalRows();
  }
}

function getAssetByOrder(type, order) {
  return (missionAssets[type] || []).find((asset) => asset.order === order);
}

function insertOrReplaceAsset(type, order, assetEntry) {
  if (!missionAssets[type]) missionAssets[type] = [];
  const enriched = { ...assetEntry, order };
  const index = missionAssets[type].findIndex((asset) => asset.order === order);
  if (index >= 0) missionAssets[type][index] = enriched;
  else missionAssets[type].push(enriched);
  sortMissionAssets(type);
}

function sortMissionAssets(type) {
  missionAssets[type] = (missionAssets[type] || [])
    .filter((asset) => asset && asset.url)
    .sort((a, b) => {
      const orderDiff = (a.order || 0) - (b.order || 0);
      if (orderDiff !== 0) return orderDiff;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
}

function setActiveMissionTeam(teamId = null) {
  if (teamId && !teamProfiles[teamId]) {
    activeMissionTeam = null;
  } else {
    activeMissionTeam = teamId || null;
  }
  highlightActiveMissionButton(activeMissionTeam);
  if (elements.bulkCodeModal && !elements.bulkCodeModal.hidden) {
    renderBulkCodeRows(activeMissionTeam);
  }
}

function resolveAvailableTeamId(preferredId = null) {
  if (preferredId && teamProfiles[preferredId]) return preferredId;
  if (activeMissionTeam && teamProfiles[activeMissionTeam]) return activeMissionTeam;
  const candidates = Object.keys(teamProfiles);
  if (!candidates.length) return null;
  return candidates
    .slice()
    .sort((a, b) => {
      const aNum = Number(a.replace("Team", ""));
      const bNum = Number(b.replace("Team", ""));
      if (Number.isFinite(aNum) && Number.isFinite(bNum)) return aNum - bNum;
      return a.localeCompare(b);
    })[0];
}

function getTeamDisplayLabel(teamId) {
  const row = elements.teamTableBody?.querySelector(`tr[data-team-id="${teamId}"]`);
  const nameInput = row?.querySelector("td:nth-child(2) input");
  const teamNumber = Number(teamId.replace("Team", "")) || 0;
  const base = teamNumber ? `${teamNumber}팀` : teamId;
  const official = (nameInput?.value.trim() || teamProfiles[teamId]?.name || "").trim();
  return official || base;
}

function highlightActiveMissionButton(teamId = null) {
  if (!elements.teamTableBody) return;
  elements.teamTableBody.querySelectorAll(".mission-config-btn").forEach((button) => {
    button.classList.toggle("active", !!teamId && button.dataset.teamId === teamId);
  });
}

function openBulkCodeModal() {
  const targetTeamId = resolveAvailableTeamId(activeMissionTeam);
  if (!targetTeamId) {
    alert("먼저 팀을 생성하거나 선택하세요.");
    return;
  }
  setActiveMissionTeam(targetTeamId);
  if (elements.bulkCodeModalTitle) {
    elements.bulkCodeModalTitle.textContent = "코드 일괄 입력";
  }
  if (elements.bulkCodeModalDesc) {
    elements.bulkCodeModalDesc.textContent = `현재 미션 수 ${missionTotal}개에 대해 코드를 입력하세요.`;
  }
  renderBulkCodeRows(targetTeamId);
  elements.bulkCodeModal?.classList.add("active");
  if (elements.bulkCodeModal) elements.bulkCodeModal.hidden = false;
}

function closeBulkCodeModal() {
  if (!elements.bulkCodeModal) return;
  elements.bulkCodeModal.classList.remove("active");
  elements.bulkCodeModal.hidden = true;
}

function renderBulkCodeRows(teamId) {
  if (!elements.bulkCodeList) return;
  if (!teamId) {
    elements.bulkCodeList.innerHTML = "<div class=\"asset-empty\">팀을 먼저 선택하세요.</div>";
    return;
  }
  const config = ensureMissionConfig(teamId);
  const rows = [];
  for (let i = 1; i <= missionTotal; i++) {
    const codeValue = escapeHtml(config[i]?.codeAnswer || "");
    rows.push(`
      <div class="bulk-code-row" data-mission="${i}">
        <label>${i}번 미션</label>
        <input value="${codeValue}" placeholder="코드 정답" />
      </div>
    `);
  }
  elements.bulkCodeList.innerHTML = rows.join("");
}


function openMissionModal(teamId = null) {
  const targetTeamId = resolveAvailableTeamId(teamId);
  if (!targetTeamId) {
    alert("먼저 팀을 생성하거나 선택하세요.");
    return;
  }
  setActiveMissionTeam(targetTeamId);
  if (elements.missionModalTitle) {
  elements.missionModalTitle.textContent = `문제 입력 (${getTeamDisplayLabel(targetTeamId)})`;
}
renderMissionModalRows(targetTeamId);
elements.missionModal?.classList.add("active");
  if (elements.missionModal) elements.missionModal.hidden = false;
  closePhotoConfigPanel();
  if (elements.photoConfigToggle) {
    elements.photoConfigToggle.disabled = false;
  }
}

function closeMissionModal() {
  if (!elements.missionModal) return;
  elements.missionModal.classList.remove("active");
  elements.missionModal.hidden = true;
  closePhotoConfigPanel();
  if (elements.photoConfigToggle) {
    elements.photoConfigToggle.disabled = true;
  }
}

function togglePhotoConfigPanel() {
  if (photoConfigVisible) {
    closePhotoConfigPanel();
  } else {
    openPhotoConfigPanel();
  }
}

function openPhotoConfigPanel() {
  if (!elements.photoConfigPanel) return;
  if (!activeMissionTeam) {
    alert("먼저 팀을 선택하세요.");
    return;
  }
  photoConfigVisible = true;
  elements.photoConfigPanel.hidden = false;
  elements.photoConfigPanel.classList.add("open");
  elements.photoConfigToggle?.setAttribute("aria-expanded", "true");
  renderPhotoConfigPanel(activeMissionTeam);
}

function closePhotoConfigPanel() {
  if (!elements.photoConfigPanel) return;
  photoConfigVisible = false;
  elements.photoConfigPanel.hidden = true;
  elements.photoConfigPanel.classList.remove("open");
  elements.photoConfigToggle?.setAttribute("aria-expanded", "false");
}

function renderPhotoConfigPanel(teamId) {
  if (!elements.photoConfigSelect) return;
  const options = [];
  for (let i = 1; i <= missionTotal; i++) {
    options.push(`<option value="mission:${i}">M${i} · 미션</option>`);
  }
  for (let i = 1; i <= missionTotal; i++) {
    options.push(`<option value="code:${i}">C${i} · 코드</option>`);
  }
  const previousValue = elements.photoConfigSelect.dataset.lastValue;
  elements.photoConfigSelect.innerHTML = options.join("");
  if (previousValue && Array.from(elements.photoConfigSelect.options).some((opt) => opt.value === previousValue)) {
    elements.photoConfigSelect.value = previousValue;
  } else if (elements.photoConfigSelect.options.length) {
    elements.photoConfigSelect.value = elements.photoConfigSelect.options[0].value;
  }
  elements.photoConfigSelect.dataset.lastValue = elements.photoConfigSelect.value;
  updatePhotoConfigPreview(teamId);
}

function parsePhotoConfigSelection(value = "") {
  if (!value) return {};
  const [phase, number] = value.split(":");
  const missionNumber = Number(number);
  if (!missionNumber || missionNumber < 1 || missionNumber > missionTotal) return {};
  if (phase === "mission") {
    return { missionNumber, target: "mission", label: `M${missionNumber}` };
  }
  if (phase === "code") {
    return { missionNumber, target: "code", label: `C${missionNumber}` };
  }
  return {};
}

function updatePhotoConfigPreview(teamId) {
  if (!elements.photoConfigCurrent || !elements.photoConfigSelect) return;
  const selection = parsePhotoConfigSelection(elements.photoConfigSelect.value);
  elements.photoConfigSelect.dataset.lastValue = elements.photoConfigSelect.value;
  if (!selection.missionNumber || !teamId) {
    elements.photoConfigCurrent.textContent = "-";
    return;
  }
  const entry = ensureMissionConfig(teamId)[selection.missionNumber] || {};
  if (entry.photoTarget === "code") {
    elements.photoConfigCurrent.textContent = `${selection.label} · 코드 사진 미션`;
  } else if (entry.photoTarget === "mission") {
    elements.photoConfigCurrent.textContent = `${selection.label} · 미션 사진 미션`;
  } else {
    elements.photoConfigCurrent.textContent = `${selection.label} · 사진 미션 미설정`;
  }
}

function handlePhotoConfigApply() {
  if (!elements.photoConfigSelect || !activeMissionTeam) return;
  const selection = parsePhotoConfigSelection(elements.photoConfigSelect.value);
  if (!selection.missionNumber || !selection.target) {
    alert("먼저 구간을 선택하세요.");
    return;
  }
  applyPhotoTarget(activeMissionTeam, selection.missionNumber, selection.target);
  elements.photoConfigSelect.dataset.lastValue = elements.photoConfigSelect.value;
  refreshMissionPhotoIndicators(activeMissionTeam);
  updatePhotoConfigPreview(activeMissionTeam);
  updateTeamStatusDisplay(activeMissionTeam);
}

function handlePhotoConfigClear() {
  if (!elements.photoConfigSelect || !activeMissionTeam) return;
  const selection = parsePhotoConfigSelection(elements.photoConfigSelect.value);
  if (!selection.missionNumber) {
    alert("먼저 구간을 선택하세요.");
    return;
  }
  applyPhotoTarget(activeMissionTeam, selection.missionNumber, "");
  refreshMissionPhotoIndicators(activeMissionTeam);
  updatePhotoConfigPreview(activeMissionTeam);
  updateTeamStatusDisplay(activeMissionTeam);
}

function applyPhotoTarget(teamId, missionNumber, target) {
  const config = ensureMissionConfig(teamId);
  const entry = config[missionNumber];
  entry.photoTarget = target || "";
  if (entry.photoTarget) {
    entry.photoSlots = entry.photoSlots && entry.photoSlots > 0 ? entry.photoSlots : 1;
  } else {
    entry.photoSlots = 0;
    entry.specialSlots = 0;
  }
}

function setupThumbInteractions({ row, type, input }) {
  if (!row || !input) return;
  const thumbSelector = type === "code" ? ".mission-thumb.code-thumb" : ".mission-thumb.answer-thumb";
  const thumb = row.querySelector(thumbSelector);
  if (!thumb) return;
  thumb.addEventListener("click", () => input.click());
  thumb.addEventListener("dragenter", (event) => {
    event.preventDefault();
    thumb.classList.add("drag-active");
  });
  thumb.addEventListener("dragover", (event) => {
    event.preventDefault();
    thumb.classList.add("drag-active");
  });
  thumb.addEventListener("dragleave", (event) => {
    event.preventDefault();
    if (!thumb.contains(event.relatedTarget)) {
      thumb.classList.remove("drag-active");
    }
  });
  thumb.addEventListener("drop", (event) => {
    event.preventDefault();
    thumb.classList.remove("drag-active");
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    assignFileToInput(input, file);
  });
}

function assignFileToInput(input, file) {
  if (!input || !file) return;
  if (typeof DataTransfer !== "undefined") {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;
  }
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function renderMissionModalRows(teamId) {
  if (!elements.missionModalBody) return;
  const config = ensureMissionConfig(teamId);
  const rows = [];
  for (let i = 1; i <= missionTotal; i++) {
    const mission = config[i] || {};
    const codeValue = escapeHtml(mission.codeAnswer || mission.answerCode || "");
    const answerAssetId = mission.answerAssetId || "";
    const resolvedAnswer = escapeHtml(getMissionAnswerValue(mission));
    const codeImage = mission.codeImageUrl ? escapeHtml(mission.codeImageUrl) : "";
    const missionImage = mission.missionImageUrl ? escapeHtml(mission.missionImageUrl) : "";
    const photoSlots = Number(mission.photoSlots) || 0;
    const specialSlots = Number(mission.specialSlots) || 0;
    const photoTarget = mission.photoTarget || "";
    const hasPhotoMission = Boolean(photoTarget) || photoSlots + specialSlots > 0;
    const codePhotoSelected = photoTarget === "code";
    const missionPhotoSelected = photoTarget === "mission";
    rows.push(`
      <tr data-mission="${i}" class="${hasPhotoMission ? "photo-mission-row" : ""}">
        <td>${i}</td>
        <td>
          <input class="mission-code" value="${codeValue}" placeholder="코드 정답" />
        </td>
        <td class="answer-cell">
          <input class="mission-answer" value="${resolvedAnswer || ""}" placeholder="미션 정답" />
        </td>
        <td class="media-cell">
          <div class="mission-media">
            <div class="mission-thumb code-thumb${codePhotoSelected ? " photo-selected" : ""}" data-type="code" data-mission="${i}">
              ${
                codeImage
                  ? `<img src="${codeImage}" alt="CODE ${i}" />`
                  : '<span class="thumb-placeholder">이미지 없음</span>'
              }
              <span class="thumb-hint">드래그 또는 터치</span>
              ${codePhotoSelected ? '<span class="thumb-badge">사진 미션</span>' : ""}
              <input type="file" class="mission-code-file" data-type="code" accept="image/*" hidden />
            </div>
            <div class="media-controls">
              <div class="library-select compact">
                <select class="mission-asset-select" data-type="code">
                  ${renderMissionAssetOptions("code", mission.codeImageUrl)}
                </select>
                <span class="code-status">${mission.codeImageUrl ? "업로드 완료" : "미입력"}</span>
              </div>
            </div>
          </div>
        </td>
        <td class="media-cell">
          <div class="mission-media">
            <div class="mission-thumb answer-thumb${missionPhotoSelected ? " photo-selected" : ""}" data-type="mission" data-mission="${i}">
              ${
                missionImage
                  ? `<img src="${missionImage}" alt="MISSION ${i}" />`
                  : '<span class="thumb-placeholder">이미지 없음</span>'
              }
              <span class="thumb-hint">드래그 또는 터치</span>
              ${missionPhotoSelected ? '<span class="thumb-badge">사진 미션</span>' : ""}
              <input type="file" class="mission-answer-file" data-type="mission" accept="image/*" hidden />
            </div>
            <div class="media-controls">
              <div class="library-select compact">
                <select class="mission-asset-select" data-type="mission">
                  ${renderMissionAssetOptions("mission", mission.missionImageUrl)}
                </select>
                <span class="mission-status">${mission.missionImageUrl ? "업로드 완료" : "미입력"}</span>
              </div>
            </div>
          </div>
        </td>
      </tr>
    `);
  }
  elements.missionModalBody.innerHTML = rows.join("");
  attachMissionModalHandlers(teamId);
  refreshMissionPhotoIndicators(teamId);
}

function renderMissionAssetOptions(type, selectedUrl = "") {
  const options = ['<option value=""></option>'];
  const library = missionAssets[type] || [];
  const hasSelectedInLibrary = library.some((asset) => asset.url === selectedUrl);
  if (selectedUrl && !hasSelectedInLibrary) {
    options.push(`<option value="${escapeHtml(selectedUrl)}" selected>현재 이미지</option>`);
  }
  library.forEach((asset) => {
    const selected = asset.url === selectedUrl ? "selected" : "";
    const label = escapeHtml(formatAssetLabel(asset));
    options.push(`<option value="${escapeHtml(asset.url)}" ${selected}>${label}</option>`);
  });
  return options.join("");
}

function renderMissionAnswerOptions(selectedAssetId = "", fallbackCode = "") {
  const library = missionAssets.mission || [];
  const options = ['<option value="">라이브러리 선택</option>'];
  library.forEach((asset) => {
    const label = escapeHtml(getMissionAssetCode(asset) || asset.id || "이미지");
    const suffix = asset.id ? ` · ${escapeHtml(asset.id.slice(-6))}` : "";
    const value = escapeHtml(asset.id);
    const selected = asset.id === selectedAssetId ? "selected" : "";
    options.push(`<option value="${value}" ${selected}>${label}${suffix}</option>`);
  });
  if (!library.length) {
    options[0] = '<option value="">먼저 미션 이미지 라이브러리에 이미지를 추가하세요</option>';
  }
  if (selectedAssetId && !library.some((asset) => asset.id === selectedAssetId)) {
    const legacyLabel = escapeHtml(fallbackCode || selectedAssetId);
    options.push(`<option value="${escapeHtml(selectedAssetId)}" selected>기존 선택 (${legacyLabel})</option>`);
  }
  return options.join("");
}

function getMissionAssetCode(asset = {}) {
  const raw = (asset?.name || "").trim();
  if (raw) return raw;
  return asset?.id || "";
}

function findMissionAssetById(assetId = "") {
  if (!assetId) return null;
  return (missionAssets.mission || []).find((asset) => asset.id === assetId) || null;
}

function findMissionAssetByUrl(url = "") {
  if (!url) return null;
  return (missionAssets.mission || []).find((asset) => asset.url === url) || null;
}

function applyAnswerSelection(teamId, missionNumber, assetId, options = {}) {
  const config = ensureMissionConfig(teamId);
  const missionKey = Number(missionNumber) || missionNumber;
  const entry = config[missionKey];
  if (!entry) return null;
  const updateCodeAnswer = options.updateCodeAnswer !== false;
  if (!assetId) {
    entry.answerAssetId = "";
    entry.answerCode = "";
    entry.answerImageUrl = "";
    if (updateCodeAnswer) entry.codeAnswer = "";
    entry.missionAnswer = "";
    return entry;
  }
  const asset = findMissionAssetById(assetId);
  const resolvedCode = (getMissionAssetCode(asset) || assetId).trim();
  entry.answerAssetId = assetId;
  entry.answerCode = resolvedCode;
  entry.missionAnswer = resolvedCode;
  if (updateCodeAnswer) {
    entry.codeAnswer = resolvedCode;
  }
  entry.answerImageUrl = asset?.url || "";
  entry.codeImageUrl = asset?.url || entry.codeImageUrl || "";
  entry.missionImageUrl = asset?.url || entry.missionImageUrl || "";
  return entry;
}

function handleAnswerSelectionChange(teamId, missionNumber, assetId) {
  applyAnswerSelection(teamId, missionNumber, assetId, { updateCodeAnswer: false });
  updateTeamStatusDisplay(teamId);
  refreshMissionModalAnswerDisplay(teamId, missionNumber);
  const config = ensureMissionConfig(teamId);
  const code = getMissionAnswerValue(config[missionNumber] || {});
  ensureMissionQrExists(code);
}

function refreshMissionModalAnswerDisplay(teamId, missionNumber) {
  const row = elements.missionModalBody?.querySelector(`tr[data-mission="${missionNumber}"]`);
  if (!row) return;
  const config = ensureMissionConfig(teamId);
  const mission = config[missionNumber] || {};
  const missionField = row.querySelector(".mission-answer");
  if (missionField) missionField.value = mission.missionAnswer || "";
  const codeField = row.querySelector(".mission-code");
  if (codeField) {
    codeField.value = mission.codeAnswer || mission.answerCode || "";
  }
}

function attachMissionModalHandlers(teamId) {
  if (!elements.missionModalBody) return;
  const config = ensureMissionConfig(teamId);
  elements.missionModalBody.querySelectorAll("tr[data-mission]").forEach((row) => {
    const missionNumber = row.dataset.mission;
    const codeInput = row.querySelector(".mission-code");
    const missionInput = row.querySelector(".mission-answer");
    const fileInputs = row.querySelectorAll('input[type="file"]');

    if (codeInput) {
      codeInput.addEventListener("input", () => {
        const value = codeInput.value.trim();
        config[missionNumber].codeAnswer = value;
        updateTeamStatusDisplay(teamId);
        ensureMissionQrExists(value);
      });
    }

    if (missionInput) {
      missionInput.addEventListener("input", () => {
        const value = missionInput.value.trim();
        config[missionNumber].missionAnswer = value;
        config[missionNumber].answerCode = value || config[missionNumber].answerCode || "";
        updateTeamStatusDisplay(teamId);
        ensureMissionQrExists(value || config[missionNumber].answerCode || "");
      });
    }

    fileInputs.forEach((input) => {
      input.addEventListener("change", async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const type = event.target.dataset.type;
        const statusEl = row.querySelector(type === "code" ? ".code-status" : ".mission-status");
        const thumbEl = row.querySelector(type === "code" ? ".code-thumb" : ".answer-thumb");
        statusEl.textContent = "업로드 중...";
        try {
          const url = await uploadMissionAsset(file, missionNumber, type);
          if (type === "code") {
            config[missionNumber].codeImageUrl = url;
          } else {
            config[missionNumber].missionImageUrl = url;
          }
          statusEl.textContent = "업로드 완료";
          if (thumbEl) {
            const safeUrl = escapeHtml(url);
            thumbEl.innerHTML = `<img src="${safeUrl}" alt="${type === "code" ? "CODE" : "MISSION"} ${missionNumber}" />`;
            updateThumbBadge(
              thumbEl,
              config[missionNumber].photoTarget === (type === "code" ? "code" : "mission")
            );
          }
          updateTeamStatusDisplay(teamId);
        } catch (error) {
          console.error(error);
          statusEl.textContent = "업로드 실패";
        } finally {
          event.target.value = "";
        }
      });
    });

    setupThumbInteractions({
      row,
      type: "code",
      input: row.querySelector(".mission-code-file"),
    });
    setupThumbInteractions({
      row,
      type: "mission",
      input: row.querySelector(".mission-answer-file"),
    });

    row.querySelectorAll(".mission-asset-select").forEach((select) => {
      select.addEventListener("change", () => {
        handleAssetSelectChange({ teamId, missionNumber, select });
      });
    });
  });
}

function refreshMissionPhotoIndicators(teamId) {
  if (!elements.missionModalBody) return;
  const config = ensureMissionConfig(teamId);
  elements.missionModalBody.querySelectorAll("tr[data-mission]").forEach((row) => {
    const missionNumber = Number(row.dataset.mission);
    const entry = config[missionNumber] || {};
    row.classList.toggle("photo-mission-row", hasPhotoRequirement(entry));
    updateThumbBadge(row.querySelector(".code-thumb"), entry.photoTarget === "code");
    updateThumbBadge(row.querySelector(".answer-thumb"), entry.photoTarget === "mission");
  });
  if (photoConfigVisible) {
    updatePhotoConfigPreview(teamId);
  }
}

function handleAssetSelectChange({ teamId, missionNumber, select }) {
  if (!select) return;
  const config = ensureMissionConfig(teamId);
  const type = select.dataset.type === "mission" ? "mission" : "code";
  const key = type === "code" ? "codeImageUrl" : "missionImageUrl";
  const statusEl =
    select.closest("td")?.querySelector(type === "code" ? ".code-status" : ".mission-status");
  const thumbEl =
    select.closest("td")?.querySelector(type === "code" ? ".code-thumb" : ".answer-thumb");
  const value = select.value;
  config[missionNumber][key] = value;
  if (type === "mission") {
    const asset = findMissionAssetByUrl(value);
    if (asset) {
      applyAnswerSelection(teamId, missionNumber, asset.id, { updateCodeAnswer: false });
      refreshMissionModalAnswerDisplay(teamId, missionNumber);
      ensureMissionQrExists(getMissionAssetCode(asset));
    }
  }
  if (!statusEl || !thumbEl) return;
  if (value) {
    statusEl.textContent = "라이브러리 선택";
    const safeUrl = escapeHtml(value);
    thumbEl.innerHTML = `<img src="${safeUrl}" alt="${type === "code" ? "CODE" : "MISSION"} ${missionNumber}" />`;
  } else {
    statusEl.textContent = "미입력";
    thumbEl.innerHTML = "";
  }
  updateThumbBadge(thumbEl, config[missionNumber].photoTarget === type);
  updateTeamStatusDisplay(teamId);
}

function applyBulkCodesFromModal() {
  if (!elements.bulkCodeList) return;
  if (!Object.keys(teamProfiles || {}).length) {
    alert("먼저 팀을 생성하세요.");
    return;
  }

  elements.bulkCodeList.querySelectorAll(".bulk-code-row").forEach((row) => {
    const missionNumber = Number(row.dataset.mission);
    const input = row.querySelector("input");
    const value = input?.value.trim() || "";
    if (!(missionNumber >= 1 && missionNumber <= missionTotal)) return;

    // 모든 팀에 코드만 일괄 적용
    Object.keys(teamProfiles).forEach((teamId) => {
      const config = ensureMissionConfig(teamId);
      config[missionNumber].codeAnswer = value;
      // 미션 정답은 변경하지 않습니다.
    });

    // 현재 모달에 표시된 팀이면 입력 필드 동기화
    const modalRow = elements.missionModalBody?.querySelector(`tr[data-mission="${missionNumber}"]`);
    if (modalRow) {
      const codeField = modalRow.querySelector(".mission-code");
      if (codeField) codeField.value = value;
    }

    ensureMissionQrExists(value);
  });
  closeBulkCodeModal();
  Object.keys(teamProfiles).forEach((teamId) => updateTeamStatusDisplay(teamId));
  alert("모든 팀에 코드가 적용되었습니다.");
}

async function uploadMissionAsset(file, missionNumber, type) {
  const projectId = getProjectIdOrAlert();
  if (!projectId) throw new Error("Missing project id");
  const path = `projects/${projectId}/missions/${missionNumber}/${type}-${Date.now()}-${file.name}`;
  const storageRef = sRef(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

async function handleMissionLibraryUpload(type, fileList) {
  const files = Array.from(fileList || []).filter(Boolean);
  if (!files.length) return;
  const projectId = getProjectIdOrAlert("먼저 마스터 비밀번호를 입력한 뒤 업로드하세요.");
  if (!projectId) return;
  if (!missionAssets[type]) missionAssets[type] = [];
  const baseLength = missionAssets[type].length || 0;
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    try {
      const uploaded = await uploadLibraryAsset(file, projectId, type);
      const order = baseLength + index + 1;
      const assetEntry = await saveMissionAssetMeta(projectId, type, {
        ...uploaded,
        name: file.name,
        order,
      });
      insertOrReplaceAsset(type, order, assetEntry);
      upsertAssetCache(projectId, type, assetEntry);
    } catch (error) {
      console.error(error);
      alert(`이미지 업로드 중 오류가 발생했습니다. (${file.name})`);
    }
  }
  sortMissionAssets(type);
  refreshMissionAssetLists();
}

async function uploadLibraryAsset(file, projectId, type) {
  const bucket = type === "mission" ? "mission" : "code";
  const sanitizedName = file.name.replace(/[^\w.\-]/g, "_");
  const path = `projects/${projectId}/library/${bucket}/${Date.now()}-${sanitizedName}`;
  const storageRef = sRef(storage, path);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  return { url, path };
}

async function saveMissionAssetMeta(projectId, type, payload = {}) {
  const assetId = sanitizeKey(`asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const orderValue = Number.isFinite(payload.order) ? payload.order : Date.now();
  const data = {
    url: payload.url || "",
    name: payload.name || payload.path || "",
    path: payload.path || "",
    createdAt: Date.now(),
    order: orderValue,
  };
  const assetKey = getAssetBucketKey(type);
  await update(ref(db), {
    [`projects/${projectId}/assets/${assetKey}/${assetId}`]: data,
  });
  return { id: assetId, ...data };
}

function upsertAssetCache(projectId, type, asset) {
  if (!projectsCache[projectId]) {
    projectsCache[projectId] = { meta: {}, teams: {}, assets: {} };
  }
  if (!projectsCache[projectId].assets) {
    projectsCache[projectId].assets = {};
  }
  const assetKey = getAssetBucketKey(type);
  projectsCache[projectId].assets[assetKey] = projectsCache[projectId].assets[assetKey] || {};
  projectsCache[projectId].assets[assetKey][asset.id] = {
    url: asset.url,
    name: asset.name,
    path: asset.path,
    createdAt: asset.createdAt,
    order: asset.order || asset.createdAt || 0,
  };
}

function getAssetBucketKey(type) {
  return type === "mission" ? "missionImages" : "codeImages";
}

async function saveMissionConfiguration() {
  const projectId = getProjectIdOrAlert("먼저 마스터 비밀번호를 입력한 뒤 저장하세요.");
  if (!projectId) return;
  const teamId = activeMissionTeam;
  if (!teamId) {
    alert("팀을 선택한 뒤 저장하세요.");
    return;
  }
  try {
    const payload = ensureMissionConfig(teamId);
    await update(ref(db), {
      [`projects/${projectId}/teams/${teamId}/config/missions`]: payload,
    });
    if (projectsCache[projectId]) {
      projectsCache[projectId].teams = projectsCache[projectId].teams || {};
      projectsCache[projectId].teams[teamId] = projectsCache[projectId].teams[teamId] || {};
      projectsCache[projectId].teams[teamId].config = projectsCache[projectId].teams[teamId].config || {};
      projectsCache[projectId].teams[teamId].config.missions = payload;
    }
    alert("문제가 저장되었습니다.");
    closeMissionModal();
  } catch (error) {
    console.error(error);
    alert("문제 저장 중 오류가 발생했습니다.");
  }
}

async function handleProjectImageUpload(file, options = {}) {
  if (!file) return;
  const projectId = getProjectIdOrAlert();
  if (!projectId) return;
  const type = options.type === "background" ? "background" : "logo";
  const folder = type === "background" ? "backgrounds" : "logos";
  const prefix = type === "background" ? "login" : "shared";
  const sanitizedName = file.name.replace(/[^\w.\-]/g, "_");
  const path = `projects/${projectId}/${folder}/${prefix}-${Date.now()}-${sanitizedName}`;
  const storageRef = sRef(storage, path);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  if (type === "background") {
    metaBackgroundUrl = url;
  } else {
    metaLogoUrl = url;
  }
  if (options.preview) {
    options.preview.src = url;
  }
}

async function handleSaveProject() {
  const masterPassword = elements.masterPasswordInput.value.trim();
  if (!masterPassword) {
    alert("마스터 비밀번호를 입력하세요.");
    return;
  }
  const sanitizedId = sanitizeKey(masterPassword);
  if (!sanitizedId) {
    alert("마스터 비밀번호에는 '.', '#', '$', '[', ']', '/' 문자를 사용할 수 없습니다.");
    return;
  }
  const rename = currentProjectId && currentProjectId !== sanitizedId;
  const projectId = rename ? sanitizedId : currentProjectId || sanitizedId;

  const previousMeta = projectsCache[projectId]?.meta || {};
  const now = Date.now();
  const resolvedStatus = projectsCache[projectId]?.meta?.status || "running";
  const educationAt = composeEducationTimestamp();
  const startAt = educationAt ?? null;
  const endAt = educationAt ?? null;
  const missionMasterPass = sanitizeMasterPassValue(globalMasterPass);
  const meta = {
    id: projectId,
    name: elements.projectNameInput.value.trim() || masterPassword,
    subtitle: elements.projectSubtitleInput?.value.trim() || "",
    projectCode: elements.projectCodeInput?.value.trim() || "",
    masterPassword,
    missionMasterPass,
    educationAt,
    startAt,
    endAt,
    organizer: elements.organizerInput.value.trim(),
    venue: elements.venueInput.value.trim(),
    participantCount: Number(elements.participantInput.value) || 0,
    teamCount: Number(elements.teamCountInput.value) || defaultTeamCount,
    missionTotal,
    status: resolvedStatus,
    logoUrl: metaLogoUrl || "",
    loginLogoUrl: metaLogoUrl || "",
    dashboardLogoUrl: metaLogoUrl || "",
    backgroundUrl: metaBackgroundUrl || "",
    updatedAt: now,
    createdAt: projectsCache[projectId]?.meta?.createdAt || now,
  };

  const teams = collectTeamProfiles();
  teamProfiles = { ...teams };

  const updates = {
    [`projects/${projectId}/meta`]: meta,
  };
  const countdownPayload = buildCountdownPayload(meta);
  updates[`projects/${projectId}/countdown`] = countdownPayload || null;

  Object.entries(teams).forEach(([teamId, profile]) => {
    updates[`projects/${projectId}/teams/${teamId}/profile`] = profile;
    updates[`projects/${projectId}/teams/${teamId}/config/missions`] = ensureMissionConfig(teamId);
    if (!projectsCache[projectId]?.teams?.[teamId]?.missions) {
      updates[`projects/${projectId}/teams/${teamId}/missions`] = createDefaultMissionState(missionTotal);
    }
  });

  const existingTeams = Object.keys(projectsCache[projectId]?.teams || {});
  existingTeams.forEach((teamId) => {
    if (!teams[teamId]) {
      updates[`projects/${projectId}/teams/${teamId}`] = null;
    }
  });

  if (rename) {
    updates[`projects/${currentProjectId}`] = null;
  }

  try {
    await update(ref(db), updates);
    alert("프로젝트가 저장되었습니다.");
    currentProjectId = projectId;
  } catch (error) {
    console.error(error);
    alert("프로젝트 저장 중 오류가 발생했습니다.");
  }
}

function collectTeamProfiles() {
  const teams = {};
  elements.teamTableBody.querySelectorAll("tr[data-team-id]").forEach((row, index) => {
    const teamId = row.dataset.teamId;
    const inputs = row.querySelectorAll("input");
    const number = index + 1;
    const fallbackName = `${number}팀`;
    const fallbackPassword = `T${number}`;
    teams[teamId] = {
      name: inputs[0].value.trim() || fallbackName,
      teamDisplayName: inputs[0].value.trim() || fallbackName,
      officialTeamName: inputs[0].value.trim() || fallbackName,
      password: inputs[1].value.trim() || fallbackPassword,
      number,
    };
  });
  return teams;
}

async function handleResetResults() {
  const projectId = getProjectIdOrAlert("먼저 프로젝트를 선택하거나 저장하세요.");
  if (!projectId || !projectsCache[projectId]) {
    alert("먼저 프로젝트를 선택하거나 저장하세요.");
    return;
  }
  if (!confirm("모든 팀의 미션 진행 상황을 초기화할까요? 업로드/채팅 데이터도 삭제됩니다.")) {
    return;
  }
  const updates = {};
  const teams = Object.keys(projectsCache[projectId]?.teams || {});
  teams.forEach((teamId) => {
    updates[`projects/${projectId}/teams/${teamId}/missions`] = createDefaultMissionState(missionTotal);
  });
  updates[`uploads_meta/${projectId}`] = null;
  updates[`chat/${projectId}`] = null;
  try {
    await update(ref(db), updates);
    alert("진행 결과가 초기화되었습니다.");
  } catch (error) {
    console.error(error);
    alert("초기화 중 오류가 발생했습니다.");
  }
}

function createDefaultMissionState(total = missionTotal) {
  const state = {};
  for (let i = 1; i <= total; i++) {
    state[i] = {
      stage: i === 1 ? "code" : "locked",
      panel: null,
    };
  }
  return state;
}

function formatDateTime(timestamp) {
  if (!timestamp) return "-";
  try {
    return new Date(timestamp).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (_error) {
    return "-";
  }
}

function formatDateOnly(timestamp) {
  if (!timestamp) return "-";
  try {
    return new Date(timestamp).toLocaleDateString("ko-KR");
  } catch (_error) {
    return "-";
  }
}

function setEducationInputs(timestamp) {
  if (!elements.educationDateInput || !elements.educationTimeInput) return;
  if (!timestamp) {
    elements.educationDateInput.value = "";
    elements.educationTimeInput.value = "";
    return;
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return;
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  const iso = local.toISOString();
  elements.educationDateInput.value = iso.slice(0, 10);
  elements.educationTimeInput.value = iso.slice(11, 16);
}

function composeEducationTimestamp() {
  if (!elements.educationDateInput) return null;
  const dateValue = elements.educationDateInput.value;
  if (!dateValue) return null;
  const timeValue = (elements.educationTimeInput?.value || "00:00").padEnd(5, "0");
  const parsed = Date.parse(`${dateValue}T${timeValue}`);
  return Number.isNaN(parsed) ? null : parsed;
}


function buildCountdownPayload(meta = {}) {
  const now = Date.now();
  const target = meta.educationAt || meta.endAt || null;
  if (target && target > now) {
    const duration = Math.max(60, Math.floor((target - now) / 1000));
    if (!Number.isFinite(duration) || duration <= 0) return null;
    return {
      startAt: now,
      duration,
    };
  }
  if (!meta.startAt || !meta.endAt) return null;
  const fallbackDuration = Math.max(60, Math.floor((meta.endAt - meta.startAt) / 1000));
  if (!Number.isFinite(fallbackDuration) || fallbackDuration <= 0) return null;
  return {
    startAt: meta.startAt,
    duration: fallbackDuration,
  };
}
