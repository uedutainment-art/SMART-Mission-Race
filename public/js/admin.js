import { db, ref, onValue, update, push, serverTimestamp, get } from "./firebase_config.js";
import {
  storage,
  sRef,
  uploadBytes,
  getDownloadURL,
} from "./firebase_config.js";
import { storeProjectContext } from "./project_context.js";
import {
  createDefaultMissionEntry,
  normalizeMissionEntry,
  normalizeCount,
  normalizeAdvanceSeconds,
  normalizePhotoPlan,
  getPhotoConfigFromMission,
  getStepConfig,
  isPhotoMissionConfig,
  STEP_MODES,
} from "./mission_rules.js";
import { createDefaultMissionState } from "./mission_state.js";

const defaultTeamCount = 10;
const DEFAULT_MISSION_TOTAL = 9;
const MISSION_FILTER_STORAGE_KEY = "smr_admin_mission_filter";
const MISSION_TEAM_STORAGE_KEY = "smr_admin_last_mission_team";
const MISSION_MODAL_DENSITY_STORAGE_KEY = "smr_admin_mission_modal_density";
const ROUTE_TEMPLATE_STORAGE_KEY = "smr_admin_route_templates_v1";
const PROJECTS_CACHE_STORAGE_KEY = "smr_admin_projects_cache_v1";
const LAST_PROJECT_STORAGE_KEY = "smr_admin_last_project_id_v1";
const PROJECTS_REST_URL = "https://smart-mission-race-57839-default-rtdb.asia-southeast1.firebasedatabase.app/projects.json";
let missionTotal = DEFAULT_MISSION_TOTAL;
let projectsLoadedFromPrimary = false;
let projectsFallbackAttempted = false;

function describeStepMode(mode) {
  if (mode === STEP_MODES.QR) return "QR";
  if (mode === STEP_MODES.HQ) return "HQ";
  if (mode === STEP_MODES.PHOTO_HQ) return "사진 + HQ 승인";
  return "정답";
}

const elements = {
  projectTableBody: document.querySelector("#projectTable tbody"),
  newProjectBtn: document.getElementById("newProjectBtn"),
  cloneProjectBtn: document.getElementById("cloneProjectBtn"),
  deleteProjectBtn: document.getElementById("deleteProjectBtn"),
  refreshBtn: document.getElementById("refreshProjectsBtn"),
  projectSearchInput: document.getElementById("projectSearchInput"),
  projectLoadStatus: document.getElementById("projectLoadStatus"),
  projectLoadMeta: document.getElementById("projectLoadMeta"),
  projectForm: document.getElementById("projectForm"),
  editorScroll: document.getElementById("editorScroll"),
  adminTabs: Array.from(document.querySelectorAll(".admin-tab")),
  adminTabPanels: Array.from(document.querySelectorAll(".admin-tab-panel")),
  selectAllProjects: document.getElementById("selectAllProjects"),
  projectNameInput: document.getElementById("projectNameInput"),
  projectIdInput: document.getElementById("projectIdInput"),
  masterPasswordInput: document.getElementById("masterPasswordInput"),
  adminBypassCodeInput: document.getElementById("adminBypassCodeInput"),
  photoApprovalPasswordInput: document.getElementById("photoApprovalPasswordInput"),
  projectStatusInput: document.getElementById("projectStatusInput"),
  routeModeInput: document.getElementById("routeModeInput"),
  rainModeInput: document.getElementById("rainModeInput"),
  hideTeamChatInput: document.getElementById("hideTeamChatInput"),
  hideTeamPhotoInput: document.getElementById("hideTeamPhotoInput"),
  startDateInput: document.getElementById("startDateInput"),
  endDateInput: document.getElementById("endDateInput"),
  organizerInput: document.getElementById("organizerInput"),
  venueInput: document.getElementById("venueInput"),
  participantInput: document.getElementById("participantInput"),
  teamCountInput: document.getElementById("teamCountInput"),
  sharedLogoInput: document.getElementById("sharedLogoInput"),
  sharedLogoDropzone: document.getElementById("sharedLogoDropzone"),
  sharedLogoPreview: document.getElementById("sharedLogoPreview"),
  loginTitleInput: document.getElementById("loginTitleInput"),
  loginSubtitleInput: document.getElementById("loginSubtitleInput"),
  loginNoticeInput: document.getElementById("loginNoticeInput"),
  finishNoticeInput: document.getElementById("finishNoticeInput"),
  loginUnlockLabelInput: document.getElementById("loginUnlockLabelInput"),
  loginTeamButtonLabelInput: document.getElementById("loginTeamButtonLabelInput"),
  loginThemeInput: document.getElementById("loginThemeInput"),
  loginBackgroundInput: document.getElementById("loginBackgroundInput"),
  loginBackgroundDropzone: document.getElementById("loginBackgroundDropzone"),
  loginBackgroundPreview: document.getElementById("loginBackgroundPreview"),
  loginPreviewCard: document.getElementById("loginPreviewCard"),
  teamLoginPreviewCard: document.getElementById("teamLoginPreviewCard"),
  loginPreviewLogo: document.getElementById("loginPreviewLogo"),
  teamLoginPreviewLogo: document.getElementById("teamLoginPreviewLogo"),
  loginPreviewTitle: document.getElementById("loginPreviewTitle"),
  teamLoginPreviewTitle: document.getElementById("teamLoginPreviewTitle"),
  loginPreviewSubtitle: document.getElementById("loginPreviewSubtitle"),
  teamLoginPreviewSubtitle: document.getElementById("teamLoginPreviewSubtitle"),
  loginPreviewDates: document.getElementById("loginPreviewDates"),
  loginPreviewNotice: document.getElementById("loginPreviewNotice"),
  teamLoginPreviewNotice: document.getElementById("teamLoginPreviewNotice"),
  loginPreviewUnlock: document.getElementById("loginPreviewUnlock"),
  loginPreviewTeam: document.getElementById("loginPreviewTeam"),
  openLoginPreviewBtn: document.getElementById("openLoginPreviewBtn"),
  openTeamLoginPreviewBtn: document.getElementById("openTeamLoginPreviewBtn"),
  teamTableBody: document.querySelector("#teamTable tbody"),
  routeBuilderMeta: document.getElementById("routeBuilderMeta"),
  routeMissionKeysInput: document.getElementById("routeMissionKeysInput"),
  photoTemplateSelect: document.getElementById("photoTemplateSelect"),
  applyPhotoTemplateToAllBtn: document.getElementById("applyPhotoTemplateToAllBtn"),
  applyPhotoTemplateToEmptyBtn: document.getElementById("applyPhotoTemplateToEmptyBtn"),
  routeCodeTableBody: document.getElementById("routeCodeTableBody"),
  routeMissionLibraryBody: document.getElementById("routeMissionLibraryBody"),
  outdoorAssetPanel: document.getElementById("outdoorAssetPanel"),
  outdoorAssetLibraryBody: document.getElementById("outdoorAssetLibraryBody"),
  routeMatrixMeta: document.getElementById("routeMatrixMeta"),
  routeTemplateNameInput: document.getElementById("routeTemplateNameInput"),
  routeTemplateSelect: document.getElementById("routeTemplateSelect"),
  saveRouteTemplateBtn: document.getElementById("saveRouteTemplateBtn"),
  loadRouteTemplateBtn: document.getElementById("loadRouteTemplateBtn"),
  deleteRouteTemplateBtn: document.getElementById("deleteRouteTemplateBtn"),
  applyAcademyExampleBtn: document.getElementById("applyAcademyExampleBtn"),
  applyOutdoorExampleBtn: document.getElementById("applyOutdoorExampleBtn"),
  routeMatrixHead: document.getElementById("routeMatrixHead"),
  routeMatrixBody: document.getElementById("routeMatrixBody"),
  routeKeyOptions: document.getElementById("routeKeyOptions"),
  routeCodeKeyOptions: document.getElementById("routeCodeKeyOptions"),
  autoFillRouteMatrixBtn: document.getElementById("autoFillRouteMatrixBtn"),
  autoFillRouteMatrixFromHereBtn: document.getElementById("autoFillRouteMatrixFromHereBtn"),
  duplicateRouteToNextTeamBtn: document.getElementById("duplicateRouteToNextTeamBtn"),
  duplicateRouteToRemainingTeamsBtn: document.getElementById("duplicateRouteToRemainingTeamsBtn"),
  routeRangeApplyInput: document.getElementById("routeRangeApplyInput"),
  duplicateRouteToRangeBtn: document.getElementById("duplicateRouteToRangeBtn"),
  autoFillRouteRangeBtn: document.getElementById("autoFillRouteRangeBtn"),
  clearRouteColumnBtn: document.getElementById("clearRouteColumnBtn"),
  routeColumnFillInput: document.getElementById("routeColumnFillInput"),
  fillRouteColumnBtn: document.getElementById("fillRouteColumnBtn"),
  importRouteMatrixBtn: document.getElementById("importRouteMatrixBtn"),
  importRouteMatrixInput: document.getElementById("importRouteMatrixInput"),
  exportRouteMatrixBtn: document.getElementById("exportRouteMatrixBtn"),
  exportRouteAssignmentReportBtn: document.getElementById("exportRouteAssignmentReportBtn"),
  exportRouteIssuesReportBtn: document.getElementById("exportRouteIssuesReportBtn"),
  exportRouteStaffSheetBtn: document.getElementById("exportRouteStaffSheetBtn"),
  copyRouteStaffSheetBtn: document.getElementById("copyRouteStaffSheetBtn"),
  printRouteStaffSheetBtn: document.getElementById("printRouteStaffSheetBtn"),
  saveApplyRouteMatrixBtn: document.getElementById("saveApplyRouteMatrixBtn"),
  applyRouteMatrixBtn: document.getElementById("applyRouteMatrixBtn"),
  routePreviewPanel: document.getElementById("routePreviewPanel"),
  routePreviewBadge: document.getElementById("routePreviewBadge"),
  routePreview: document.getElementById("routePreview"),
  routeSummaryPanel: document.getElementById("routeSummaryPanel"),
  routeSummaryBadge: document.getElementById("routeSummaryBadge"),
  routeSummaryList: document.getElementById("routeSummaryList"),
  routeAssignmentPanel: document.getElementById("routeAssignmentPanel"),
  routeAssignmentBadge: document.getElementById("routeAssignmentBadge"),
  routeAssignmentMeta: document.getElementById("routeAssignmentMeta"),
  routeAssignmentHead: document.getElementById("routeAssignmentHead"),
  routeAssignmentBody: document.getElementById("routeAssignmentBody"),
  routeStaffSheetPanel: document.getElementById("routeStaffSheetPanel"),
  routeStaffSheetBadge: document.getElementById("routeStaffSheetBadge"),
  routeStaffSheetMeta: document.getElementById("routeStaffSheetMeta"),
  routeStaffSheetHead: document.getElementById("routeStaffSheetHead"),
  routeStaffSheetBody: document.getElementById("routeStaffSheetBody"),
  routeStaffCompactPanel: document.getElementById("routeStaffCompactPanel"),
  routeStaffCompactBadge: document.getElementById("routeStaffCompactBadge"),
  routeStaffCompactMeta: document.getElementById("routeStaffCompactMeta"),
  routeStaffCompactList: document.getElementById("routeStaffCompactList"),
  routeLegendPanel: document.getElementById("routeLegendPanel"),
  routeLegendBadge: document.getElementById("routeLegendBadge"),
  routeLegendMeta: document.getElementById("routeLegendMeta"),
  routeCodeLegendList: document.getElementById("routeCodeLegendList"),
  routeMissionLegendList: document.getElementById("routeMissionLegendList"),
  missionCountInput: document.getElementById("missionCountInput"),
  missionOverviewFilters: Array.from(document.querySelectorAll("[data-mission-filter]")),
  missionOverviewMeta: document.getElementById("missionOverviewMeta"),
  missionOverview: document.getElementById("missionOverview"),
  openFirstIncompleteMissionBtn: document.getElementById("openFirstIncompleteMissionBtn"),
  openNextMissionTeamBtn: document.getElementById("openNextMissionTeamBtn"),
  projectSaveBadge: document.getElementById("projectSaveBadge"),
  missionSaveBadge: document.getElementById("missionSaveBadge"),
  routeSyncBadge: document.getElementById("routeSyncBadge"),
  routeInferenceBadge: document.getElementById("routeInferenceBadge"),
  lastSavedAt: document.getElementById("lastSavedAt"),
  currentProjectTitle: document.getElementById("currentProjectTitle"),
  currentProjectMeta: document.getElementById("currentProjectMeta"),
  actionHint: document.getElementById("actionHint"),
  gotoTeamsBtn: document.getElementById("gotoTeamsBtn"),
  gotoMissionsBtn: document.getElementById("gotoMissionsBtn"),
  gotoOpsBtn: document.getElementById("gotoOpsBtn"),
  setupRoadmap: document.getElementById("setupRoadmap"),
  projectChecklist: document.getElementById("projectChecklist"),
  projectSummary: document.getElementById("projectSummary"),
  launchReadinessBadge: document.getElementById("launchReadinessBadge"),
  launchReadinessList: document.getElementById("launchReadinessList"),
  rehearsalBadge: document.getElementById("rehearsalBadge"),
  rehearsalInfo: document.getElementById("rehearsalInfo"),
  announcementTargetSelect: document.getElementById("announcementTargetSelect"),
  announcementMessageInput: document.getElementById("announcementMessageInput"),
  sendAnnouncementBtn: document.getElementById("sendAnnouncementBtn"),
  opsTimelineBadge: document.getElementById("opsTimelineBadge"),
  opsTimeline: document.getElementById("opsTimeline"),
  opsTimelineFilters: Array.from(document.querySelectorAll("[data-ops-filter]")),
  openTeamLoginBtn: document.getElementById("openTeamLoginBtn"),
  copyTeamLoginLinkBtn: document.getElementById("copyTeamLoginLinkBtn"),
  showTeamLoginQrBtn: document.getElementById("showTeamLoginQrBtn"),
  copyTeamLoginQrBtn: document.getElementById("copyTeamLoginQrBtn"),
  teamLoginQrPanel: document.getElementById("teamLoginQrPanel"),
  teamLoginQrImage: document.getElementById("teamLoginQrImage"),
  teamLoginQrMeta: document.getElementById("teamLoginQrMeta"),
  openReviewBtn: document.getElementById("openReviewBtn"),
  openPhotoApproveBtn: document.getElementById("openPhotoApproveBtn"),
  copyPhotoApproveLinkBtn: document.getElementById("copyPhotoApproveLinkBtn"),
  showPhotoApproveQrBtn: document.getElementById("showPhotoApproveQrBtn"),
  normalizeMissionSchemaBtn: document.getElementById("normalizeMissionSchemaBtn"),
  photoApproveQrPanel: document.getElementById("photoApproveQrPanel"),
  photoApproveQrImage: document.getElementById("photoApproveQrImage"),
  photoApproveQrMeta: document.getElementById("photoApproveQrMeta"),
  copyPhotoUploadLinkBtn: document.getElementById("copyPhotoUploadLinkBtn"),
  opsConsoleOpenTeamLoginBtn: document.getElementById("opsConsoleOpenTeamLoginBtn"),
  opsConsoleOpenHQBtn: document.getElementById("opsConsoleOpenHQBtn"),
  opsConsoleOpenReviewBtn: document.getElementById("opsConsoleOpenReviewBtn"),
  opsConsoleOpenApproveBtn: document.getElementById("opsConsoleOpenApproveBtn"),
  opsConsoleExportBundleBtn: document.getElementById("opsConsoleExportBundleBtn"),
  startGateBadge: document.getElementById("startGateBadge"),
  startGateList: document.getElementById("startGateList"),
  runStartGateBtn: document.getElementById("runStartGateBtn"),
  saveBtn: document.getElementById("saveProjectBtn"),
  resetTopBtn: document.getElementById("resetResultsTopBtn"),
  exportBtn: document.getElementById("exportResultsBtn"),
  exportOpsLogBtn: document.getElementById("exportOpsLogBtn"),
  exportOpsBundleBtn: document.getElementById("exportOpsBundleBtn"),
  finishBtn: document.getElementById("finishProjectBtn"),
  resetBtn: document.getElementById("resetResultsBtn"),
  openHQBtn: document.getElementById("openHQBtn"),
  missionModal: document.getElementById("missionModal"),
  missionModalBody: document.getElementById("missionModalBody"),
  missionModalTitle: document.getElementById("missionModalTitle"),
  missionModalSubtitle: document.getElementById("missionModalSubtitle"),
  missionModalJumpbar: document.getElementById("missionModalJumpbar"),
  missionModalSave: document.getElementById("missionModalSave"),
  missionModalSaveNext: document.getElementById("missionModalSaveNext"),
  missionModalClose: document.getElementById("missionModalClose"),
  missionModalCancel: document.getElementById("missionModalCancel"),
  missionModalDensityToggle: document.getElementById("missionModalDensityToggle"),
  missionModalNextIssue: document.getElementById("missionModalNextIssue"),
  missionModalPrevTeam: document.getElementById("missionModalPrevTeam"),
  missionModalNextTeam: document.getElementById("missionModalNextTeam"),
  adminToastHost: document.getElementById("adminToastHost"),
  cloneModal: document.getElementById("cloneModal"),
  cloneModalClose: document.getElementById("cloneModalClose"),
  cloneModalCancel: document.getElementById("cloneModalCancel"),
  cloneModalSubmit: document.getElementById("cloneModalSubmit"),
  cloneProjectNameInput: document.getElementById("cloneProjectNameInput"),
  cloneMasterPasswordInput: document.getElementById("cloneMasterPasswordInput"),
  confirmModal: document.getElementById("confirmModal"),
  confirmModalTitle: document.getElementById("confirmModalTitle"),
  confirmModalMessage: document.getElementById("confirmModalMessage"),
  confirmModalClose: document.getElementById("confirmModalClose"),
  confirmModalCancel: document.getElementById("confirmModalCancel"),
  confirmModalSubmit: document.getElementById("confirmModalSubmit"),
};

let projectsCache = {};
let currentProjectId = null;
let teamProfiles = {};
let missionConfigs = {};
let routeBuilderConfig = {};
let routeTemplates = [];
let activeRoutePreview = {
  teamId: "",
  routeIndex: -1,
};
let activeMissionTeam = null;
let metaLogoUrl = "";
let metaLoginBackgroundUrl = "";
let uploadsMetaCache = {};
const selectedProjects = new Set();
let projectListSearch = "";
let activeAdminTab = "basic";
let dirtyState = {
  project: false,
  mission: false,
};
let routeApplyNeeded = false;
let routeBuilderInferred = false;
let lastSavedAtValue = null;
let missionOverviewFilter = "all";
let missionModalDensity = "compact";
let activeMissionRow = "1";
let actionLocks = {
  save: false,
  reset: false,
  delete: false,
  clone: false,
  migrate: false,
  routeApply: false,
  export: false,
  finish: false,
  exportOps: false,
};
let lastMissionOverviewOrder = [];
let lastVisibleMissionOverviewOrder = [];
let lastProjectLoadState = "info";
let isFirebaseConnected = null;
let cloneSourceProjectId = null;
let confirmModalResolver = null;
let opsTimelineUnsubscribe = null;
let latestOpsTimelineItems = [];
let opsTimelineFilter = "all";
let opsTimelinePermissionDenied = false;

function persistLastProjectId(projectId = "") {
  try {
    if (projectId) {
      window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, String(projectId));
      return;
    }
    window.localStorage.removeItem(LAST_PROJECT_STORAGE_KEY);
  } catch (_error) {
    // Ignore localStorage access issues.
  }
}

function getPersistedLastProjectId() {
  try {
    return window.localStorage.getItem(LAST_PROJECT_STORAGE_KEY) || "";
  } catch (_error) {
    return "";
  }
}

const LOGIN_THEME_PREVIEW_MAP = {
  midnight: {
    background: "linear-gradient(135deg, #0b1522, #1c2a3f)",
    accent: "#4cc9f0",
  },
  sunset: {
    background: "linear-gradient(135deg, #3b1d2a, #8b3a2f 55%, #d97706)",
    accent: "#fdba74",
  },
  forest: {
    background: "linear-gradient(135deg, #0f1f1a, #1f5f4a 55%, #65a30d)",
    accent: "#86efac",
  },
  slate: {
    background: "linear-gradient(135deg, #111827, #334155 58%, #64748b)",
    accent: "#cbd5f5",
  },
};

const PHOTO_MISSION_TEMPLATES = [
  {
    id: "selfie_jump_value",
    name: "기본 3컷",
    slots: ["전체 셀카", "점프샷", "핵심가치"],
  },
  {
    id: "selfie_slogan_value_video",
    name: "3컷 + 영상",
    slots: ["전체 셀카", "팀 구호", "핵심가치", "인터뷰 영상"],
  },
  {
    id: "selfie_place_action",
    name: "현장 인증 3컷",
    slots: ["전체 셀카", "장소 인증", "액션샷"],
  },
];

function buildDefaultRouteKeys(count = Math.max(1, missionTotal - 2)) {
  return Array.from({ length: Math.max(1, count) }, (_, index) => {
    if (index < 26) return String.fromCharCode(65 + index);
    return `K${index + 1}`;
  });
}

function normalizeMissionRouteToken(value = "") {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "START") return "S";
  if (normalized === "LAST") return "L";
  return normalized;
}

function createDefaultRouteCodeEntry(index) {
  return {
    displayName: `코드 ${index}`,
    answer: String(index),
    mode: STEP_MODES.ANSWER,
    autoAdvanceSeconds: 0,
    photoSlots: 0,
    specialSlots: 0,
    photoPlan: [],
    allowBypass: true,
    imageUrl: "",
    rainImageUrl: "",
  };
}

function createDefaultRouteCodeVariantEntry(baseKey = "1", missionNumber = 1, variantNumber = 1) {
  const normalizedBaseKey = String(baseKey || missionNumber || "1").trim().toUpperCase() || String(missionNumber || 1);
  const variantKey = `${normalizedBaseKey}-${variantNumber}`;
  return {
    displayName: `코드 ${variantKey}`,
    answer: variantKey,
    mode: STEP_MODES.ANSWER,
    autoAdvanceSeconds: 0,
    photoSlots: 0,
    specialSlots: 0,
    photoPlan: [],
    allowBypass: true,
    imageUrl: "",
    rainImageUrl: "",
  };
}

function getDefaultRouteAnswerTemplate(key = "A") {
  const normalizedKey = normalizeMissionRouteToken(key);
  const baseKey = normalizedKey.includes("-") ? normalizedKey.split("-")[0] : normalizedKey;
  const prefixMap = {
    S: "ST",
    L: "LS",
    START: "ST",
    LAST: "LS",
    A: "AP",
    B: "BC",
    C: "CM",
    D: "DD",
    E: "ET",
    F: "FR",
    G: "GG",
  };
  const prefix = prefixMap[baseKey] || baseKey;
  return `${prefix}{teamNo}`;
}

function normalizeRouteAnswerTemplate(template = "", key = "A") {
  const raw = String(template || "").trim();
  const normalizedKey = normalizeMissionRouteToken(key);
  const nextDefault = getDefaultRouteAnswerTemplate(normalizedKey);
  const legacyDefault = `${normalizedKey}{teamNo}`;
  if (!raw || raw === "1" || raw === legacyDefault) {
    return nextDefault;
  }
  return raw;
}

function secondsToDelayMinutes(value = 0) {
  const seconds = normalizeAdvanceSeconds(value);
  if (!seconds) return 0;
  return Math.round(seconds / 60);
}

function delayMinutesToSeconds(value = 0) {
  const minutes = Math.max(0, Math.min(60, Math.floor(Number(value) || 0)));
  return normalizeAdvanceSeconds(minutes * 60);
}

function createDefaultRouteMissionEntry(key = "A") {
  return {
    displayName: key,
    answerTemplate: normalizeRouteAnswerTemplate("", key),
    mode: STEP_MODES.ANSWER,
    autoAdvanceSeconds: 0,
    allowBypass: true,
    photoSlots: 0,
    specialSlots: 0,
    photoPlan: [],
    imageUrl: "",
    rainImageUrl: "",
  };
}

function createDefaultOutdoorAssetEntry(stepNumber = 2, key = "A") {
  const normalizedKey = String(key || "A").trim().toUpperCase() || "A";
  return {
    label: `Step ${stepNumber} ${normalizedKey}`,
    codeAnswer: `${normalizedKey}${stepNumber}`,
    missionMode: STEP_MODES.ANSWER,
    missionAnswerTemplate: normalizeRouteAnswerTemplate("", normalizedKey),
    autoAdvanceSeconds: 0,
    photoPlan: [],
    codeImageUrl: "",
    missionImageUrl: "",
  };
}

function parsePhotoPlanInput(value = "") {
  const tokens = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return tokens.map((label, index) => ({
    slotId: `Photo${index + 1}`,
    label,
    accept: "mixed",
    required: true,
  }));
}

function stringifyPhotoPlan(plan = []) {
  return normalizePhotoPlan(plan).map((item) => item.label).join(", ");
}

function renderPhotoMissionTemplates() {
  if (!elements.photoTemplateSelect) return;
  elements.photoTemplateSelect.innerHTML = [
    `<option value="">사진 미션 템플릿 선택</option>`,
    ...PHOTO_MISSION_TEMPLATES.map((template) => `<option value="${template.id}">${template.name}</option>`),
  ].join("");
}

function getSelectedPhotoTemplate() {
  const selectedId = elements.photoTemplateSelect?.value || "";
  return PHOTO_MISSION_TEMPLATES.find((template) => template.id === selectedId) || null;
}

function applyPhotoTemplateToMissionLibrary(mode = "all") {
  const template = getSelectedPhotoTemplate();
  if (!template) {
    showAdminToast("적용할 사진 미션 템플릿을 먼저 선택하세요.", "warn", 2600);
    return;
  }
  const routeConfig = ensureRouteBuilderConfig();
  let changedCount = 0;
  routeConfig.missionKeys.forEach((key) => {
    const entry = routeConfig.missionLibrary[key] || createDefaultRouteMissionEntry(key);
    const hasExistingPlan = normalizePhotoPlan(entry.photoPlan).length > 0;
    if (mode === "empty" && hasExistingPlan) return;
    entry.photoPlan = template.slots.map((label, index) => ({
      slotId: `Photo${index + 1}`,
      label,
      accept: label.includes("영상") ? "video" : "mixed",
      required: true,
    }));
    entry.photoSlots = entry.photoPlan.length;
    entry.specialSlots = 0;
    entry.mode = STEP_MODES.PHOTO_HQ;
    routeConfig.missionLibrary[key] = entry;
    changedCount += 1;
  });
  if (!changedCount) {
    showAdminToast("적용 가능한 빈 사진 미션이 없습니다.", "warn", 2600);
    return;
  }
  renderRouteBuilder();
  markRouteBuilderDirty();
  showAdminToast(
    mode === "empty"
      ? `사진 템플릿을 빈 미션 ${changedCount}개에 적용했습니다.`
      : `사진 템플릿을 중간 미션 ${changedCount}개에 적용했습니다.`,
    "success",
    3000,
  );
}

function createDefaultRouteBuilderConfig() {
  return {
    mode: "academy",
    missionKeys: buildDefaultRouteKeys(),
    codeLibrary: {},
    codeVariants: {},
    missionLibrary: {},
    outdoorAssets: {},
    startRoutes: {},
    endRoutes: {},
    routes: {},
    startCodeRoutes: {},
    endCodeRoutes: {},
    codeRoutes: {},
  };
}

function extractCodeVariantBase(codeKey = "") {
  const normalized = normalizeCodeRouteToken(codeKey);
  return normalized.includes("-") ? normalized.split("-")[0] : normalized;
}

function normalizeCodeRouteToken(value = "") {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return "";
  const match = normalized.match(/^C(\d+(?:-\d+)?)$/);
  return match ? match[1] : normalized;
}

function getDefaultCodeKeyForMissionNumber(missionNumber = 1) {
  return String(missionNumber || 1).trim();
}

function buildMissionLibraryKeys(routeConfig = routeBuilderConfig) {
  const baseKeys = ["S", ...(routeConfig?.missionKeys || []), "L"];
  const extras = Object.keys(routeConfig?.missionLibrary || {})
    .map((key) => String(key || "").trim().toUpperCase())
    .filter(Boolean)
    .filter((key) => !baseKeys.includes(key))
    .sort((a, b) => a.localeCompare(b, "ko"));
  return [...baseKeys, ...extras];
}

function buildCodeKeyOptions(routeConfig = routeBuilderConfig, missionNumber = 1) {
  const baseKey = getDefaultCodeKeyForMissionNumber(missionNumber);
  const variants = Object.keys(routeConfig?.codeVariants?.[missionNumber] || {})
    .map((key) => String(key || "").trim().toUpperCase())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "ko"));
  return [baseKey, ...variants];
}

function getRouteStartMissionKey(routeConfig, teamId) {
  return normalizeMissionRouteToken(routeConfig?.startRoutes?.[teamId] || "S");
}

function getRouteEndMissionKey(routeConfig, teamId) {
  return normalizeMissionRouteToken(routeConfig?.endRoutes?.[teamId] || "L");
}

function getRouteStartCodeKey(routeConfig, teamId) {
  return normalizeCodeRouteToken(routeConfig?.startCodeRoutes?.[teamId] || getDefaultCodeKeyForMissionNumber(1)).trim().toUpperCase()
    || getDefaultCodeKeyForMissionNumber(1).toUpperCase();
}

function getRouteEndCodeKey(routeConfig, teamId) {
  return normalizeCodeRouteToken(routeConfig?.endCodeRoutes?.[teamId] || getDefaultCodeKeyForMissionNumber(missionTotal)).trim().toUpperCase()
    || getDefaultCodeKeyForMissionNumber(missionTotal).toUpperCase();
}

function usesSplitKeyRouting(routeConfig = routeBuilderConfig) {
  const hasCodeVariants = Object.values(routeConfig?.codeVariants || {}).some((bucket) => Object.keys(bucket || {}).length > 0);
  const hasExplicitCodeRoutes = Object.values(routeConfig?.codeRoutes || {}).some((route) => Array.isArray(route) && route.some((value, index) => {
    const missionNumber = index + 2;
    return String(value || "").trim().toUpperCase() && String(value || "").trim().toUpperCase() !== getDefaultCodeKeyForMissionNumber(missionNumber).toUpperCase();
  }));
  const baseKeys = new Set(["S", ...(routeConfig?.missionKeys || []), "L"]);
  const hasMissionVariants = Object.keys(routeConfig?.missionLibrary || {}).some((key) => !baseKeys.has(String(key || "").trim().toUpperCase()));
  return hasCodeVariants || hasExplicitCodeRoutes || hasMissionVariants;
}

function getProjectEducationDate(meta = {}) {
  return meta.educationDate || meta.educationAt || "";
}

function inferRouteMode(meta = {}, routing = null) {
  if (meta.mode === "outdoor") return "outdoor";
  if (meta.mode === "academy") return "academy";
  if (routing && Object.keys(routing.outdoorAssets || {}).length) return "outdoor";
  return "academy";
}

function buildMissionVariantKey(baseKey = "A", existingLibrary = {}) {
  const normalizedBaseKey = String(baseKey || "").trim().toUpperCase();
  const currentKeys = Object.keys(existingLibrary || {})
    .map((key) => String(key || "").trim().toUpperCase())
    .filter((key) => key === normalizedBaseKey || key.startsWith(`${normalizedBaseKey}-`));
  let nextIndex = 1;
  while (currentKeys.includes(`${normalizedBaseKey}-${nextIndex}`)) nextIndex += 1;
  return `${normalizedBaseKey}-${nextIndex}`;
}

function buildCodeVariantKey(missionNumber = 1, existingVariants = {}) {
  const baseKey = getDefaultCodeKeyForMissionNumber(missionNumber).toUpperCase();
  const currentKeys = Object.keys(existingVariants || {})
    .map((key) => String(key || "").trim().toUpperCase())
    .filter((key) => key === baseKey || key.startsWith(`${baseKey}-`));
  let nextIndex = 1;
  while (currentKeys.includes(`${baseKey}-${nextIndex}`)) nextIndex += 1;
  return `${baseKey}-${nextIndex}`;
}

function applyAcademyExamplePreset() {
  const middleCount = Math.max(1, missionTotal - 2);
  const routeConfig = ensureRouteBuilderConfig();
  routeConfig.mode = "academy";
  if (elements.routeModeInput) elements.routeModeInput.value = "academy";
  if (elements.routeTemplateNameInput) elements.routeTemplateNameInput.value = "연수원 예시";
  routeConfig.missionKeys = buildDefaultRouteKeys(middleCount);
  ["S", ...routeConfig.missionKeys, "L"].forEach((key) => {
    routeConfig.missionLibrary[key] = routeConfig.missionLibrary[key] || createDefaultRouteMissionEntry(key);
  });
  const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
  for (let teamNumber = 1; teamNumber <= teamCount; teamNumber += 1) {
    const teamId = `Team${teamNumber}`;
    routeConfig.routes[teamId] = Array.from({ length: middleCount }, (_, routeIndex) => (
      routeConfig.missionKeys[(routeIndex + teamNumber - 1) % routeConfig.missionKeys.length] || routeConfig.missionKeys[0]
    ));
    routeConfig.codeRoutes[teamId] = Array.from({ length: middleCount }, (_, routeIndex) => getDefaultCodeKeyForMissionNumber(routeIndex + 2));
  }
  renderRouteBuilder();
  markRouteBuilderDirty();
  showAdminToast("연수원형 예시를 채웠습니다. 공통 코드와 팀별 미션 순서표를 기준으로 수정하세요.", "success", 3200);
}

function applyOutdoorExamplePreset() {
  missionTotal = 7;
  if (elements.missionCountInput) elements.missionCountInput.value = "7";
  const routeConfig = ensureRouteBuilderConfig();
  routeConfig.mode = "outdoor";
  if (elements.routeModeInput) elements.routeModeInput.value = "outdoor";
  if (elements.routeTemplateNameInput) elements.routeTemplateNameInput.value = "야외 8팀 예시";
  if (elements.teamCountInput) elements.teamCountInput.value = "8";
  renderTeamRows(8);
  routeConfig.missionKeys = ["A", "A-1", "A-2", "C", "D"];
  routeConfig.codeVariants = routeConfig.codeVariants || {};
  routeConfig.codeVariants[2] = routeConfig.codeVariants[2] || {};
  routeConfig.codeVariants[2]["2-1"] = {
    ...createDefaultRouteCodeVariantEntry("2", 2, 1),
    displayName: "코드 2-1",
    answer: "2-1",
  };
  routeConfig.missionLibrary.A = {
    ...(routeConfig.missionLibrary.A || createDefaultRouteMissionEntry("A")),
    displayName: "A",
  };
  routeConfig.missionLibrary["A-1"] = {
    ...(routeConfig.missionLibrary["A-1"] || createDefaultRouteMissionEntry("A-1")),
    displayName: "A-1",
  };
  routeConfig.missionLibrary["A-2"] = {
    ...(routeConfig.missionLibrary["A-2"] || createDefaultRouteMissionEntry("A-2")),
    displayName: "A-2",
  };
  routeConfig.missionLibrary.C = {
    ...(routeConfig.missionLibrary.C || createDefaultRouteMissionEntry("C")),
    displayName: "C",
  };
  routeConfig.missionLibrary.D = {
    ...(routeConfig.missionLibrary.D || createDefaultRouteMissionEntry("D")),
    displayName: "D",
  };
  const missionPreset = {
    Team1: ["A", "A-1", "A-2", "C", "D"],
    Team2: ["A", "A-1", "A-2", "D", "C"],
    Team3: ["A", "A-2", "A-1", "C", "D"],
    Team4: ["A", "A-2", "A-1", "D", "C"],
    Team5: ["C", "D", "A", "A-1", "A-2"],
    Team6: ["C", "D", "A", "A-2", "A-1"],
    Team7: ["D", "C", "A", "A-1", "A-2"],
    Team8: ["D", "C", "A", "A-2", "A-1"],
  };
  Object.entries(missionPreset).forEach(([teamId, route]) => {
    routeConfig.routes[teamId] = Array.from({ length: Math.max(1, missionTotal - 2) }, (_, index) => route[index] || "");
    routeConfig.codeRoutes[teamId] = Array.from({ length: Math.max(1, missionTotal - 2) }, (_, index) => {
      const missionNumber = index + 2;
      return missionNumber === 2 ? "2-1" : getDefaultCodeKeyForMissionNumber(missionNumber);
    });
  });
  renderRouteBuilder();
  markRouteBuilderDirty();
  showAdminToast("야외 8팀 예시를 채웠습니다. 팀표와 예외 키를 바로 수정해 사용할 수 있습니다.", "success", 3400);
}

try {
  const storedFilter = window.sessionStorage.getItem(MISSION_FILTER_STORAGE_KEY);
  if (storedFilter) {
    missionOverviewFilter = storedFilter;
  }
  const storedDensity = window.sessionStorage.getItem(MISSION_MODAL_DENSITY_STORAGE_KEY);
  if (storedDensity === "expanded" || storedDensity === "compact") {
    missionModalDensity = storedDensity;
  }
} catch (_error) {
  // Ignore sessionStorage access issues.
}

function showAdminToast(message, type = "info", duration = 2800) {
  if (!message || !elements.adminToastHost) return;
  const toast = document.createElement("div");
  toast.className = `admin-toast admin-toast--${type}`;
  toast.textContent = message;
  elements.adminToastHost.appendChild(toast);
  window.setTimeout(() => {
    toast.classList.add("is-leaving");
    window.setTimeout(() => toast.remove(), 180);
  }, duration);
}

function isRainModeEnabled(meta = null) {
  if (meta) {
    return meta.rainMode === true || meta.weatherMode === "rain";
  }
  return elements.rainModeInput?.checked === true;
}

function getSelectedRouteMode() {
  return elements.routeModeInput?.value === "outdoor" ? "outdoor" : "academy";
}

function isOutdoorRouteMode(routeConfig = routeBuilderConfig) {
  return (routeConfig?.mode || getSelectedRouteMode()) === "outdoor";
}

function getEffectiveRouteCodeEntry(entry = {}, missionNumber = 1, meta = null) {
  const source = entry && typeof entry === "object" ? entry : {};
  const rainMode = isRainModeEnabled(meta);
  const baseName = String(source.displayName || `코드 ${missionNumber}`).trim();
  const baseAnswer = String(source.answer || missionNumber || "1").trim() || "1";
  const baseImageUrl = String(source.imageUrl || "").trim();
  return {
    ...source,
    displayName: baseName,
    answer: baseAnswer,
    imageUrl: rainMode ? String(source.rainImageUrl || baseImageUrl).trim() || baseImageUrl : baseImageUrl,
  };
}

function resolveRouteCodeKey(teamId, missionNumber) {
  const routeConfig = ensureRouteBuilderConfig();
  if (missionNumber <= 1) return getRouteStartCodeKey(routeConfig, teamId);
  if (missionNumber >= missionTotal) return getRouteEndCodeKey(routeConfig, teamId);
  const routeIndex = missionNumber - 2;
  return normalizeCodeRouteToken(routeConfig.codeRoutes?.[teamId]?.[routeIndex] || getDefaultCodeKeyForMissionNumber(missionNumber)).trim().toUpperCase();
}

function getRouteCodeEntry(routeConfig, codeKey = "", missionNumber = 1, meta = null) {
  const normalizedKey = normalizeCodeRouteToken(codeKey).trim().toUpperCase();
  const baseKey = extractCodeVariantBase(normalizedKey) || getDefaultCodeKeyForMissionNumber(missionNumber).toUpperCase();
  const defaultNumber = Number(baseKey) || missionNumber;
  if (normalizedKey && normalizedKey !== baseKey) {
    return getEffectiveRouteCodeEntry(
      routeConfig.codeVariants?.[defaultNumber]?.[normalizedKey]
      || createDefaultRouteCodeVariantEntry(baseKey, defaultNumber, Number(normalizedKey.split("-")[1]) || 1),
      defaultNumber,
      meta,
    );
  }
  return getEffectiveRouteCodeEntry(
    routeConfig.codeLibrary?.[defaultNumber] || createDefaultRouteCodeEntry(defaultNumber),
    defaultNumber,
    meta,
  );
}

function hasRouteCodeKey(routeConfig, codeKey = "", missionNumber = 1) {
  const normalizedKey = normalizeCodeRouteToken(codeKey).trim().toUpperCase();
  if (!normalizedKey) return false;
  const baseKey = extractCodeVariantBase(normalizedKey);
  const codeNumber = Number(baseKey);
  if (!codeNumber) return false;
  if (normalizedKey === baseKey) return Boolean(routeConfig.codeLibrary?.[codeNumber]);
  return Boolean(routeConfig.codeVariants?.[codeNumber]?.[normalizedKey]);
}

function getEffectiveRouteMissionEntry(entry = {}, routeKey = "", meta = null) {
  const source = entry && typeof entry === "object" ? entry : {};
  const rainMode = isRainModeEnabled(meta);
  const baseName = String(source.displayName || routeKey).trim();
  const baseTemplate = normalizeRouteAnswerTemplate(source.answerTemplate || "", routeKey);
  const baseImageUrl = String(source.imageUrl || "").trim();
  return {
    ...source,
    displayName: baseName,
    answerTemplate: baseTemplate,
    imageUrl: rainMode ? String(source.rainImageUrl || baseImageUrl).trim() || baseImageUrl : baseImageUrl,
  };
}

async function hashSecret(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized || !window.crypto?.subtle || typeof TextEncoder === "undefined") {
    return normalized;
  }
  const data = new TextEncoder().encode(normalized);
  const digest = await window.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hasPhotoApproveSecret(projectId = currentProjectId) {
  const meta = projectId ? projectsCache[projectId]?.meta || {} : {};
  const draftValue = elements.photoApprovalPasswordInput?.value.trim() || "";
  return Boolean(draftValue || meta.photoApprovalPasswordHash || meta.photoApprovalPassword);
}

function renderLoginPreview() {
  if (!elements.loginPreviewCard) return;
  const theme = LOGIN_THEME_PREVIEW_MAP[elements.loginThemeInput?.value || "midnight"] || LOGIN_THEME_PREVIEW_MAP.midnight;
  const backgroundUrl = metaLoginBackgroundUrl || "";
  const backgroundLayers = [];
  if (backgroundUrl) {
    backgroundLayers.push(
      `linear-gradient(135deg, rgba(5, 10, 20, 0.72), rgba(5, 10, 20, 0.48))`,
      `url("${backgroundUrl.replace(/"/g, '\\"')}")`
    );
  }
  backgroundLayers.push(theme.background);
  [elements.loginPreviewCard, elements.teamLoginPreviewCard].forEach((card) => {
    if (!card) return;
    card.style.backgroundImage = backgroundLayers.join(", ");
    card.style.backgroundSize = backgroundUrl ? "cover" : "";
    card.style.backgroundPosition = backgroundUrl ? "center" : "";
    card.style.setProperty("--login-preview-accent", theme.accent);
  });

  const title = elements.loginTitleInput?.value.trim() || elements.projectNameInput?.value.trim() || "프로젝트 정보를 입력하세요.";
  const subtitle = elements.loginSubtitleInput?.value.trim() || "";
  const notice = elements.loginNoticeInput?.value.trim() || "";
  const unlockLabel = elements.loginUnlockLabelInput?.value.trim() || "확인";
  const teamLabel = elements.loginTeamButtonLabelInput?.value.trim() || "팀 입장";
  [elements.loginPreviewLogo, elements.teamLoginPreviewLogo].forEach((logo) => {
    if (!logo) return;
    logo.src = metaLogoUrl || "";
    logo.classList.toggle("hidden", !metaLogoUrl);
  });
  [elements.loginPreviewTitle, elements.teamLoginPreviewTitle].forEach((node) => {
    if (node) node.textContent = title;
  });
  [elements.loginPreviewSubtitle, elements.teamLoginPreviewSubtitle].forEach((node) => {
    if (!node) return;
    node.textContent = subtitle;
    node.classList.toggle("hidden", !subtitle);
  });
  if (elements.loginPreviewDates) {
    elements.loginPreviewDates.textContent = "";
    elements.loginPreviewDates.classList.add("hidden");
  }
  [elements.loginPreviewNotice, elements.teamLoginPreviewNotice].forEach((node) => {
    if (!node) return;
    node.textContent = notice;
    node.classList.toggle("hidden", !notice);
  });
  if (elements.loginPreviewUnlock) elements.loginPreviewUnlock.textContent = unlockLabel;
  if (elements.loginPreviewTeam) elements.loginPreviewTeam.textContent = teamLabel;
  if (elements.loginBackgroundPreview) {
    elements.loginBackgroundPreview.src = backgroundUrl || "";
    elements.loginBackgroundPreview.classList.toggle("hidden", !backgroundUrl);
  }
}

function applyMissionModalDensity() {
  const modalContent = elements.missionModal?.querySelector(".modal-content");
  if (!modalContent) return;
  modalContent.classList.toggle("mission-modal--compact", missionModalDensity === "compact");
  if (elements.missionModalDensityToggle) {
    elements.missionModalDensityToggle.textContent =
      missionModalDensity === "compact" ? "썸네일 보기" : "입력 집중";
  }
  try {
    window.sessionStorage.setItem(MISSION_MODAL_DENSITY_STORAGE_KEY, missionModalDensity);
  } catch (_error) {
    // Ignore sessionStorage access issues.
  }
}

function setActiveMissionRow(missionNumber = "1") {
  activeMissionRow = String(missionNumber || "1");
  if (!elements.missionModalBody) return;
  elements.missionModalBody.querySelectorAll("tr[data-mission]").forEach((row) => {
    row.classList.toggle("is-active", row.dataset.mission === activeMissionRow);
  });
  elements.missionModalJumpbar?.querySelectorAll("[data-mission-jump]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.missionJump === activeMissionRow);
  });
}

function renderMissionJumpbar() {
  if (!elements.missionModalJumpbar) return;
  const buttons = [];
  for (let i = 1; i <= missionTotal; i++) {
    const status = getMissionJumpStatus(activeMissionTeam, String(i));
    buttons.push(`
      <button
        type="button"
        class="mission-jump-chip mission-jump-chip--${status}${String(i) === activeMissionRow ? " is-active" : ""}"
        data-mission-jump="${i}"
      >
        M${i}
      </button>
    `);
  }
  elements.missionModalJumpbar.innerHTML = buttons.join("");
  elements.missionModalJumpbar.querySelectorAll("[data-mission-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      const missionNumber = button.dataset.missionJump || "1";
      setActiveMissionRow(missionNumber);
      const row = elements.missionModalBody?.querySelector(`tr[data-mission="${missionNumber}"]`);
      row?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
}

function getMissionJumpStatus(teamId, missionNumber) {
  const config = ensureMissionConfig(teamId || activeMissionTeam || "Team1");
  const mission = normalizeMissionEntry(config[missionNumber] || {});
  const codeStep = getStepConfig(mission, "codeStep");
  const missionStep = getStepConfig(mission, "missionStep");
  const photoConfig = getPhotoConfigFromMission(mission);

  const missingCodeValue = needsAnswerField(codeStep.mode) && !(codeStep.answer || "").trim();
  const missingMissionValue = needsAnswerField(missionStep.mode) && !(missionStep.answer || "").trim();
  const missingPhotoSlot = usesPhotoStep(mission) && normalizeCount(photoConfig.photoSlots) <= 0;
  const missingCodeImage = !mission.codeImageUrl;
  const missingMissionImage = !mission.missionImageUrl;

  if (missingCodeValue || missingMissionValue || missingPhotoSlot) {
    return "warn";
  }
  if (missingCodeImage || missingMissionImage) {
    return "soft";
  }
  return "ready";
}

function getMissionIssueOrder(teamId) {
  const order = [];
  for (let i = 1; i <= missionTotal; i++) {
    const missionNumber = String(i);
    const status = getMissionJumpStatus(teamId, missionNumber);
    if (status === "warn" || status === "soft") {
      order.push(missionNumber);
    }
  }
  return order;
}

function formatPreviewDate(value = "") {
  if (!value) return "";
  const parsed = parseDateTimeLocal(value);
  if (!parsed) return "";
  return new Date(parsed).toLocaleDateString("ko-KR");
}

function filterOpsTimelineItems(items = [], filter = "all") {
  const groups = {
    announcement: new Set(["announcement_broadcast", "announcement_team"]),
    approve: new Set(["hq_step_approve", "hq_photo_approve"]),
    retry: new Set(["hq_photo_retry"]),
    bypass: new Set(["mission_bypass"]),
  };
  if (!groups[filter]) return items;
  return items.filter((item) => groups[filter].has(item.action || ""));
}

function requestAdminConfirm(title, message, confirmLabel = "진행") {
  return new Promise((resolve) => {
    confirmModalResolver = resolve;
    if (elements.confirmModalTitle) elements.confirmModalTitle.textContent = title;
    if (elements.confirmModalMessage) elements.confirmModalMessage.textContent = message;
    if (elements.confirmModalSubmit) elements.confirmModalSubmit.textContent = confirmLabel;
    elements.confirmModal?.classList.add("active");
    if (elements.confirmModal) elements.confirmModal.hidden = false;
  });
}

function closeConfirmModal(confirmed = false) {
  elements.confirmModal?.classList.remove("active");
  if (elements.confirmModal) elements.confirmModal.hidden = true;
  if (confirmModalResolver) {
    const resolve = confirmModalResolver;
    confirmModalResolver = null;
    resolve(confirmed);
  }
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

function buildProjectIdBase(value = "") {
  const normalized = sanitizeKey(String(value || ""))
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
  return normalized || "project";
}

function generateProjectId(name = "", excludeProjectId = null) {
  const base = buildProjectIdBase(name);
  const usedIds = new Set(
    Object.keys(projectsCache).filter((projectId) => projectId !== excludeProjectId)
  );
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function setActionBusy(action, busy) {
  actionLocks[action] = busy;
  const buttonMap = {
    save: elements.saveBtn,
    reset: [elements.resetBtn, elements.resetTopBtn].filter(Boolean),
    delete: elements.deleteProjectBtn,
    clone: elements.cloneProjectBtn,
    migrate: elements.normalizeMissionSchemaBtn,
    export: elements.exportBtn,
    finish: elements.finishBtn,
    exportOps: elements.exportOpsLogBtn,
  };
  const button = buttonMap[action];
  (Array.isArray(button) ? button : [button]).forEach((target) => {
    if (target) target.disabled = busy;
  });
  syncActionAvailability();
}

function maskMasterPassword(value = "") {
  if (!value) return "-";
  if (value.length <= 2) return "•".repeat(value.length);
  return `${value.slice(0, 1)}${"•".repeat(Math.max(2, value.length - 2))}${value.slice(-1)}`;
}

function getDefaultTeamPassword(teamNumber) {
  return `T${teamNumber}`;
}

function resolveTeamPassword(password, teamNumber) {
  const trimmed = String(password || "").trim();
  if (!trimmed || trimmed === "1") {
    return getDefaultTeamPassword(teamNumber);
  }
  return trimmed;
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function resolveProjectId() {
  return currentProjectId || "";
}

function getDraftProjectId() {
  if (currentProjectId) return currentProjectId;
  const projectName = elements.projectNameInput?.value.trim() || "";
  if (!projectName) return "";
  return generateProjectId(projectName);
}

function refreshProjectIdField() {
  if (!elements.projectIdInput) return;
  const projectId = currentProjectId || getDraftProjectId();
  elements.projectIdInput.value = projectId;
}

function buildPageUrl(pageName, searchParams = null) {
  const targetUrl = new URL(`./${pageName}`, window.location.href);
  if (searchParams instanceof URLSearchParams) {
    targetUrl.search = searchParams.toString();
  }
  return targetUrl.toString();
}

function setProjectLoadStatus(message, type = "info") {
  if (!elements.projectLoadStatus) return;
  elements.projectLoadStatus.textContent = message;
  elements.projectLoadStatus.dataset.state = type;
  lastProjectLoadState = type;
  renderProjectLoadMeta();
}

function renderProjectLoadMeta() {
  if (!elements.projectLoadMeta) return;
  const total = Object.keys(projectsCache).length;
  const filtered = Object.entries(projectsCache).filter(([id, project]) => {
    if (!projectListSearch) return true;
    const name = `${project.meta?.name || ""} ${id}`.toLowerCase();
    return name.includes(projectListSearch);
  }).length;
  const connectionLabel = isFirebaseConnected === null
    ? "연결 확인 중"
    : isFirebaseConnected
      ? "Firebase 연결됨"
      : "Firebase 연결 끊김";
  const searchLabel = projectListSearch
    ? `검색 결과 ${filtered}/${total}개`
    : `전체 ${total}개`;
  const helper = lastProjectLoadState === "error"
    ? "권한 또는 네트워크 문제면 목록이 비어 보여도 기존 데이터는 남아 있을 수 있습니다."
    : "목록이 비어 보이면 검색창과 연결 상태를 먼저 확인하세요.";
  elements.projectLoadMeta.textContent = `${connectionLabel} · ${searchLabel} · ${helper}`;
  elements.projectLoadMeta.dataset.state = lastProjectLoadState;
}

function setActiveAdminTab(tabId = "basic") {
  activeAdminTab = tabId;
  elements.adminTabs.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tabTarget === tabId);
  });
  elements.adminTabPanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.tabPanel === tabId);
  });
}

function focusEditorTop(tabId = "basic") {
  setActiveAdminTab(tabId);
  if (elements.editorScroll) {
    elements.editorScroll.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function formatSavedAt(timestamp) {
  if (!timestamp) return "저장 이력 없음";
  return `마지막 저장 ${new Date(timestamp).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;
}

function renderSaveState() {
  if (elements.projectSaveBadge) {
    elements.projectSaveBadge.dataset.state = dirtyState.project ? "dirty" : "saved";
    elements.projectSaveBadge.textContent = dirtyState.project ? "프로젝트 변경 있음" : "프로젝트 저장됨";
  }
  if (elements.missionSaveBadge) {
    elements.missionSaveBadge.dataset.state = dirtyState.mission ? "dirty" : "saved";
    elements.missionSaveBadge.textContent = dirtyState.mission ? "미션 변경 있음" : "미션 저장됨";
  }
  if (elements.routeSyncBadge) {
    elements.routeSyncBadge.dataset.state = routeApplyNeeded ? "dirty" : "saved";
    elements.routeSyncBadge.textContent = routeApplyNeeded ? "배치표 재생성 필요" : "배치표 적용됨";
  }
  if (elements.routeInferenceBadge) {
    elements.routeInferenceBadge.dataset.state = routeBuilderInferred ? "warn" : "saved";
    elements.routeInferenceBadge.textContent = routeBuilderInferred ? "배치표 추정 상태" : "배치표 확정됨";
  }
  if (elements.lastSavedAt) {
    elements.lastSavedAt.textContent = formatSavedAt(lastSavedAtValue);
  }
}

function renderCurrentProjectBar() {
  if (!elements.currentProjectTitle || !elements.currentProjectMeta) return;
  const projectName = elements.projectNameInput?.value.trim();
  const projectId = currentProjectId || getDraftProjectId();
  const status = elements.projectStatusInput?.value || "planned";
  const statusLabel = status === "running" ? "진행중" : status === "finished" ? "종료" : "준비중";

  if (currentProjectId && projectsCache[currentProjectId]) {
    elements.currentProjectTitle.textContent = projectName || currentProjectId;
    elements.currentProjectMeta.textContent = `기존 프로젝트 편집 중 · ID ${projectId || currentProjectId} · 상태 ${statusLabel}${routeBuilderInferred ? " · 배치표 추정 상태" : ""}${routeApplyNeeded ? " · 배치표 재생성 필요" : ""}`;
    return;
  }

  if (projectName || projectId) {
    elements.currentProjectTitle.textContent = projectName || "새 프로젝트";
    elements.currentProjectMeta.textContent = `새 프로젝트 작성 중 · 예정 ID ${projectId || "미정"} · 상태 ${statusLabel}${routeBuilderInferred ? " · 배치표 추정 상태" : ""}${routeApplyNeeded ? " · 배치표 재생성 필요" : ""}`;
    return;
  }

  elements.currentProjectTitle.textContent = "새 프로젝트 작성 중";
  elements.currentProjectMeta.textContent = "프로젝트를 선택하거나 새로 입력해 시작하세요.";
}

function syncActionAvailability() {
  const hasSavedProject = Boolean(currentProjectId && projectsCache[currentProjectId]);
  const hasSelection = selectedProjects.size > 0;
  const canClone = hasSavedProject || hasSelection;

  if (elements.openHQBtn && !actionLocks.save) {
    elements.openHQBtn.disabled = !hasSavedProject;
  }
  if (elements.openReviewBtn && !actionLocks.save) {
    elements.openReviewBtn.disabled = !hasSavedProject;
  }
  if (elements.copyTeamLoginLinkBtn && !actionLocks.save) {
    elements.copyTeamLoginLinkBtn.disabled = !hasSavedProject;
  }
  if (elements.showTeamLoginQrBtn && !actionLocks.save) {
    elements.showTeamLoginQrBtn.disabled = !hasSavedProject;
  }
  if (elements.copyTeamLoginQrBtn && !actionLocks.save) {
    elements.copyTeamLoginQrBtn.disabled = !hasSavedProject;
  }
  if (elements.openPhotoApproveBtn && !actionLocks.save) {
    elements.openPhotoApproveBtn.disabled = !hasSavedProject;
  }
  if (elements.copyPhotoApproveLinkBtn && !actionLocks.save) {
    elements.copyPhotoApproveLinkBtn.disabled = !hasSavedProject;
  }
  if (elements.showPhotoApproveQrBtn && !actionLocks.save) {
    elements.showPhotoApproveQrBtn.disabled = !hasSavedProject;
  }
  if (elements.normalizeMissionSchemaBtn && !actionLocks.migrate) {
    elements.normalizeMissionSchemaBtn.disabled = !hasSavedProject;
  }
  if (elements.applyRouteMatrixBtn && !actionLocks.routeApply) {
    elements.applyRouteMatrixBtn.disabled = !hasSavedProject && !getDraftProjectId();
  }
  if (elements.exportBtn && !actionLocks.export) {
    elements.exportBtn.disabled = !hasSavedProject;
  }
  if (elements.exportOpsLogBtn && !actionLocks.exportOps) {
    elements.exportOpsLogBtn.disabled = !hasSavedProject;
  }
  if (elements.finishBtn && !actionLocks.finish) {
    elements.finishBtn.disabled = !hasSavedProject;
  }
  if (elements.resetBtn && !actionLocks.reset) {
    elements.resetBtn.disabled = !hasSavedProject;
  }
  if (elements.resetTopBtn && !actionLocks.reset) {
    elements.resetTopBtn.disabled = !hasSavedProject;
  }
  if (elements.cloneProjectBtn && !actionLocks.clone) {
    elements.cloneProjectBtn.disabled = !canClone;
  }
  if (elements.deleteProjectBtn && !actionLocks.delete) {
    elements.deleteProjectBtn.disabled = !hasSelection;
  }
  if (elements.gotoTeamsBtn) {
    elements.gotoTeamsBtn.disabled = false;
  }
  if (elements.gotoMissionsBtn) {
    elements.gotoMissionsBtn.disabled = !hasSavedProject && !getDraftProjectId();
  }
  if (elements.gotoOpsBtn) {
    elements.gotoOpsBtn.disabled = !hasSavedProject;
  }

  if (!elements.actionHint) return;
  if (!hasSavedProject) {
    elements.actionHint.textContent = "프로젝트를 한 번 저장해야 HQ 보기, 결과 export, 종료, 초기화 같은 운영 기능을 사용할 수 있습니다.";
    return;
  }
  if (routeBuilderInferred) {
    elements.actionHint.textContent = "이 프로젝트는 기존 팀별 미션에서 배치표를 추정해 표시 중입니다. 확인 후 저장하거나 `저장 후 배치표 적용`으로 새 구조를 확정하세요.";
    return;
  }
  if (routeApplyNeeded) {
    elements.actionHint.textContent = "공통 코드/공통 미션/팀 배치표 변경이 팀별 미션 설정에 아직 반영되지 않았습니다. `배치표로 팀별 미션 생성`을 먼저 실행하세요.";
    return;
  }
  if (dirtyState.project || dirtyState.mission) {
    const pending = [
      dirtyState.project ? "프로젝트 변경" : "",
      dirtyState.mission ? "미션 변경" : "",
    ].filter(Boolean).join(" / ");
    elements.actionHint.textContent = `${pending}이 아직 저장되지 않았습니다. 운영 전에 저장 상태를 확인하세요.`;
    return;
  }
  const tabHintMap = {
    basic: "기본정보를 확인하는 중입니다. 저장 후 필요한 다음 탭으로 바로 이어집니다.",
    teams: "팀 비밀번호를 확인하는 중입니다. 기본 비밀번호 그대로인 팀이 없는지 먼저 보세요.",
    missions: getMissionActionContextText(),
    ops: "운영 준비를 확인하는 중입니다. 리허설과 HQ 진입을 마지막으로 점검하세요.",
  };
  elements.actionHint.textContent = tabHintMap[activeAdminTab] || "현재 선택한 프로젝트 기준으로 HQ, export, 종료, 초기화 기능을 사용할 수 있습니다.";
}

function renderSetupRoadmap() {
  if (!elements.setupRoadmap) return;
  const hasName = Boolean(elements.projectNameInput?.value.trim());
  const hasMaster = Boolean(elements.masterPasswordInput?.value.trim());
  const hasSchedule = Boolean(parseDateTimeLocal(elements.endDateInput?.value));
  const teams = collectTeamProfiles();
  const teamCount = Object.keys(teams).length;
  const hasTeamPasswords = teamCount > 0 && Object.values(teams).every((team) => Boolean(team.password));
  const missionHealth = analyzeMissionConfiguration(Object.keys(teams));
  const missionReady = missionHealth.placeholderCount === 0 && missionHealth.missingCodeImages === 0 && missionHealth.missingMissionImages === 0;
  const hasSavedProject = Boolean(currentProjectId && projectsCache[currentProjectId]);

  const steps = [
    {
      title: "기본정보",
      done: hasName && hasMaster && hasSchedule,
      active: !hasName || !hasMaster || !hasSchedule,
      meta: hasName && hasMaster && hasSchedule ? "이름, 패스워드, 종료시간 설정 완료" : "이름, 마스터 패스워드, 종료시간 확인",
    },
    {
      title: "팀 설정",
      done: hasTeamPasswords,
      active: hasName && hasMaster && !hasTeamPasswords,
      meta: hasTeamPasswords ? `팀 ${teamCount}개 비밀번호 준비 완료` : "팀 비밀번호를 확인하세요",
    },
    {
      title: "미션 설정",
      done: missionReady,
      active: hasTeamPasswords && !missionReady,
      meta: missionReady ? `미션 ${missionTotal}개 설정 완료` : "정답과 이미지 누락을 채우세요",
    },
    {
      title: "운영 준비",
      done: hasSavedProject && !dirtyState.project && !dirtyState.mission,
      active: hasSavedProject,
      meta: hasSavedProject ? "저장 후 HQ/운영 탭으로 진행 가능" : "한 번 저장하면 운영 기능이 열립니다.",
    },
  ];

  elements.setupRoadmap.innerHTML = steps
    .map((step, index) => {
      const state = step.done ? "done" : step.active ? "active" : "pending";
      const badge = step.done ? "완료" : String(index + 1);
      return `
        <div class="setup-step" data-state="${state}">
          <div class="setup-step__state">${badge}</div>
          <div class="setup-step__title">${step.title}</div>
          <div class="setup-step__meta">${step.meta}</div>
        </div>
      `;
    })
    .join("");
}

function markDirty(scope = "project") {
  if (scope !== "project" && scope !== "mission") return;
  dirtyState[scope] = true;
  renderSaveState();
  renderCurrentProjectBar();
  syncActionAvailability();
}

function markRouteBuilderDirty() {
  routeApplyNeeded = true;
  renderSaveState();
  renderCurrentProjectBar();
  renderLaunchReadiness();
  renderStartGatePanel();
  markDirty("project");
}

function markSaved(scope = "project", timestamp = Date.now()) {
  if (scope !== "project" && scope !== "mission") return;
  dirtyState[scope] = false;
  if (timestamp) {
    lastSavedAtValue = Math.max(Number(lastSavedAtValue) || 0, Number(timestamp) || 0);
  }
  renderSaveState();
  renderCurrentProjectBar();
  syncActionAvailability();
}

function resetSaveState(timestamp = null) {
  dirtyState.project = false;
  dirtyState.mission = false;
  routeApplyNeeded = false;
  routeBuilderInferred = false;
  lastSavedAtValue = timestamp || null;
  renderSaveState();
  renderCurrentProjectBar();
  syncActionAvailability();
}

function getProjectIdOrAlert(message = "먼저 프로젝트를 한 번 저장하세요.") {
  const projectId = resolveProjectId();
  if (!projectId) {
    showAdminToast(message, "warn", 3000);
    return null;
  }
  return projectId;
}

function runAdminStep(label, callback, options = {}) {
  if (typeof callback !== "function") return undefined;
  try {
    return callback();
  } catch (error) {
    console.error(`[admin] ${label} failed`, error);
    if (options.notify !== false) {
      setProjectLoadStatus(
        `관리자 화면 초기화 중 일부 항목(${label})에서 오류가 발생했습니다. 기본 목록 로딩은 계속 시도합니다.`,
        "warn",
      );
    }
    return undefined;
  }
}

function applyLoadedProjects(projects, source = "primary") {
  projectsCache = projects || {};
  if (source === "primary") projectsLoadedFromPrimary = true;
  try {
    window.localStorage.setItem(PROJECTS_CACHE_STORAGE_KEY, JSON.stringify(projectsCache));
  } catch {
    // Ignore storage failures.
  }
  const projectCount = Object.keys(projectsCache).length;
  setProjectLoadStatus(
    projectCount > 0
      ? `프로젝트 ${projectCount}개를 불러왔습니다.${source === "fallback" ? " (대체 경로)" : source === "cache" ? " (임시 캐시)" : ""}`
      : "등록된 프로젝트가 없습니다.",
    projectCount > 0 ? "ok" : "warn"
  );
  runAdminStep("renderProjectList", renderProjectList, { notify: false });
  runAdminStep("renderProjectLoadMeta", renderProjectLoadMeta, { notify: false });
  runAdminStep("syncActionAvailability", syncActionAvailability, { notify: false });
  runAdminStep("renderSetupRoadmap", renderSetupRoadmap);
  runAdminStep("renderLaunchReadiness", renderLaunchReadiness);
  runAdminStep("renderStartGatePanel", renderStartGatePanel);
  runAdminStep("renderRehearsalPanel", renderRehearsalPanel);
  const persistedProjectId = getPersistedLastProjectId();
  if (currentProjectId && projectsCache[currentProjectId]) {
    runAdminStep("fillForm", () => fillForm(currentProjectId));
  } else if (persistedProjectId && projectsCache[persistedProjectId]) {
    runAdminStep("fillForm", () => fillForm(persistedProjectId));
  } else {
    if (persistedProjectId && !projectsCache[persistedProjectId]) {
      persistLastProjectId("");
    }
    runAdminStep("refreshProjectIdField", refreshProjectIdField, { notify: false });
    runAdminStep("renderProjectChecklist", renderProjectChecklist);
    runAdminStep("renderMissionOverview", renderMissionOverview);
    runAdminStep("renderCurrentProjectBar", renderCurrentProjectBar, { notify: false });
    runAdminStep("syncActionAvailability", syncActionAvailability, { notify: false });
    runAdminStep("renderSetupRoadmap", renderSetupRoadmap);
    runAdminStep("renderLaunchReadiness", renderLaunchReadiness);
    runAdminStep("renderStartGatePanel", renderStartGatePanel);
    runAdminStep("renderRehearsalPanel", renderRehearsalPanel);
  }
}

function loadProjectsFromCache() {
  try {
    const raw = window.localStorage.getItem(PROJECTS_CACHE_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return false;
    if (!Object.keys(parsed).length) return false;
    applyLoadedProjects(parsed, "cache");
    return true;
  } catch {
    return false;
  }
}

async function loadProjectsFallback(reason = "fallback") {
  if (projectsFallbackAttempted) return;
  projectsFallbackAttempted = true;
  try {
    const response = await fetch(PROJECTS_REST_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`projects-rest-${response.status}`);
    const data = await response.json();
    applyLoadedProjects(data || {}, "fallback");
  } catch (error) {
    console.error("[admin] projects fallback failed", reason, error);
    setProjectLoadStatus("프로젝트 목록을 불러오지 못했습니다. 새로고침 후 다시 확인하세요.", "error");
  }
}

init();

function init() {
  initializeMissionState();
  loadRouteTemplates();
  renderPhotoMissionTemplates();
  runAdminStep("renderTeamRows", () => renderTeamRows(Number(elements.teamCountInput?.value) || defaultTeamCount), { notify: false });
  runAdminStep("renderRouteBuilder", renderRouteBuilder);
  runAdminStep("refreshProjectIdField", refreshProjectIdField, { notify: false });
  runAdminStep("renderProjectChecklist", renderProjectChecklist);
  runAdminStep("renderProjectSummary", renderProjectSummary);
  runAdminStep("renderMissionOverview", renderMissionOverview);
  runAdminStep("renderLaunchReadiness", renderLaunchReadiness);
  runAdminStep("renderStartGatePanel", renderStartGatePanel);
  runAdminStep("renderRehearsalPanel", renderRehearsalPanel);
  runAdminStep("renderSaveState", renderSaveState, { notify: false });
  runAdminStep("renderCurrentProjectBar", renderCurrentProjectBar, { notify: false });
  runAdminStep("syncActionAvailability", syncActionAvailability, { notify: false });
  runAdminStep("renderSetupRoadmap", renderSetupRoadmap);
  runAdminStep("attachEventHandlers", attachEventHandlers);
  void get(projectsRef)
    .then((snapshot) => {
      if (snapshot.exists()) {
        applyLoadedProjects(snapshot.val() || {}, "primary");
      } else {
        applyLoadedProjects({}, "primary");
      }
    })
    .catch((error) => {
      console.error("[admin] projects initial get failed", error);
      if (!loadProjectsFromCache()) {
        void loadProjectsFallback(error?.code || "initial-get-error");
      }
    });
  window.setTimeout(() => {
    if (!projectsLoadedFromPrimary && !Object.keys(projectsCache).length) {
      if (!loadProjectsFromCache()) {
        void loadProjectsFallback("timeout");
      }
    }
  }, 3500);
  onValue(projectsRef, (snapshot) => {
    applyLoadedProjects(snapshot.val() || {}, "primary");
  }, (error) => {
    console.error("Failed to load projects", error);
    if (!loadProjectsFromCache()) {
      void loadProjectsFallback(error?.code || "subscription-error");
    }
  });
  onValue(ref(db, ".info/connected"), (snapshot) => {
    isFirebaseConnected = snapshot.val() === true;
    runAdminStep("renderProjectLoadMeta", renderProjectLoadMeta, { notify: false });
  });
  onValue(ref(db, "uploads_meta"), (snapshot) => {
    uploadsMetaCache = snapshot.val() || {};
    runAdminStep("renderProjectSummary", renderProjectSummary);
    runAdminStep("renderLaunchReadiness", renderLaunchReadiness);
    runAdminStep("renderStartGatePanel", renderStartGatePanel);
    runAdminStep("renderRehearsalPanel", renderRehearsalPanel);
  });
}

function initializeMissionState() {
  missionConfigs = {};
  routeBuilderConfig = createDefaultRouteBuilderConfig();
  for (let i = 1; i <= defaultTeamCount; i++) {
    const teamId = `Team${i}`;
    missionConfigs[teamId] = createDefaultMissionConfig();
  }
}

function attachEventHandlers() {
  elements.newProjectBtn.addEventListener("click", () => {
    clearForm();
    currentProjectId = null;
    focusEditorTop("basic");
    elements.projectNameInput.focus();
  });

  if (elements.deleteProjectBtn) {
    elements.deleteProjectBtn.addEventListener("click", handleDeleteProject);
  }
  if (elements.cloneProjectBtn) {
    elements.cloneProjectBtn.addEventListener("click", handleCloneProject);
  }
  if (elements.projectSearchInput) {
    elements.projectSearchInput.addEventListener("input", (event) => {
      projectListSearch = String(event.target.value || "").trim().toLowerCase();
      renderProjectList();
      renderProjectLoadMeta();
    });
  }

  if (elements.projectForm) {
    elements.projectForm.addEventListener("submit", (event) => {
      event.preventDefault();
    });
    elements.projectForm.addEventListener("input", () => {
      markDirty("project");
      refreshProjectIdField();
      renderProjectChecklist();
      renderCurrentProjectBar();
      renderSetupRoadmap();
      renderLaunchReadiness();
      renderStartGatePanel();
      renderLoginPreview();
    });
    elements.projectForm.addEventListener("change", () => {
      markDirty("project");
      refreshProjectIdField();
      renderProjectChecklist();
      renderCurrentProjectBar();
      renderSetupRoadmap();
      renderLaunchReadiness();
      renderStartGatePanel();
      renderLoginPreview();
    });
  }
  renderLoginPreview();

  elements.adminTabs.forEach((button) => {
    button.addEventListener("click", () => setActiveAdminTab(button.dataset.tabTarget));
  });

  elements.gotoTeamsBtn?.addEventListener("click", () => focusEditorTop("teams"));
  elements.gotoMissionsBtn?.addEventListener("click", () => focusEditorTop("missions"));
  elements.gotoOpsBtn?.addEventListener("click", () => focusEditorTop("ops"));
  elements.openLoginPreviewBtn?.addEventListener("click", () => {
    const projectId = resolveProjectId();
    if (!projectId) {
      showAdminToast("입장 화면은 프로젝트 저장 후 실제로 확인할 수 있습니다.", "warn", 3000);
      return;
    }
    const params = new URLSearchParams({ project: projectId, entry: "project" });
    window.open(buildPageUrl("team_login.html", params), "_blank");
  });
  elements.openTeamLoginPreviewBtn?.addEventListener("click", () => {
    const projectId = resolveProjectId();
    if (!projectId) {
      showAdminToast("팀 로그인 화면은 프로젝트 저장 후 실제로 확인할 수 있습니다.", "warn", 3000);
      return;
    }
    const params = new URLSearchParams({ project: projectId });
    window.open(buildPageUrl("team_login.html", params), "_blank");
  });
  elements.openTeamLoginBtn?.addEventListener("click", () => {
    const projectId = resolveProjectId();
    const params = projectId ? new URLSearchParams({ project: projectId }) : null;
    window.open(buildPageUrl("team_login.html", params), "_blank");
  });
  elements.copyTeamLoginLinkBtn?.addEventListener("click", async () => {
    const projectId = getProjectIdOrAlert("먼저 프로젝트를 선택하거나 저장하세요.");
    if (!projectId || !projectsCache[projectId]) {
      showAdminToast("먼저 프로젝트를 선택하거나 저장하세요.", "warn", 2800);
      return;
    }
    const teamLoginUrl = buildPageUrl(
      "team_login.html",
      new URLSearchParams({ project: projectId })
    );
    try {
      await navigator.clipboard.writeText(teamLoginUrl);
      showAdminToast("팀 로그인 링크를 복사했습니다.", "success", 2800);
    } catch (_error) {
      showAdminToast("팀 로그인 링크 복사에 실패했습니다.", "error", 3000);
    }
  });
  elements.showTeamLoginQrBtn?.addEventListener("click", () => {
    const projectId = getProjectIdOrAlert("먼저 프로젝트를 선택하거나 저장하세요.");
    if (!projectId || !projectsCache[projectId]) {
      showAdminToast("먼저 프로젝트를 선택하거나 저장하세요.", "warn", 2800);
      return;
    }
    renderTeamLoginQr(projectId);
  });
  elements.copyTeamLoginQrBtn?.addEventListener("click", async () => {
    const projectId = getProjectIdOrAlert("먼저 프로젝트를 선택하거나 저장하세요.");
    if (!projectId || !projectsCache[projectId]) {
      showAdminToast("먼저 프로젝트를 선택하거나 저장하세요.", "warn", 2800);
      return;
    }
    const teamLoginUrl = buildPageUrl(
      "team_login.html",
      new URLSearchParams({ project: projectId })
    );
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(teamLoginUrl)}`;
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        throw new Error("clipboard-image-unavailable");
      }
      const response = await fetch(qrUrl, { cache: "no-store" });
      if (!response.ok) throw new Error(`qr-fetch-${response.status}`);
      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
      renderTeamLoginQr(projectId);
      showAdminToast("팀 로그인 QR 이미지를 복사했습니다.", "success", 3000);
    } catch (_error) {
      renderTeamLoginQr(projectId);
      showAdminToast("QR 이미지 복사가 불가한 환경입니다. 아래 QR을 길게 눌러 사용하세요.", "warn", 3600);
    }
  });
  elements.opsConsoleOpenTeamLoginBtn?.addEventListener("click", () => {
    elements.openTeamLoginBtn?.click();
  });
  elements.openReviewBtn?.addEventListener("click", () => {
    const projectId = getProjectIdOrAlert("먼저 프로젝트를 선택하거나 저장하세요.");
    if (!projectId || !projectsCache[projectId]) {
      showAdminToast("먼저 프로젝트를 선택하거나 저장하세요.", "warn", 2800);
      return;
    }
    const meta = projectsCache[projectId]?.meta || {};
    storeProjectContext({
      projectId,
      projectName: meta.name || projectId,
      logoUrl: meta.logoUrl || meta.dashboardLogoUrl || meta.loginLogoUrl || "",
      teamCount: meta.teamCount || Number(elements.teamCountInput.value) || 0,
    });
    const nextParams = new URLSearchParams();
    nextParams.set("project", projectId);
    window.open(buildPageUrl("review.html", nextParams), "_blank");
  });
  elements.opsConsoleOpenReviewBtn?.addEventListener("click", () => {
    elements.openReviewBtn?.click();
  });
  elements.openPhotoApproveBtn?.addEventListener("click", () => {
    const projectId = getProjectIdOrAlert("먼저 프로젝트를 선택하거나 저장하세요.");
    if (!projectId || !projectsCache[projectId]) {
      showAdminToast("먼저 프로젝트를 선택하거나 저장하세요.", "warn", 2800);
      return;
    }
    const meta = projectsCache[projectId]?.meta || {};
    storeProjectContext({
      projectId,
      projectName: meta.name || projectId,
      logoUrl: meta.logoUrl || meta.dashboardLogoUrl || meta.loginLogoUrl || "",
      teamCount: meta.teamCount || Number(elements.teamCountInput.value) || 0,
    });
    const nextParams = new URLSearchParams();
    nextParams.set("project", projectId);
    window.open(buildPageUrl("photo_approve.html", nextParams), "_blank");
  });
  elements.opsConsoleOpenApproveBtn?.addEventListener("click", () => {
    elements.openPhotoApproveBtn?.click();
  });
  elements.copyPhotoApproveLinkBtn?.addEventListener("click", async () => {
    const projectId = getProjectIdOrAlert("먼저 프로젝트를 선택하거나 저장하세요.");
    if (!projectId || !projectsCache[projectId]) {
      showAdminToast("먼저 프로젝트를 선택하거나 저장하세요.", "warn", 2800);
      return;
    }
    const mobileApproveUrl = buildPageUrl(
      "photo_approve.html",
      new URLSearchParams({ project: projectId })
    );
    try {
      await navigator.clipboard.writeText(mobileApproveUrl);
      showAdminToast("모바일 사진 승인 링크를 복사했습니다.", "success", 2800);
    } catch (_error) {
      showAdminToast("모바일 사진 승인 링크 복사에 실패했습니다.", "error", 3000);
    }
  });
  elements.showPhotoApproveQrBtn?.addEventListener("click", () => {
    const projectId = getProjectIdOrAlert("먼저 프로젝트를 선택하거나 저장하세요.");
    if (!projectId || !projectsCache[projectId]) {
      showAdminToast("먼저 프로젝트를 선택하거나 저장하세요.", "warn", 2800);
      return;
    }
    renderPhotoApproveQr(projectId);
  });
  elements.copyPhotoUploadLinkBtn?.addEventListener("click", async () => {
    const projectId = resolveProjectId();
    if (!projectId) {
      showAdminToast("먼저 프로젝트를 저장하세요.", "warn", 2800);
      return;
    }
    const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
    const missionCount = Number(elements.missionCountInput?.value) || missionTotal;
    let found = null;
    for (let teamNumber = 1; teamNumber <= teamCount && !found; teamNumber++) {
      const teamId = `Team${teamNumber}`;
      const config = ensureMissionConfig(teamId);
      for (let missionNumber = 1; missionNumber <= missionCount; missionNumber++) {
        const mission = config[missionNumber] || {};
        if ((Number(mission.photoSlots) || 0) > 0 || (Number(mission.specialSlots) || 0) > 0) {
          found = { teamId, missionNumber };
          break;
        }
      }
    }
    if (!found) {
      showAdminToast("사진 업로드 예시를 만들 사진 미션이 없습니다.", "warn", 3000);
      return;
    }
    const sampleUrl = buildPageUrl(
      "photo_upload.html",
      new URLSearchParams({
        project: projectId,
        team: found.teamId,
        mission: String(found.missionNumber),
      })
    );
    try {
      await navigator.clipboard.writeText(sampleUrl);
      showAdminToast(`사진 업로드 예시 링크를 복사했습니다. (${found.teamId} · M${found.missionNumber})`, "success", 3200);
    } catch (_error) {
      showAdminToast("링크 복사에 실패했습니다. 브라우저 권한을 확인하세요.", "error", 3200);
    }
  });
  elements.opsConsoleOpenHQBtn?.addEventListener("click", () => {
    elements.openHQBtn?.click();
  });
  elements.runStartGateBtn?.addEventListener("click", handleRunStartGate);
  elements.exportOpsBundleBtn?.addEventListener("click", handleExportOpsBundle);
  elements.opsConsoleExportBundleBtn?.addEventListener("click", handleExportOpsBundle);
  elements.sendAnnouncementBtn?.addEventListener("click", handleSendAnnouncement);
  elements.opsTimelineFilters.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.opsFilter === opsTimelineFilter);
    button.addEventListener("click", () => {
      opsTimelineFilter = button.dataset.opsFilter || "all";
      elements.opsTimelineFilters.forEach((item) =>
        item.classList.toggle("is-active", item === button)
      );
      renderOpsTimelineEntries(latestOpsTimelineItems);
    });
  });
  elements.openFirstIncompleteMissionBtn?.addEventListener("click", () => {
    const nextTeamId = findPriorityMissionTeam();
    if (!nextTeamId) {
      showAdminToast("열 팀이 없습니다. 팀 수와 미션 구성을 먼저 확인하세요.", "warn", 3000);
      return;
    }
    openMissionModal(nextTeamId);
  });
  elements.openNextMissionTeamBtn?.addEventListener("click", () => {
    const order = getMissionOverviewOrder();
    if (!order.length) {
      showAdminToast("열 팀이 없습니다.", "warn", 2600);
      return;
    }
    const currentIndex = activeMissionTeam ? order.indexOf(activeMissionTeam) : -1;
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % order.length : 0;
    openMissionModal(order[nextIndex]);
  });
  elements.missionOverviewFilters.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.missionFilter === missionOverviewFilter);
    button.addEventListener("click", () => {
      missionOverviewFilter = button.dataset.missionFilter || "all";
      persistMissionViewState();
      elements.missionOverviewFilters.forEach((item) =>
        item.classList.toggle("is-active", item === button)
      );
      renderMissionOverview();
      syncActionAvailability();
    });
  });

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
      setActiveAdminTab("missions");
      const value = Number(elements.missionCountInput.value) || missionTotal;
      updateMissionTotal(value);
      if (elements.missionModal && !elements.missionModal.hidden && activeMissionTeam) {
        openMissionModal(activeMissionTeam);
      }
    });
  }

  elements.refreshBtn.addEventListener("click", () => {
    setProjectLoadStatus("프로젝트 목록 표시를 새로 정리했습니다.", Object.keys(projectsCache).length ? "ok" : "warn");
    renderProjectList();
    renderProjectLoadMeta();
  });

  elements.teamCountInput.addEventListener("change", () => {
    const count = Math.max(1, Math.min(30, Number(elements.teamCountInput.value) || defaultTeamCount));
    elements.teamCountInput.value = count;
    renderTeamRows(count);
    markRouteBuilderDirty();
  });

  elements.routeModeInput?.addEventListener("change", () => {
    routeBuilderConfig.mode = getSelectedRouteMode();
    renderRouteBuilder();
    renderProjectChecklist();
    renderProjectSummary();
    renderLaunchReadiness();
    renderStartGatePanel();
    markDirty("project");
  });

  elements.rainModeInput?.addEventListener("change", async () => {
    const enabled = elements.rainModeInput.checked;
    const projectName = elements.projectNameInput?.value.trim() || currentProjectId || "현재 프로젝트";
    const status = elements.projectStatusInput?.value || "planned";
    const confirmMessage = enabled
      ? `${projectName}에서 우천시 모드로 전환합니다. 코드/미션 화면의 우천 이미지가 즉시 적용됩니다. 계속하시겠습니까?`
      : `${projectName}에서 우천시 모드를 해제합니다. 기본 이미지로 즉시 복귀합니다. 계속하시겠습니까?`;
    const confirmTitle = status === "running" ? "운영 중 우천시 모드 전환" : "우천시 모드 전환";
    const confirmed = await requestAdminConfirm(
      confirmTitle,
      confirmMessage,
      enabled ? "우천 적용" : "기본 복귀",
    );
    if (!confirmed) {
      elements.rainModeInput.checked = !enabled;
      showAdminToast("우천시 모드 전환을 취소했습니다.", "warn", 2200);
      return;
    }
    if (currentProjectId) {
      const persisted = await persistRainModeChange(enabled);
      if (!persisted) {
        elements.rainModeInput.checked = !enabled;
        showAdminToast("우천시 모드 저장 중 오류가 발생했습니다.", "error", 2600);
        return;
      }
    }
    renderRouteBuilder();
    renderMissionOverview();
    renderProjectSummary();
    renderLaunchReadiness();
    renderStartGatePanel();
    if (elements.missionModal && !elements.missionModal.hidden && activeMissionTeam) {
      renderMissionModalRows(activeMissionTeam);
    }
    if (!currentProjectId) {
      markDirty("project");
    }
    showAdminToast(enabled ? "우천시 모드로 즉시 전환했습니다." : "기본 모드로 즉시 복귀했습니다.", "success", 2400);
  });

  elements.routeMissionKeysInput?.addEventListener("change", () => {
    const nextKeys = String(elements.routeMissionKeysInput.value || "")
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);
    routeBuilderConfig.missionKeys = nextKeys;
    routeBuilderConfig = normalizeRouteBuilderConfig(routeBuilderConfig);
    renderRouteBuilder();
    markRouteBuilderDirty();
    renderLaunchReadiness();
    renderStartGatePanel();
  });
  elements.applyPhotoTemplateToAllBtn?.addEventListener("click", () => applyPhotoTemplateToMissionLibrary("all"));
  elements.applyPhotoTemplateToEmptyBtn?.addEventListener("click", () => applyPhotoTemplateToMissionLibrary("empty"));
  elements.routeCodeTableBody?.addEventListener("input", handleRouteBuilderInput);
  elements.routeCodeTableBody?.addEventListener("change", handleRouteBuilderInput);
  elements.routeCodeTableBody?.addEventListener("click", handleRouteLibraryClick);
  elements.routeMissionLibraryBody?.addEventListener("input", handleRouteBuilderInput);
  elements.routeMissionLibraryBody?.addEventListener("change", handleRouteBuilderInput);
  elements.routeMissionLibraryBody?.addEventListener("click", handleRouteLibraryClick);
  elements.outdoorAssetLibraryBody?.addEventListener("input", handleRouteBuilderInput);
  elements.outdoorAssetLibraryBody?.addEventListener("change", handleRouteBuilderInput);
  elements.routeMatrixBody?.addEventListener("input", handleRouteBuilderInput);
  elements.routeMatrixBody?.addEventListener("change", handleRouteBuilderInput);
  elements.routeMatrixBody?.addEventListener("click", handleRouteMatrixAction);
  elements.routeMatrixBody?.addEventListener("focusin", handleRouteMatrixFocus);
  elements.routeMatrixBody?.addEventListener("paste", handleRouteMatrixPaste);
  elements.routeCodeTableBody?.addEventListener("change", handleRouteBuilderUpload);
  elements.routeMissionLibraryBody?.addEventListener("change", handleRouteBuilderUpload);
  elements.outdoorAssetLibraryBody?.addEventListener("change", handleRouteBuilderUpload);
  elements.autoFillRouteMatrixBtn?.addEventListener("click", autoFillRouteMatrix);
  elements.autoFillRouteMatrixFromHereBtn?.addEventListener("click", autoFillRouteMatrixFromActiveTeam);
  elements.duplicateRouteToNextTeamBtn?.addEventListener("click", duplicateRouteToNextTeam);
  elements.duplicateRouteToRemainingTeamsBtn?.addEventListener("click", duplicateRouteToRemainingTeams);
  elements.duplicateRouteToRangeBtn?.addEventListener("click", duplicateRouteToRange);
  elements.autoFillRouteRangeBtn?.addEventListener("click", autoFillRouteRange);
  elements.clearRouteColumnBtn?.addEventListener("click", clearSelectedRouteColumn);
  elements.fillRouteColumnBtn?.addEventListener("click", fillSelectedRouteColumn);
  elements.importRouteMatrixBtn?.addEventListener("click", () => elements.importRouteMatrixInput?.click());
  elements.importRouteMatrixInput?.addEventListener("change", handleImportRouteMatrix);
  elements.exportRouteMatrixBtn?.addEventListener("click", handleExportRouteMatrix);
  elements.exportRouteAssignmentReportBtn?.addEventListener("click", handleExportRouteAssignmentReport);
  elements.exportRouteIssuesReportBtn?.addEventListener("click", handleExportRouteIssuesReport);
  elements.exportRouteStaffSheetBtn?.addEventListener("click", handleExportRouteStaffSheet);
  elements.copyRouteStaffSheetBtn?.addEventListener("click", handleCopyRouteStaffSheet);
  elements.printRouteStaffSheetBtn?.addEventListener("click", handlePrintRouteStaffSheet);
  elements.saveRouteTemplateBtn?.addEventListener("click", handleSaveRouteTemplate);
  elements.loadRouteTemplateBtn?.addEventListener("click", handleLoadRouteTemplate);
  elements.deleteRouteTemplateBtn?.addEventListener("click", handleDeleteRouteTemplate);
  elements.applyAcademyExampleBtn?.addEventListener("click", applyAcademyExamplePreset);
  elements.applyOutdoorExampleBtn?.addEventListener("click", applyOutdoorExamplePreset);
  elements.saveApplyRouteMatrixBtn?.addEventListener("click", async () => {
    await handleSaveProject();
    if (resolveProjectId()) {
      await handleApplyRouteMatrix();
    }
  });
  elements.applyRouteMatrixBtn?.addEventListener("click", handleApplyRouteMatrix);

  if (elements.sharedLogoInput) {
    elements.sharedLogoInput.addEventListener("change", (event) => {
      handleAssetUpload(event.target.files?.[0], "logo");
    });
  }
  if (elements.loginBackgroundInput) {
    elements.loginBackgroundInput.addEventListener("change", (event) => {
      handleAssetUpload(event.target.files?.[0], "background");
    });
  }
  setupAssetDropzone(elements.sharedLogoDropzone, elements.sharedLogoInput, "logo");
  setupAssetDropzone(elements.loginBackgroundDropzone, elements.loginBackgroundInput, "background");

  if (elements.missionModalClose) {
    elements.missionModalClose.addEventListener("click", closeMissionModal);
  }
  if (elements.missionModalDensityToggle) {
    elements.missionModalDensityToggle.addEventListener("click", () => {
      missionModalDensity = missionModalDensity === "compact" ? "expanded" : "compact";
      applyMissionModalDensity();
    });
  }
  if (elements.missionModalNextIssue) {
    elements.missionModalNextIssue.addEventListener("click", () => {
      const issueOrder = getMissionIssueOrder(activeMissionTeam);
      if (!issueOrder.length) {
        showAdminToast("현재 팀은 모든 미션 설정이 준비되었습니다.", "success", 2400);
        return;
      }
      const currentIndex = issueOrder.indexOf(activeMissionRow);
      const nextMission = currentIndex >= 0 ? issueOrder[currentIndex + 1] || issueOrder[0] : issueOrder[0];
      setActiveMissionRow(nextMission);
      const row = elements.missionModalBody?.querySelector(`tr[data-mission="${nextMission}"]`);
      row?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }
  if (elements.missionModalCancel) {
    elements.missionModalCancel.addEventListener("click", closeMissionModal);
  }
  if (elements.missionModalSave) {
    elements.missionModalSave.addEventListener("click", saveMissionConfiguration);
  }
  if (elements.missionModalSaveNext) {
    elements.missionModalSaveNext.addEventListener("click", () => saveMissionConfiguration({ goNext: true }));
  }
  if (elements.missionModalPrevTeam) {
    elements.missionModalPrevTeam.addEventListener("click", () => moveMissionModalTeam(-1));
  }
  if (elements.missionModalNextTeam) {
    elements.missionModalNextTeam.addEventListener("click", () => moveMissionModalTeam(1));
  }
  if (elements.missionModal) {
    elements.missionModal.addEventListener("click", (event) => {
      if (event.target === elements.missionModal) {
        closeMissionModal();
      }
    });
  }
  elements.cloneModalClose?.addEventListener("click", closeCloneModal);
  elements.cloneModalCancel?.addEventListener("click", closeCloneModal);
  elements.cloneModalSubmit?.addEventListener("click", submitCloneModal);
  elements.cloneModal?.addEventListener("click", (event) => {
    if (event.target === elements.cloneModal) {
      closeCloneModal();
    }
  });
  elements.confirmModalClose?.addEventListener("click", () => closeConfirmModal(false));
  elements.confirmModalCancel?.addEventListener("click", () => closeConfirmModal(false));
  elements.confirmModalSubmit?.addEventListener("click", () => closeConfirmModal(true));
  elements.confirmModal?.addEventListener("click", (event) => {
    if (event.target === elements.confirmModal) {
      closeConfirmModal(false);
    }
  });

  elements.saveBtn.addEventListener("click", handleSaveProject);
  if (elements.exportBtn) {
    elements.exportBtn.addEventListener("click", handleExportResults);
  }
  if (elements.exportOpsLogBtn) {
    elements.exportOpsLogBtn.addEventListener("click", handleExportOpsLogs);
  }
  if (elements.finishBtn) {
    elements.finishBtn.addEventListener("click", handleFinishProject);
  }
  elements.resetBtn.addEventListener("click", handleResetResults);
  elements.resetTopBtn?.addEventListener("click", handleResetResults);
  elements.openHQBtn.addEventListener("click", () => {
    const projectId = getProjectIdOrAlert("먼저 프로젝트를 선택하거나 저장하세요.");
    if (!projectId || !projectsCache[projectId]) {
      showAdminToast("먼저 프로젝트를 선택하거나 저장하세요.", "warn", 2800);
      return;
    }
    const meta = projectsCache[projectId]?.meta || {};
    storeProjectContext({
      projectId,
      projectName: meta.name || projectId,
      logoUrl: meta.logoUrl || meta.dashboardLogoUrl || meta.loginLogoUrl || "",
      teamCount: meta.teamCount || Number(elements.teamCountInput.value) || 0,
    });
    const nextParams = new URLSearchParams();
    nextParams.set("project", projectId);
    window.open(buildPageUrl("hq.html", nextParams), "_blank");
  });
  elements.normalizeMissionSchemaBtn?.addEventListener("click", handleNormalizeMissionSchema);
}

async function handleNormalizeMissionSchema() {
  if (actionLocks.migrate) return;
  const projectId = getProjectIdOrAlert("먼저 프로젝트를 선택하거나 저장하세요.");
  if (!projectId || !projectsCache[projectId]) {
    showAdminToast("먼저 프로젝트를 선택하거나 저장하세요.", "warn", 2800);
    return;
  }
  setActionBusy("migrate", true);
  try {
    const project = projectsCache[projectId] || {};
    const updates = {};
    let normalizedCount = 0;
    let normalizedTeamCount = 0;
    const hasRouting = !!project.routing;

    if (hasRouting) {
      const rawOverrides = project.teamOverrides || {};
      const normalizedOverrides = {};
      Object.entries(rawOverrides).forEach(([teamId, teamOverride]) => {
        const normalizedTeamOverride = {};
        for (let missionNumber = 1; missionNumber <= missionTotal; missionNumber += 1) {
          const sourceMission = teamOverride?.[missionNumber] || teamOverride?.[String(missionNumber)];
          if (!sourceMission) continue;
          const normalizedMission = normalizeMissionEntry(sourceMission || {});
          normalizedTeamOverride[missionNumber] = normalizedMission;
          if (!sourceMission?.codeStep || !sourceMission?.missionStep) {
            normalizedCount += 1;
          }
        }
        if (Object.keys(normalizedTeamOverride).length) {
          normalizedOverrides[teamId] = normalizedTeamOverride;
        }
      });
      normalizedTeamCount = Object.keys(normalizedOverrides).length;
      updates[`projects/${projectId}/teamOverrides`] = Object.keys(normalizedOverrides).length ? normalizedOverrides : null;
    } else {
      const teamsSnapshot = await get(ref(db, `projects/${projectId}/teams`));
      const teams = teamsSnapshot.val() || {};
      normalizedTeamCount = Object.keys(teams).length;
      Object.entries(teams).forEach(([teamId, teamValue]) => {
        const rawMissions = teamValue?.config?.missions || [];
        const normalizedMissions = Array.isArray(rawMissions) ? [...rawMissions] : { ...rawMissions };
        for (let missionNumber = 1; missionNumber <= missionTotal; missionNumber += 1) {
          const sourceMission = rawMissions?.[missionNumber];
          const normalizedMission = normalizeMissionEntry(sourceMission || {});
          normalizedMissions[missionNumber] = normalizedMission;
          if (!sourceMission?.codeStep || !sourceMission?.missionStep) {
            normalizedCount += 1;
          }
        }
        updates[`projects/${projectId}/teams/${teamId}/config/missions`] = normalizedMissions;
      });
    }

    updates[`projects/${projectId}/meta/updatedAt`] = Date.now();
    await update(ref(db), updates);
    await recordAuditLog(projectId, "project_normalize_mission_schema", {
      normalizedCount,
      teamCount: normalizedTeamCount,
    });
    showAdminToast(
      normalizedCount > 0
        ? `미션 구조를 최신화했습니다. ${normalizedCount}개 기존 형식 미션을 최신 구조로 정리했습니다.`
        : "이미 최신 단계형 구조입니다. 추가 정리할 미션이 없습니다.",
      "success",
      3800
    );
    renderLaunchReadiness();
    renderStartGatePanel();
    renderMissionOverview();
  } catch (error) {
    console.error(error);
    showAdminToast("미션 구조 최신화 중 오류가 발생했습니다.", "error", 3600);
  } finally {
    setActionBusy("migrate", false);
  }
}

async function handleDeleteProject() {
  if (actionLocks.delete) return;
  if (selectedProjects.size === 0) {
    showAdminToast("삭제할 프로젝트를 체크하세요.", "warn", 2800);
    return;
  }
  const names = Array.from(selectedProjects).map((id) => projectsCache[id]?.meta?.name || id);
  const confirmed = await requestAdminConfirm(
    "프로젝트 삭제",
    `${names.join(", ")} 프로젝트를 삭제합니다. 프로젝트 설정, 팀 진행, 업로드, 채팅이 함께 삭제되며 바로 복구할 수 없습니다.`,
    "삭제"
  );
  if (!confirmed) return;

  const updates = {};
  selectedProjects.forEach((projectId) => {
    updates[`projects/${projectId}`] = null;
    updates[`uploads_meta/${projectId}`] = null;
    updates[`chat/${projectId}`] = null;
  });

  try {
    setActionBusy("delete", true);
    await Promise.all(
      Array.from(selectedProjects).map((projectId) =>
        recordAuditLog(projectId, "project_delete", {
          source: "admin",
          projectName: projectsCache[projectId]?.meta?.name || projectId,
        })
      )
    );
    await update(ref(db), updates);
    selectedProjects.forEach((id) => delete projectsCache[id]);
    const persistedProjectId = getPersistedLastProjectId();
    if (persistedProjectId && selectedProjects.has(persistedProjectId)) {
      persistLastProjectId("");
    }
    if (selectedProjects.has(currentProjectId)) {
      currentProjectId = null;
      clearForm();
    }
    selectedProjects.clear();
    showAdminToast("선택한 프로젝트를 삭제했습니다. 목록과 운영 링크를 다시 확인하세요.", "warn", 3600);
    renderProjectList();
  } catch (error) {
    console.error(error);
    showAdminToast("프로젝트 삭제 중 오류가 발생했습니다.", "error", 3600);
  } finally {
    setActionBusy("delete", false);
  }
}

async function handleCloneProject() {
  if (actionLocks.clone) return;
  const sourceProjectId = currentProjectId || Array.from(selectedProjects)[0];
  if (!sourceProjectId || !projectsCache[sourceProjectId]) {
    showAdminToast("복제할 프로젝트를 먼저 선택하세요.", "warn", 2800);
    return;
  }
  openCloneModal(sourceProjectId);
}

function openCloneModal(sourceProjectId) {
  cloneSourceProjectId = sourceProjectId;
  const sourceProject = projectsCache[sourceProjectId];
  const sourceMeta = sourceProject?.meta || {};
  if (elements.cloneProjectNameInput) {
    elements.cloneProjectNameInput.value = `${sourceMeta.name || sourceProjectId} 복제본`;
  }
  if (elements.cloneMasterPasswordInput) {
    elements.cloneMasterPasswordInput.value = "";
  }
  elements.cloneModal?.classList.add("active");
  if (elements.cloneModal) elements.cloneModal.hidden = false;
  window.setTimeout(() => elements.cloneProjectNameInput?.focus(), 0);
}

function closeCloneModal() {
  elements.cloneModal?.classList.remove("active");
  if (elements.cloneModal) elements.cloneModal.hidden = true;
  cloneSourceProjectId = null;
}

async function submitCloneModal() {
  const sourceProjectId = cloneSourceProjectId;
  if (!sourceProjectId || !projectsCache[sourceProjectId]) {
    showAdminToast("복제할 프로젝트를 먼저 선택하세요.", "warn", 2800);
    closeCloneModal();
    return;
  }
  const nextName = elements.cloneProjectNameInput?.value.trim() || "";
  const nextMaster = elements.cloneMasterPasswordInput?.value.trim() || "";
  if (!nextName) {
    showAdminToast("새 프로젝트 이름을 입력하세요.", "warn", 2800);
    elements.cloneProjectNameInput?.focus();
    return;
  }
  if (!nextMaster) {
    showAdminToast("새 마스터 비밀번호를 입력하세요.", "warn", 2800);
    elements.cloneMasterPasswordInput?.focus();
    return;
  }

  const sourceProject = projectsCache[sourceProjectId];
  const sourceMeta = sourceProject.meta || {};
  const nextProjectId = generateProjectId(nextName);

  const now = Date.now();
  const clonedTeams = {};
  Object.entries(sourceProject.teams || {}).forEach(([teamId, teamData], index) => {
    const teamNumber = teamData.profile?.number || index + 1;
    clonedTeams[teamId] = {
      profile: {
        name: teamData.profile?.name || "",
        password: resolveTeamPassword(teamData.profile?.password, teamNumber),
        number: teamNumber,
      },
      config: {
        missions: cloneData(teamData.config?.missions || {}),
      },
      missions: createDefaultMissionState(sourceMeta.missionTotal || missionTotal),
    };
  });

  const clonedMeta = {
    ...cloneData(sourceMeta),
    id: nextProjectId,
    name: nextName.trim(),
    masterPassword: nextMaster.trim(),
    status: "planned",
    startAt: null,
    endAt: null,
    createdAt: now,
    updatedAt: now,
  };

  const updates = {
    [`projects/${nextProjectId}/meta`]: clonedMeta,
    [`projects/${nextProjectId}/countdown`]: null,
  };
  Object.entries(clonedTeams).forEach(([teamId, payload]) => {
    updates[`projects/${nextProjectId}/teams/${teamId}`] = payload;
  });

  try {
    setActionBusy("clone", true);
    await update(ref(db), updates);
    await recordAuditLog(nextProjectId, "project_clone", {
      source: "admin",
      fromProjectId: sourceProjectId,
      fromProjectName: sourceMeta.name || sourceProjectId,
    });
    showAdminToast("프로젝트 복제가 완료되었습니다. 일정, 상태, 시작 시간을 새로 확인하세요.", "success", 3600);
    currentProjectId = nextProjectId;
    persistLastProjectId(nextProjectId);
    refreshProjectIdField();
    focusEditorTop("basic");
    closeCloneModal();
  } catch (error) {
    console.error(error);
    showAdminToast("프로젝트 복제 중 오류가 발생했습니다.", "error", 3600);
  } finally {
    setActionBusy("clone", false);
  }
}

function renderProjectList() {
  Array.from(selectedProjects).forEach((id) => {
    if (!projectsCache[id]) selectedProjects.delete(id);
  });
  const rows = Object.entries(projectsCache)
    .filter(([id, project]) => {
      if (!projectListSearch) return true;
      const name = `${project.meta?.name || ""} ${id}`.toLowerCase();
      return name.includes(projectListSearch);
    })
    .sort(([, a], [, b]) => {
      const aUpdated = Number(a?.meta?.updatedAt || a?.meta?.createdAt || 0);
      const bUpdated = Number(b?.meta?.updatedAt || b?.meta?.createdAt || 0);
      return bUpdated - aUpdated;
    })
    .map(([id, project]) => {
    const meta = project.meta || {};
    const status = meta.status || "planned";
    const educationDateValue = getProjectEducationDate(meta);
    const educationDate = educationDateValue ? formatAdminDate(educationDateValue) : "-";
    const end = meta.endAt ? formatAdminDateTime(meta.endAt) : "-";
    const updated = meta.updatedAt ? formatAdminDateTime(meta.updatedAt) : "-";
    return `
      <tr data-project="${id}" class="${currentProjectId === id ? "is-active" : ""}">
        <td><input type="checkbox" class="project-select" data-project="${id}" ${selectedProjects.has(id) ? "checked" : ""}></td>
        <td>
          <div class="project-cell-title">${meta.name || id}</div>
          <div class="project-cell-meta">ID ${id} · 수정 ${updated}</div>
        </td>
        <td>${maskMasterPassword(meta.masterPassword || "")}</td>
        <td>${educationDate} / ${end}</td>
        <td>${renderStatusTag(status)}</td>
      </tr>
    `;
  });
  elements.projectTableBody.innerHTML = rows.join("") || "<tr><td colspan='5'>등록된 프로젝트가 없습니다.</td></tr>";
  renderProjectLoadMeta();
  elements.projectTableBody.querySelectorAll("tr[data-project]").forEach((row) => {
    row.addEventListener("click", (event) => {
      const checkbox = event.target.closest(".project-select");
      if (checkbox) {
        toggleSelection(checkbox.dataset.project, checkbox.checked);
        event.stopPropagation();
        return;
      }
      runAdminStep("fillForm", () => fillForm(row.dataset.project));
      focusEditorTop("basic");
    });
  });
  updateSelectionUI();
}

function updateMissionTotal(value) {
  missionTotal = clampMissionCount(value);
  if (elements.missionCountInput) {
    elements.missionCountInput.value = missionTotal;
  }
  const routeConfig = ensureRouteBuilderConfig();
  const middleCount = Math.max(1, missionTotal - 2);
  const nextKeys = (Array.isArray(routeConfig.missionKeys) ? routeConfig.missionKeys : [])
    .map((key) => normalizeMissionRouteToken(key))
    .filter(Boolean)
    .slice(0, middleCount);
  while (nextKeys.length < middleCount) {
    nextKeys.push(buildDefaultRouteKeys(middleCount)[nextKeys.length]);
  }
  routeConfig.missionKeys = nextKeys;
  Object.keys(missionConfigs).forEach((teamId) => ensureMissionConfig(teamId));
  if (elements.teamCountInput) {
    runAdminStep("renderTeamRows", () => renderTeamRows(Number(elements.teamCountInput.value) || defaultTeamCount));
  }
  renderRouteBuilder();
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
  syncActionAvailability();
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
  persistLastProjectId("");
  teamProfiles = {};
  missionConfigs = {};
  routeBuilderConfig = createDefaultRouteBuilderConfig();
  metaLogoUrl = "";
  metaLoginBackgroundUrl = "";
  document.getElementById("projectForm").reset();
  elements.teamCountInput.value = defaultTeamCount;
  missionTotal = DEFAULT_MISSION_TOTAL;
  if (elements.missionCountInput) elements.missionCountInput.value = missionTotal;
  renderTeamRows(defaultTeamCount);
  if (elements.masterPasswordInput) elements.masterPasswordInput.value = "";
  if (elements.adminBypassCodeInput) elements.adminBypassCodeInput.value = "";
  if (elements.photoApprovalPasswordInput) {
    elements.photoApprovalPasswordInput.value = "";
    elements.photoApprovalPasswordInput.placeholder = "휴대폰 승인 전용 비밀번호";
  }
  if (elements.loginTitleInput) elements.loginTitleInput.value = "";
  if (elements.loginSubtitleInput) elements.loginSubtitleInput.value = "";
  if (elements.loginNoticeInput) elements.loginNoticeInput.value = "";
  if (elements.finishNoticeInput) elements.finishNoticeInput.value = "";
  if (elements.loginUnlockLabelInput) elements.loginUnlockLabelInput.value = "";
  if (elements.loginTeamButtonLabelInput) elements.loginTeamButtonLabelInput.value = "";
  if (elements.loginThemeInput) elements.loginThemeInput.value = "midnight";
  if (elements.routeModeInput) elements.routeModeInput.value = "academy";
  if (elements.hideTeamChatInput) elements.hideTeamChatInput.checked = false;
  if (elements.hideTeamPhotoInput) elements.hideTeamPhotoInput.checked = false;
  if (elements.sharedLogoPreview) elements.sharedLogoPreview.src = "";
  if (elements.loginBackgroundPreview) {
    elements.loginBackgroundPreview.src = "";
    elements.loginBackgroundPreview.classList.add("hidden");
  }
  runAdminStep("refreshProjectIdField", refreshProjectIdField, { notify: false });
  runAdminStep("renderLoginPreview", renderLoginPreview);
  runAdminStep("applyMissionModalDensity", applyMissionModalDensity, { notify: false });
  runAdminStep("renderProjectChecklist", renderProjectChecklist);
  runAdminStep("renderProjectSummary", renderProjectSummary);
  runAdminStep("renderRouteBuilder", renderRouteBuilder);
  runAdminStep("renderMissionOverview", renderMissionOverview);
  resetSaveState();
  runAdminStep("renderCurrentProjectBar", renderCurrentProjectBar, { notify: false });
  runAdminStep("syncActionAvailability", syncActionAvailability, { notify: false });
  runAdminStep("renderSetupRoadmap", renderSetupRoadmap);
  runAdminStep("renderLaunchReadiness", renderLaunchReadiness);
  runAdminStep("renderStartGatePanel", renderStartGatePanel);
  runAdminStep("renderRehearsalPanel", renderRehearsalPanel);
  runAdminStep("renderAnnouncementTargets", renderAnnouncementTargets);
  runAdminStep("subscribeOpsTimeline", () => subscribeOpsTimeline(null));
}

function fillForm(projectId) {
  const project = projectsCache[projectId];
  if (!project) return;
  currentProjectId = projectId;
  persistLastProjectId(projectId);
  const meta = project.meta || {};
  elements.projectNameInput.value = meta.name || "";
  elements.masterPasswordInput.value = meta.masterPassword || "";
  if (elements.adminBypassCodeInput) elements.adminBypassCodeInput.value = meta.adminBypassCode || "";
  if (elements.photoApprovalPasswordInput) {
    elements.photoApprovalPasswordInput.value = "";
    elements.photoApprovalPasswordInput.placeholder =
      meta.photoApprovalPasswordHash || meta.photoApprovalPassword
        ? "설정됨 · 변경할 때만 새 비밀번호 입력"
        : "휴대폰 승인 전용 비밀번호";
  }
  if (elements.projectStatusInput) {
    elements.projectStatusInput.value = meta.status || "planned";
  }
  if (elements.routeModeInput) {
    elements.routeModeInput.value = inferRouteMode(meta, project.routing);
  }
  if (elements.rainModeInput) {
    elements.rainModeInput.checked = meta.rainMode === true || meta.weatherMode === "rain";
  }
  if (elements.hideTeamChatInput) {
    elements.hideTeamChatInput.checked = meta.hideTeamChat === true;
  }
  if (elements.hideTeamPhotoInput) {
    elements.hideTeamPhotoInput.checked = meta.hideTeamPhoto === true;
  }
  elements.startDateInput.value = getProjectEducationDate(meta) || (meta.startAt ? toDateInputValue(meta.startAt) : "");
  elements.endDateInput.value = meta.endAt ? toDateTimeInputValue(meta.endAt) : "";
  elements.organizerInput.value = meta.organizer || "";
  elements.venueInput.value = meta.venue || "";
  elements.participantInput.value = meta.participantCount || "";
  if (elements.loginTitleInput) elements.loginTitleInput.value = meta.loginTitle || "";
  if (elements.loginSubtitleInput) elements.loginSubtitleInput.value = meta.loginSubtitle || "";
  if (elements.loginNoticeInput) elements.loginNoticeInput.value = meta.loginNotice || "";
  if (elements.finishNoticeInput) elements.finishNoticeInput.value = meta.finishNotice || "";
  if (elements.loginUnlockLabelInput) elements.loginUnlockLabelInput.value = meta.loginUnlockLabel || "";
  if (elements.loginTeamButtonLabelInput) elements.loginTeamButtonLabelInput.value = meta.loginTeamButtonLabel || "";
  if (elements.loginThemeInput) elements.loginThemeInput.value = meta.loginTheme || "midnight";
  elements.teamCountInput.value = meta.teamCount || Object.keys(project.teams || {}).length || defaultTeamCount;
  missionTotal = clampMissionCount(meta.missionTotal || DEFAULT_MISSION_TOTAL);
  if (elements.missionCountInput) elements.missionCountInput.value = missionTotal;
  metaLogoUrl = meta.logoUrl || meta.loginLogoUrl || meta.dashboardLogoUrl || "";
  metaLoginBackgroundUrl = meta.loginBackgroundUrl || "";
  if (elements.sharedLogoPreview) elements.sharedLogoPreview.src = metaLogoUrl || "";
  if (elements.loginBackgroundPreview) {
    elements.loginBackgroundPreview.src = metaLoginBackgroundUrl || "";
    elements.loginBackgroundPreview.classList.toggle("hidden", !metaLoginBackgroundUrl);
  }
  runAdminStep("renderLoginPreview", renderLoginPreview);
  runAdminStep("refreshProjectIdField", refreshProjectIdField, { notify: false });
  resetSaveState(meta.updatedAt || null);

  teamProfiles = {};
  Object.entries(project.teams || {}).forEach(([teamId, teamData]) => {
    const teamNumber = teamData.profile?.number || parseInt(teamId.replace("Team", ""), 10) || 0;
    teamProfiles[teamId] = {
      name: teamData.profile?.name || "",
      password: resolveTeamPassword(teamData.profile?.password, teamNumber),
    };
  });
  renderTeamRows(Number(elements.teamCountInput.value) || defaultTeamCount);

  loadMissionConfigs(project);
  if (project.routing) {
    routeBuilderConfig = normalizeRouteBuilderConfig(project.routing);
  } else {
    routeBuilderConfig = normalizeRouteBuilderConfig(routeBuilderConfig);
  }
  routeBuilderConfig.mode = inferRouteMode(meta, project.routing);
  runAdminStep("renderRouteBuilder", renderRouteBuilder);
  runAdminStep("renderProjectChecklist", renderProjectChecklist);
  runAdminStep("renderProjectSummary", renderProjectSummary);
  runAdminStep("renderMissionOverview", renderMissionOverview);
  runAdminStep("renderCurrentProjectBar", renderCurrentProjectBar, { notify: false });
  runAdminStep("syncActionAvailability", syncActionAvailability, { notify: false });
  runAdminStep("renderSetupRoadmap", renderSetupRoadmap);
  runAdminStep("renderLaunchReadiness", renderLaunchReadiness);
  runAdminStep("renderStartGatePanel", renderStartGatePanel);
  runAdminStep("renderRehearsalPanel", renderRehearsalPanel);
  runAdminStep("renderAnnouncementTargets", renderAnnouncementTargets);
  runAdminStep("subscribeOpsTimeline", () => subscribeOpsTimeline(projectId));
}

function renderTeamRows(count) {
  for (let i = 1; i <= count; i++) {
    const teamId = `Team${i}`;
    if (!teamProfiles[teamId]) {
      teamProfiles[teamId] = { name: "", password: getDefaultTeamPassword(i) };
    }
    const profile = teamProfiles[teamId];
    profile.name = "";
    profile.password = resolveTeamPassword(profile.password, i);
    ensureMissionConfig(teamId);
  }
  if (elements.teamTableBody) {
    elements.teamTableBody.innerHTML = "";
  }
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
  runAdminStep("attachMissionButtons", attachMissionButtons, { notify: false });
  ensureRouteBuilderConfig();
  runAdminStep("renderRouteBuilder", renderRouteBuilder);
  runAdminStep("renderMissionOverview", renderMissionOverview);
  runAdminStep("renderSetupRoadmap", renderSetupRoadmap);
  runAdminStep("renderLaunchReadiness", renderLaunchReadiness);
  runAdminStep("renderStartGatePanel", renderStartGatePanel);
  runAdminStep("renderRehearsalPanel", renderRehearsalPanel);
  runAdminStep("renderAnnouncementTargets", renderAnnouncementTargets);
}

function attachMissionButtons() {
  document.querySelectorAll(".mission-config-btn").forEach((button) => {
    button.addEventListener("click", () => openMissionModal(button.dataset.teamId));
  });
}

function createDefaultMissionConfig() {
  const config = {};
  for (let i = 1; i <= missionTotal; i++) {
    config[i] = createDefaultMissionEntry();
  }
  return config;
}

function ensureMissionConfig(teamId) {
  if (!missionConfigs[teamId]) {
    missionConfigs[teamId] = createDefaultMissionConfig();
  }
  const config = missionConfigs[teamId];
  for (let i = 1; i <= missionTotal; i++) {
    config[i] = normalizeMissionEntry(config[i] || createDefaultMissionEntry());
  }
  Object.keys(config).forEach((key) => {
    if (Number(key) > missionTotal) delete config[key];
  });
  return config;
}

function rebuildMissionConfigFromCurrentRoute(teamId) {
  const savedConfig = currentProjectId
    ? normalizeMissionConfig(projectsCache[currentProjectId]?.teams?.[teamId]?.config?.missions || {})
    : null;
  if (savedConfig && Object.keys(savedConfig).length > 0) {
    missionConfigs[teamId] = savedConfig;
    return missionConfigs[teamId];
  }
  const existingConfig = missionConfigs[teamId] ? normalizeMissionConfig(missionConfigs[teamId]) : null;
  const existingOverride = existingConfig ? buildTeamOverrideFor(teamId, existingConfig) : {};
  const rebuilt = {};
  for (let missionNumber = 1; missionNumber <= missionTotal; missionNumber += 1) {
    const baseFromRoute = buildMissionConfigFromRoute(teamId, missionNumber);
    const overrideMission = existingOverride?.[missionNumber] || existingOverride?.[String(missionNumber)];
    rebuilt[missionNumber] = overrideMission
      ? normalizeMissionEntry({ ...baseFromRoute, ...overrideMission })
      : normalizeMissionEntry(baseFromRoute);
  }
  missionConfigs[teamId] = normalizeMissionConfig(rebuilt);
  return missionConfigs[teamId];
}

function normalizeMissionConfig(source = {}) {
  const base = createDefaultMissionConfig();
  const total = missionTotal;
  for (let i = 1; i <= total; i++) {
    if (source[i]) {
      base[i] = normalizeMissionEntry({ ...base[i], ...source[i] });
    }
  }
  return base;
}

function normalizeRouteBuilderConfig(source = {}) {
  const base = createDefaultRouteBuilderConfig();
  const mode = inferRouteMode(source.meta || {}, source);
  const rawKeys = Array.isArray(source.missionKeys)
    ? source.missionKeys
    : String(source.missionKeys || "")
        .split(",")
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean);
  const middleCount = Math.max(1, missionTotal - 2);
  const missionKeys = (rawKeys.length ? rawKeys : base.missionKeys).slice(0, middleCount);
  while (missionKeys.length < middleCount) {
    missionKeys.push(buildDefaultRouteKeys(middleCount)[missionKeys.length]);
  }

  const codeLibrary = {};
  for (let i = 1; i <= missionTotal; i += 1) {
    codeLibrary[i] = {
      ...createDefaultRouteCodeEntry(i),
      ...(source.codeLibrary?.[i] || source.codeLibrary?.[String(i)] || {}),
      displayName: String(source.codeLibrary?.[i]?.displayName || source.codeLibrary?.[String(i)]?.displayName || createDefaultRouteCodeEntry(i).displayName).trim(),
      imageUrl: String(source.codeLibrary?.[i]?.imageUrl || source.codeLibrary?.[String(i)]?.imageUrl || "").trim(),
      rainImageUrl: String(source.codeLibrary?.[i]?.rainImageUrl || source.codeLibrary?.[String(i)]?.rainImageUrl || "").trim(),
      answer: String(source.codeLibrary?.[i]?.answer || source.codeLibrary?.[String(i)]?.answer || createDefaultRouteCodeEntry(i).answer).trim() || String(i),
      photoPlan: normalizePhotoPlan(source.codeLibrary?.[i]?.photoPlan || source.codeLibrary?.[String(i)]?.photoPlan, {
        photoSlots: source.codeLibrary?.[i]?.photoSlots || source.codeLibrary?.[String(i)]?.photoSlots || 0,
        specialSlots: source.codeLibrary?.[i]?.specialSlots || source.codeLibrary?.[String(i)]?.specialSlots || 0,
      }),
      photoSlots: normalizeCount(
        normalizePhotoPlan(source.codeLibrary?.[i]?.photoPlan || source.codeLibrary?.[String(i)]?.photoPlan, {
          photoSlots: source.codeLibrary?.[i]?.photoSlots || source.codeLibrary?.[String(i)]?.photoSlots || 0,
          specialSlots: source.codeLibrary?.[i]?.specialSlots || source.codeLibrary?.[String(i)]?.specialSlots || 0,
        }).length || source.codeLibrary?.[i]?.photoSlots || source.codeLibrary?.[String(i)]?.photoSlots || 0
      ),
      specialSlots: 0,
    };
  }

  const codeVariants = {};
  for (let i = 1; i <= missionTotal; i += 1) {
    const variantEntries = source.codeVariants?.[i] || source.codeVariants?.[String(i)] || {};
    codeVariants[i] = {};
    Object.entries(variantEntries).forEach(([rawKey, rawEntry]) => {
      const variantKey = String(rawKey || "").trim().toUpperCase();
      if (!variantKey || extractCodeVariantBase(variantKey) !== String(i)) return;
      const defaultEntry = createDefaultRouteCodeVariantEntry(String(i), i, Number(variantKey.split("-")[1]) || 1);
      codeVariants[i][variantKey] = {
        ...defaultEntry,
        ...(rawEntry || {}),
        displayName: String(rawEntry?.displayName || defaultEntry.displayName).trim(),
        imageUrl: String(rawEntry?.imageUrl || "").trim(),
        rainImageUrl: String(rawEntry?.rainImageUrl || "").trim(),
        answer: String(rawEntry?.answer || defaultEntry.answer).trim() || defaultEntry.answer,
        photoPlan: normalizePhotoPlan(rawEntry?.photoPlan, {
          photoSlots: rawEntry?.photoSlots || 0,
          specialSlots: rawEntry?.specialSlots || 0,
        }),
        photoSlots: normalizeCount(
          normalizePhotoPlan(rawEntry?.photoPlan, {
            photoSlots: rawEntry?.photoSlots || 0,
            specialSlots: rawEntry?.specialSlots || 0,
          }).length || rawEntry?.photoSlots || 0
        ),
        specialSlots: 0,
      };
    });
  }

  const missionLibrary = {};
  const missionLibraryKeys = new Set(["S", ...missionKeys, "L"]);
  Object.keys(source.missionLibrary || {}).forEach((key) => {
    const normalizedKey = normalizeMissionRouteToken(key);
    if (normalizedKey) missionLibraryKeys.add(normalizedKey);
  });
  Array.from(missionLibraryKeys).forEach((key) => {
    missionLibrary[key] = {
      ...createDefaultRouteMissionEntry(key),
      ...(source.missionLibrary?.[key] || {}),
      displayName: String(source.missionLibrary?.[key]?.displayName || createDefaultRouteMissionEntry(key).displayName).trim(),
      imageUrl: String(source.missionLibrary?.[key]?.imageUrl || "").trim(),
      rainImageUrl: String(source.missionLibrary?.[key]?.rainImageUrl || "").trim(),
      answerTemplate: normalizeRouteAnswerTemplate(
        source.missionLibrary?.[key]?.answerTemplate || createDefaultRouteMissionEntry(key).answerTemplate,
        key,
      ),
      photoPlan: normalizePhotoPlan(source.missionLibrary?.[key]?.photoPlan, {
        photoSlots: source.missionLibrary?.[key]?.photoSlots || 0,
        specialSlots: source.missionLibrary?.[key]?.specialSlots || 0,
      }),
      photoSlots: normalizeCount(
        normalizePhotoPlan(source.missionLibrary?.[key]?.photoPlan, {
          photoSlots: source.missionLibrary?.[key]?.photoSlots || 0,
          specialSlots: source.missionLibrary?.[key]?.specialSlots || 0,
        }).length || source.missionLibrary?.[key]?.photoSlots || 0
      ),
      specialSlots: 0,
      autoAdvanceSeconds: normalizeAdvanceSeconds(source.missionLibrary?.[key]?.autoAdvanceSeconds || 0),
    };
  });

  const outdoorAssets = {};
  for (let missionNumber = 2; missionNumber <= missionTotal - 1; missionNumber += 1) {
    outdoorAssets[missionNumber] = {};
    missionKeys.forEach((key) => {
      const sourceEntry =
        source.outdoorAssets?.[missionNumber]?.[key]
        || source.outdoorAssets?.[String(missionNumber)]?.[key]
        || {};
      const defaultEntry = createDefaultOutdoorAssetEntry(missionNumber, key);
      const photoPlan = normalizePhotoPlan(sourceEntry.photoPlan, {
        photoSlots: sourceEntry.photoSlots || 0,
        specialSlots: 0,
      });
      outdoorAssets[missionNumber][key] = {
        ...defaultEntry,
        ...sourceEntry,
        label: String(sourceEntry.label || defaultEntry.label).trim(),
        codeAnswer: String(sourceEntry.codeAnswer || defaultEntry.codeAnswer).trim() || defaultEntry.codeAnswer,
        missionMode: Object.values(STEP_MODES).includes(sourceEntry.missionMode) ? sourceEntry.missionMode : defaultEntry.missionMode,
        missionAnswerTemplate: normalizeRouteAnswerTemplate(sourceEntry.missionAnswerTemplate || defaultEntry.missionAnswerTemplate, key),
        autoAdvanceSeconds: normalizeAdvanceSeconds(sourceEntry.autoAdvanceSeconds || 0),
        photoPlan,
        photoSlots: normalizeCount(photoPlan.length || sourceEntry.photoSlots || 0),
        codeImageUrl: String(sourceEntry.codeImageUrl || "").trim(),
        missionImageUrl: String(sourceEntry.missionImageUrl || "").trim(),
      };
    });
  }

  const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
  const startRoutes = {};
  const endRoutes = {};
  const routes = {};
  const startCodeRoutes = {};
  const endCodeRoutes = {};
  const codeRoutes = {};
  for (let teamNumber = 1; teamNumber <= teamCount; teamNumber += 1) {
    const teamId = `Team${teamNumber}`;
    startRoutes[teamId] = normalizeMissionRouteToken(source.startRoutes?.[teamId] || "S");
    endRoutes[teamId] = normalizeMissionRouteToken(source.endRoutes?.[teamId] || "L");
    const sourceRoute = source.routes?.[teamId];
    const nextRoute = Array.isArray(sourceRoute) ? sourceRoute.map((value) => String(value || "").trim().toUpperCase()) : [];
    if (!nextRoute.length) {
      for (let index = 0; index < middleCount; index += 1) {
        nextRoute[index] = normalizeMissionRouteToken(missionKeys[(index + teamNumber - 1) % missionKeys.length] || missionKeys[0]);
      }
    }
    routes[teamId] = nextRoute.slice(0, middleCount).map((value, index) => normalizeMissionRouteToken(value || missionKeys[index] || missionKeys[0]));

    const sourceCodeRoute = source.codeRoutes?.[teamId];
    startCodeRoutes[teamId] = String(source.startCodeRoutes?.[teamId] || getDefaultCodeKeyForMissionNumber(1)).trim().toUpperCase()
      || getDefaultCodeKeyForMissionNumber(1).toUpperCase();
    endCodeRoutes[teamId] = String(source.endCodeRoutes?.[teamId] || getDefaultCodeKeyForMissionNumber(missionTotal)).trim().toUpperCase()
      || getDefaultCodeKeyForMissionNumber(missionTotal).toUpperCase();
    const nextCodeRoute = Array.isArray(sourceCodeRoute)
      ? sourceCodeRoute.map((value) => String(value || "").trim().toUpperCase())
      : [];
    codeRoutes[teamId] = Array.from({ length: middleCount }, (_, index) => {
      const missionNumber = index + 2;
      return nextCodeRoute[index] || getDefaultCodeKeyForMissionNumber(missionNumber).toUpperCase();
    });
  }

  return {
    ...base,
    mode,
    missionKeys,
    codeLibrary,
    codeVariants,
    missionLibrary,
    outdoorAssets,
    startRoutes,
    endRoutes,
    routes,
    startCodeRoutes,
    endCodeRoutes,
    codeRoutes,
  };
}

function ensureRouteBuilderConfig() {
  routeBuilderConfig = normalizeRouteBuilderConfig(routeBuilderConfig);
  routeBuilderConfig.mode = getSelectedRouteMode();
  return routeBuilderConfig;
}

function hasRouteAssetKey(routeConfig, key = "", missionNumber = 2) {
  const normalizedKey = String(key || "").trim().toUpperCase();
  if (!normalizedKey) return false;
  if (isOutdoorRouteMode(routeConfig)) {
    const hasOutdoorAsset = Boolean(
      routeConfig.outdoorAssets?.[missionNumber]?.[normalizedKey]
      || routeConfig.outdoorAssets?.[String(missionNumber)]?.[normalizedKey]
    );
    if (hasOutdoorAsset) return true;
  }
  return Boolean(routeConfig.missionLibrary?.[normalizedKey]);
}

function resolveRouteMissionKey(teamId, missionNumber) {
  const routeConfig = ensureRouteBuilderConfig();
  if (missionNumber === 1) return getRouteStartMissionKey(routeConfig, teamId);
  if (missionNumber === missionTotal) return getRouteEndMissionKey(routeConfig, teamId);
  const routeIndex = missionNumber - 2;
  return normalizeMissionRouteToken(routeConfig.routes?.[teamId]?.[routeIndex] || routeConfig.missionKeys[routeIndex] || routeConfig.missionKeys[0] || "A");
}

function renderAnswerTemplate(template = "", context = {}) {
  const map = {
    teamNo: context.teamNumber ?? "",
    teamId: context.teamId ?? "",
    key: context.key ?? "",
    missionKey: context.key ?? "",
    missionNo: context.missionNumber ?? "",
  };
  return String(template || "").replace(/\{(teamNo|teamId|key|missionKey|missionNo)\}/g, (_match, token) => String(map[token] ?? ""));
}

function resolveRenderedMissionEntry(teamId, missionNumber, sourceMission = {}) {
  const normalized = normalizeMissionEntry(sourceMission || {});
  const teamNumber = Number(String(teamId || "").replace("Team", "")) || 0;
  const routeKey = normalizeMissionRouteToken(
    normalized.routeKey || resolveRouteMissionKey(teamId, missionNumber) || ""
  );
  const context = { teamId, teamNumber, key: routeKey, missionNumber };
  return normalizeMissionEntry({
    ...normalized,
    codeAnswer: String(normalized.codeAnswer || "").includes("{")
      ? renderAnswerTemplate(normalized.codeAnswer, context)
      : normalized.codeAnswer,
    missionAnswer: String(normalized.missionAnswer || "").includes("{")
      ? renderAnswerTemplate(normalized.missionAnswer, context)
      : normalized.missionAnswer,
    codeStep: {
      ...normalized.codeStep,
      answer: String(normalized.codeStep?.answer || "").includes("{")
        ? renderAnswerTemplate(normalized.codeStep.answer, context)
        : normalized.codeStep?.answer,
    },
    missionStep: {
      ...normalized.missionStep,
      answer: String(normalized.missionStep?.answer || "").includes("{")
        ? renderAnswerTemplate(normalized.missionStep.answer, context)
        : normalized.missionStep?.answer,
    },
  });
}

function buildMissionConfigFromRoute(teamId, missionNumber) {
  const routeConfig = ensureRouteBuilderConfig();
  const teamNumber = Number(teamId.replace("Team", "")) || 0;
  const codeKey = resolveRouteCodeKey(teamId, missionNumber);
  if (isOutdoorRouteMode(routeConfig) && missionNumber > 1 && missionNumber < missionTotal) {
    const assetKey = resolveRouteMissionKey(teamId, missionNumber);
    const asset =
      routeConfig.outdoorAssets?.[missionNumber]?.[assetKey]
      || routeConfig.outdoorAssets?.[String(missionNumber)]?.[assetKey]
      || null;
    if (asset) {
    const missionAnswer = renderAnswerTemplate(asset.missionAnswerTemplate, {
      teamId,
      teamNumber,
      key: assetKey,
      missionNumber,
    }) || "1";
    return normalizeMissionEntry({
      codeAnswer: String(asset.codeAnswer || `${assetKey}${missionNumber}`).trim() || "1",
      codeImageUrl: String(asset.codeImageUrl || "").trim(),
      missionAnswer,
      missionImageUrl: String(asset.missionImageUrl || "").trim(),
      photoSlots: normalizeCount(asset.photoPlan?.length || asset.photoSlots || 0),
      specialSlots: 0,
      photoPlan: normalizePhotoPlan(asset.photoPlan, {
        photoSlots: asset.photoPlan?.length || asset.photoSlots || 0,
        specialSlots: 0,
      }),
      codeLabel: String(asset.label || `${missionNumber}-${assetKey}`).trim(),
      routeLabel: String(asset.label || assetKey).trim(),
      codeStep: {
        mode: STEP_MODES.ANSWER,
        answer: String(asset.codeAnswer || `${assetKey}${missionNumber}`).trim() || "1",
        autoAdvanceSeconds: 0,
        allowBypass: true,
        photoSlots: 0,
        specialSlots: 0,
      },
      missionStep: {
        mode: asset.missionMode || STEP_MODES.ANSWER,
        answer: missionAnswer,
        autoAdvanceSeconds: normalizeAdvanceSeconds(asset.autoAdvanceSeconds || 0),
        allowBypass: true,
        photoSlots: normalizeCount(asset.photoPlan?.length || asset.photoSlots || 0),
        specialSlots: 0,
      },
      routeKey: assetKey,
    });
    }
  }
  const routeKey = resolveRouteMissionKey(teamId, missionNumber);
  const codeEntry = getRouteCodeEntry(routeConfig, codeKey, missionNumber);
  const missionEntry = getEffectiveRouteMissionEntry(
    routeConfig.missionLibrary?.[routeKey] || createDefaultRouteMissionEntry(routeKey),
    routeKey,
  );
  const missionAnswer = renderAnswerTemplate(missionEntry.answerTemplate, {
    teamId,
    teamNumber,
    key: routeKey,
    missionNumber,
  }) || "1";
  return normalizeMissionEntry({
    codeAnswer: String(codeEntry.answer || missionNumber || "1").trim() || "1",
    codeImageUrl: codeEntry.imageUrl || "",
    missionAnswer,
    missionImageUrl: missionEntry.imageUrl || "",
    photoSlots: normalizeCount(codeEntry.photoPlan?.length || codeEntry.photoSlots || missionEntry.photoSlots),
    specialSlots: normalizeCount(missionEntry.specialSlots),
    photoPlan: normalizePhotoPlan(
      (codeEntry.mode === STEP_MODES.PHOTO_HQ ? codeEntry.photoPlan : missionEntry.photoPlan),
      {
        photoSlots: codeEntry.mode === STEP_MODES.PHOTO_HQ
          ? (codeEntry.photoPlan?.length || codeEntry.photoSlots || 0)
          : (missionEntry.photoPlan?.length || missionEntry.photoSlots || 0),
        specialSlots: 0,
      },
    ),
    codeLabel: String(codeEntry.displayName || `코드 ${missionNumber}`).trim(),
    routeLabel: String(missionEntry.displayName || routeKey).trim(),
    codeStep: {
      mode: codeEntry.mode || STEP_MODES.ANSWER,
      answer: String(codeEntry.answer || missionNumber || "1").trim() || "1",
      autoAdvanceSeconds: normalizeAdvanceSeconds(codeEntry.autoAdvanceSeconds || 0),
      allowBypass: codeEntry.allowBypass !== false,
      photoSlots: normalizeCount(codeEntry.photoPlan?.length || codeEntry.photoSlots || 0),
      specialSlots: normalizeCount(codeEntry.specialSlots || 0),
    },
    missionStep: {
      mode: missionEntry.mode || STEP_MODES.ANSWER,
      answer: missionAnswer,
      autoAdvanceSeconds: normalizeAdvanceSeconds(missionEntry.autoAdvanceSeconds || 0),
      allowBypass: missionEntry.allowBypass !== false,
      photoSlots: normalizeCount(missionEntry.photoSlots),
      specialSlots: normalizeCount(missionEntry.specialSlots),
    },
    routeKey,
    codeKey,
  });
}

function buildGeneratedMissionConfigs() {
  const generated = {};
  const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
  for (let teamNumber = 1; teamNumber <= teamCount; teamNumber += 1) {
    const teamId = `Team${teamNumber}`;
    generated[teamId] = {};
    for (let missionNumber = 1; missionNumber <= missionTotal; missionNumber += 1) {
      generated[teamId][missionNumber] = buildMissionConfigFromRoute(teamId, missionNumber);
    }
  }
  return generated;
}

function createComparableMissionShape(mission = {}) {
  const normalized = normalizeMissionEntry(mission);
  return {
    codeAnswer: String(normalized.codeAnswer || "").trim(),
    codeImageUrl: String(normalized.codeImageUrl || "").trim(),
    missionAnswer: String(normalized.missionAnswer || "").trim(),
    missionImageUrl: String(normalized.missionImageUrl || "").trim(),
    photoSlots: normalizeCount(normalized.photoSlots),
    specialSlots: normalizeCount(normalized.specialSlots),
    codeStep: {
      mode: normalized.codeStep.mode,
      answer: String(normalized.codeStep.answer || "").trim(),
      autoAdvanceSeconds: normalizeAdvanceSeconds(normalized.codeStep.autoAdvanceSeconds || 0),
      allowBypass: normalized.codeStep.allowBypass !== false,
    },
    missionStep: {
      mode: normalized.missionStep.mode,
      answer: String(normalized.missionStep.answer || "").trim(),
      autoAdvanceSeconds: normalizeAdvanceSeconds(normalized.missionStep.autoAdvanceSeconds || 0),
      allowBypass: normalized.missionStep.allowBypass !== false,
      photoSlots: normalizeCount(normalized.missionStep.photoSlots || 0),
      specialSlots: normalizeCount(normalized.missionStep.specialSlots || 0),
    },
  };
}

function isMissionOverride(teamId, missionNumber, mission = {}) {
  const generated = buildMissionConfigFromRoute(teamId, missionNumber);
  return JSON.stringify(createComparableMissionShape(mission)) !== JSON.stringify(createComparableMissionShape(generated));
}

function buildTeamOverrideFor(teamId, sourceConfig = null) {
  const config = sourceConfig || ensureMissionConfig(teamId);
  const teamOverride = {};
  for (let missionNumber = 1; missionNumber <= missionTotal; missionNumber += 1) {
    const mission = normalizeMissionEntry(config[missionNumber] || {});
    if (!isMissionOverride(teamId, missionNumber, mission)) continue;
    teamOverride[missionNumber] = mission;
  }
  return teamOverride;
}

function buildTeamOverrides() {
  const overrides = {};
  const teamIds = Object.keys(missionConfigs);
  teamIds.forEach((teamId) => {
    const teamOverride = buildTeamOverrideFor(teamId);
    if (!Object.keys(teamOverride).length) return;
    overrides[teamId] = teamOverride;
  });
  return overrides;
}

function inferRouteBuilderFromProject(project = {}) {
  const inferred = createDefaultRouteBuilderConfig();
  const teams = project.teams || {};
  const teamIds = Object.keys(teams).sort((a, b) => (Number(a.replace("Team", "")) || 0) - (Number(b.replace("Team", "")) || 0));
  const firstTeamId = teamIds[0];
  const firstTeamMissions = teams[firstTeamId]?.config?.missions || {};
  const middleCount = Math.max(1, missionTotal - 2);
  inferred.missionKeys = buildDefaultRouteKeys(middleCount);

  for (let missionNumber = 1; missionNumber <= missionTotal; missionNumber += 1) {
    const sampleTeamId = teamIds.find((teamId) => teams[teamId]?.config?.missions?.[missionNumber]) || firstTeamId;
    const sampleMission = normalizeMissionEntry(teams[sampleTeamId]?.config?.missions?.[missionNumber] || {});
    inferred.codeLibrary[missionNumber] = {
      ...createDefaultRouteCodeEntry(missionNumber),
      answer: sampleMission.codeStep?.answer || sampleMission.codeAnswer || String(missionNumber),
      mode: sampleMission.codeStep?.mode || STEP_MODES.ANSWER,
      autoAdvanceSeconds: normalizeAdvanceSeconds(sampleMission.codeStep?.autoAdvanceSeconds || 0),
      allowBypass: sampleMission.codeStep?.allowBypass !== false,
      imageUrl: sampleMission.codeImageUrl || "",
    };
  }

  const firstTeamNormalized = {};
  for (let missionNumber = 1; missionNumber <= missionTotal; missionNumber += 1) {
    firstTeamNormalized[missionNumber] = normalizeMissionEntry(firstTeamMissions?.[missionNumber] || {});
  }

  inferred.missionLibrary.S = {
    ...createDefaultRouteMissionEntry("S"),
    answerTemplate: normalizeRouteAnswerTemplate(firstTeamNormalized[1]?.missionAnswer, "S"),
    mode: firstTeamNormalized[1]?.missionStep?.mode || STEP_MODES.ANSWER,
    autoAdvanceSeconds: normalizeAdvanceSeconds(firstTeamNormalized[1]?.missionStep?.autoAdvanceSeconds || 0),
    allowBypass: firstTeamNormalized[1]?.missionStep?.allowBypass !== false,
    photoSlots: normalizeCount(firstTeamNormalized[1]?.missionStep?.photoSlots ?? firstTeamNormalized[1]?.photoSlots),
    specialSlots: normalizeCount(firstTeamNormalized[1]?.missionStep?.specialSlots ?? firstTeamNormalized[1]?.specialSlots),
    imageUrl: firstTeamNormalized[1]?.missionImageUrl || "",
  };

  inferred.missionLibrary.L = {
    ...createDefaultRouteMissionEntry("L"),
    answerTemplate: normalizeRouteAnswerTemplate(firstTeamNormalized[missionTotal]?.missionAnswer, "L"),
    mode: firstTeamNormalized[missionTotal]?.missionStep?.mode || STEP_MODES.ANSWER,
    autoAdvanceSeconds: normalizeAdvanceSeconds(firstTeamNormalized[missionTotal]?.missionStep?.autoAdvanceSeconds || 0),
    allowBypass: firstTeamNormalized[missionTotal]?.missionStep?.allowBypass !== false,
    photoSlots: normalizeCount(firstTeamNormalized[missionTotal]?.missionStep?.photoSlots ?? firstTeamNormalized[missionTotal]?.photoSlots),
    specialSlots: normalizeCount(firstTeamNormalized[missionTotal]?.missionStep?.specialSlots ?? firstTeamNormalized[missionTotal]?.specialSlots),
    imageUrl: firstTeamNormalized[missionTotal]?.missionImageUrl || "",
  };

  inferred.missionKeys.forEach((key, index) => {
    const missionNumber = index + 2;
    const sourceMission = firstTeamNormalized[missionNumber] || createDefaultMissionEntry();
    inferred.missionLibrary[key] = {
      ...createDefaultRouteMissionEntry(key),
      answerTemplate: normalizeRouteAnswerTemplate(sourceMission.missionAnswer, key),
      mode: sourceMission.missionStep?.mode || STEP_MODES.ANSWER,
      autoAdvanceSeconds: normalizeAdvanceSeconds(sourceMission.missionStep?.autoAdvanceSeconds || 0),
      allowBypass: sourceMission.missionStep?.allowBypass !== false,
      photoSlots: normalizeCount(sourceMission.missionStep?.photoSlots ?? sourceMission.photoSlots),
      specialSlots: normalizeCount(sourceMission.missionStep?.specialSlots ?? sourceMission.specialSlots),
      imageUrl: sourceMission.missionImageUrl || "",
    };
  });

  teamIds.forEach((teamId) => {
    inferred.routes[teamId] = [];
    for (let missionNumber = 2; missionNumber <= missionTotal - 1; missionNumber += 1) {
      const mission = normalizeMissionEntry(teams[teamId]?.config?.missions?.[missionNumber] || {});
      const existingKey = String(mission.routeKey || "").trim().toUpperCase();
      if (existingKey && inferred.missionLibrary[existingKey]) {
        inferred.routes[teamId].push(existingKey);
        continue;
      }
      const matchedKey = inferred.missionKeys.find((key) => {
        const library = inferred.missionLibrary[key];
        return library?.imageUrl && mission.missionImageUrl && library.imageUrl === mission.missionImageUrl;
      });
      inferred.routes[teamId].push(matchedKey || inferred.missionKeys[missionNumber - 2] || inferred.missionKeys[0]);
    }
  });

  return normalizeRouteBuilderConfig(inferred);
}

function analyzeRouteBuilder() {
  const routeConfig = ensureRouteBuilderConfig();
  const issues = [];
  const expectedKeys = routeConfig.missionKeys;
  Object.entries(routeConfig.routes).forEach(([teamId, route]) => {
    const normalizedRoute = route.map((value) => String(value || "").trim().toUpperCase()).filter(Boolean);
    const invalid = normalizedRoute.filter((key, index) => !hasRouteAssetKey(routeConfig, key, index + 2));
    const duplicates = normalizedRoute.filter((key, index) => normalizedRoute.indexOf(key) !== index);
    const missing = expectedKeys.filter((key) => !normalizedRoute.includes(key));
    if (invalid.length || duplicates.length || missing.length || normalizedRoute.length !== expectedKeys.length) {
      issues.push({
        teamId,
        invalid: Array.from(new Set(invalid)),
        duplicates: Array.from(new Set(duplicates)),
        missing,
        countMismatch: normalizedRoute.length !== expectedKeys.length,
      });
    }
  });
  return issues;
}

function loadMissionConfigs(project = {}) {
  missionConfigs = {};
  const hasRouting = !!project.routing;
  const teamOverrides = project.teamOverrides || {};
  Object.entries(project.teams || {}).forEach(([teamId, teamData]) => {
    const fallbackConfig = normalizeMissionConfig(teamData.config?.missions || {});
    const teamOverride = teamOverrides?.[teamId] || null;
    const hasFinalConfig = Object.keys(fallbackConfig).length > 0;
    if (!hasRouting) {
      missionConfigs[teamId] = fallbackConfig;
      return;
    }
    if (hasFinalConfig) {
      missionConfigs[teamId] = fallbackConfig;
      return;
    }
    const merged = {};
    for (let missionNumber = 1; missionNumber <= missionTotal; missionNumber += 1) {
      const baseFromRoute = buildMissionConfigFromRoute(teamId, missionNumber);
      const overrideMission = teamOverride?.[missionNumber] || teamOverride?.[String(missionNumber)];
      merged[missionNumber] = overrideMission
        ? normalizeMissionEntry({ ...baseFromRoute, ...overrideMission })
        : normalizeMissionEntry(baseFromRoute);
    }
    missionConfigs[teamId] = normalizeMissionConfig(merged);
  });
  if (!project.routing && currentProjectId) {
    routeBuilderInferred = true;
    routeBuilderConfig = inferRouteBuilderFromProject(project);
    showAdminToast("이 프로젝트는 아직 배치표 구조가 없어 기존 팀별 미션에서 배치표를 추정해 표시했습니다. 확인 후 저장하면 새 구조로 함께 관리할 수 있습니다.", "warn", 4600);
  } else {
    routeBuilderInferred = false;
  }
  renderMissionOverview();
  renderSetupRoadmap();
}

function copyMissionStepData(targetMission, sourceMission, stepKey = "missionStep") {
  if (!targetMission || !sourceMission) return;
  const nextMission = normalizeMissionEntry(sourceMission);
  if (stepKey === "codeStep") {
    targetMission.codeAnswer = nextMission.codeAnswer;
    targetMission.codeImageUrl = nextMission.codeImageUrl;
    targetMission.codeLabel = nextMission.codeLabel;
    targetMission.codeKey = nextMission.codeKey;
    targetMission.codeStep = {
      ...nextMission.codeStep,
    };
    if (targetMission.codeStep.mode === STEP_MODES.PHOTO_HQ) {
      targetMission.photoSlots = normalizeCount(nextMission.codeStep.photoSlots || nextMission.photoSlots || 0);
      targetMission.specialSlots = normalizeCount(nextMission.codeStep.specialSlots || nextMission.specialSlots || 0);
      targetMission.photoPlan = normalizePhotoPlan(nextMission.photoPlan, {
        photoSlots: targetMission.photoSlots,
        specialSlots: targetMission.specialSlots,
      });
      targetMission.missionStep.photoSlots = targetMission.photoSlots;
      targetMission.missionStep.specialSlots = targetMission.specialSlots;
    } else if (targetMission.missionStep.mode !== STEP_MODES.PHOTO_HQ) {
      targetMission.photoSlots = 0;
      targetMission.specialSlots = 0;
      targetMission.photoPlan = [];
      targetMission.codeStep.photoSlots = 0;
      targetMission.codeStep.specialSlots = 0;
      targetMission.missionStep.photoSlots = 0;
      targetMission.missionStep.specialSlots = 0;
    }
    return;
  }
  targetMission.missionAnswer = nextMission.missionAnswer;
  targetMission.missionImageUrl = nextMission.missionImageUrl;
  targetMission.routeLabel = nextMission.routeLabel;
  targetMission.routeKey = nextMission.routeKey;
  targetMission.missionStep = {
    ...nextMission.missionStep,
  };
  targetMission.photoSlots = normalizeCount(nextMission.photoSlots);
  targetMission.specialSlots = normalizeCount(nextMission.specialSlots);
  targetMission.photoPlan = normalizePhotoPlan(nextMission.photoPlan, {
    photoSlots: targetMission.photoSlots,
    specialSlots: targetMission.specialSlots,
  });
  if (targetMission.missionStep.mode !== STEP_MODES.PHOTO_HQ && targetMission.codeStep.mode !== STEP_MODES.PHOTO_HQ) {
    targetMission.photoSlots = 0;
    targetMission.specialSlots = 0;
    targetMission.photoPlan = [];
    targetMission.codeStep.photoSlots = 0;
    targetMission.codeStep.specialSlots = 0;
    targetMission.missionStep.photoSlots = 0;
    targetMission.missionStep.specialSlots = 0;
  }
}

function getRouteCodeKeyChoices() {
  const routeConfig = ensureRouteBuilderConfig();
  const keys = [];
  for (let i = 1; i <= missionTotal; i += 1) {
    keys.push(`C${i}`);
    const variants = routeConfig.codeVariants?.[i] || routeConfig.codeVariants?.[String(i)] || {};
    Object.keys(variants)
      .sort((a, b) => a.localeCompare(b, "en"))
      .forEach((key) => {
        const normalized = String(key || "").trim().toUpperCase();
        if (normalized) keys.push(`C${normalized}`);
      });
  }
  return Array.from(new Set(keys));
}

function getRouteMissionKeyChoices() {
  const routeConfig = ensureRouteBuilderConfig();
  const keys = new Set(["S", ...routeConfig.missionKeys, "L"]);
  Object.keys(routeConfig.missionLibrary || {}).forEach((key) => {
    const normalized = normalizeMissionRouteToken(key);
    if (normalized) keys.add(normalized);
  });
  return Array.from(keys);
}

function promptLibrarySelection(type = "code", defaultKey = "") {
  const choices = type === "code" ? getRouteCodeKeyChoices() : getRouteMissionKeyChoices();
  const choiceLabel = type === "code" ? "코드 키" : "미션 키";
  const message = `${choiceLabel}를 입력하세요.\n${choices.join(", ")}`;
  const raw = window.prompt(message, defaultKey || choices[0] || "");
  if (raw === null) return null;
  const normalized = type === "code"
    ? String(raw || "").trim().toUpperCase()
    : normalizeMissionRouteToken(raw);
  if (!normalized) return null;
  const exists = choices.includes(normalized);
  if (!exists) {
    showAdminToast(`${choiceLabel}가 라이브러리에 없습니다: ${normalized}`, "warn", 2600);
    return null;
  }
  return normalized;
}

function buildMissionConfigFromSelectedCode(teamId, missionNumber, codeSelection) {
  const routeConfig = ensureRouteBuilderConfig();
  const normalizedCodeKey = normalizeCodeRouteToken(codeSelection);
  const codeEntry = getRouteCodeEntry(routeConfig, normalizedCodeKey, missionNumber);
  return normalizeMissionEntry({
    ...buildMissionConfigFromRoute(teamId, missionNumber),
    codeAnswer: String(codeEntry.answer || missionNumber || "1").trim() || "1",
    codeImageUrl: codeEntry.imageUrl || "",
    codeLabel: String(codeEntry.displayName || `코드 ${missionNumber}`).trim(),
    codeKey: normalizedCodeKey,
    codeStep: {
      mode: codeEntry.mode || STEP_MODES.ANSWER,
      answer: String(codeEntry.answer || missionNumber || "1").trim() || "1",
      autoAdvanceSeconds: normalizeAdvanceSeconds(codeEntry.autoAdvanceSeconds || 0),
      allowBypass: codeEntry.allowBypass !== false,
      photoSlots: normalizeCount(codeEntry.photoPlan?.length || codeEntry.photoSlots || 0),
      specialSlots: normalizeCount(codeEntry.specialSlots || 0),
    },
    photoSlots: codeEntry.mode === STEP_MODES.PHOTO_HQ
      ? normalizeCount(codeEntry.photoPlan?.length || codeEntry.photoSlots || 0)
      : undefined,
    specialSlots: codeEntry.mode === STEP_MODES.PHOTO_HQ
      ? normalizeCount(codeEntry.specialSlots || 0)
      : undefined,
    photoPlan: codeEntry.mode === STEP_MODES.PHOTO_HQ
      ? normalizePhotoPlan(codeEntry.photoPlan, {
          photoSlots: codeEntry.photoPlan?.length || codeEntry.photoSlots || 0,
          specialSlots: codeEntry.specialSlots || 0,
        })
      : undefined,
  });
}

function buildMissionConfigFromSelectedMission(teamId, missionNumber, missionSelection) {
  const routeConfig = ensureRouteBuilderConfig();
  const normalizedMissionKey = normalizeMissionRouteToken(missionSelection);
  const teamNumber = Number(teamId.replace("Team", "")) || 0;
  const missionEntry = getEffectiveRouteMissionEntry(
    routeConfig.missionLibrary?.[normalizedMissionKey] || createDefaultRouteMissionEntry(normalizedMissionKey),
    normalizedMissionKey,
  );
  const missionAnswerTemplate = String(missionEntry.answerTemplate || "").trim() || "1";
  const missionAnswer = renderAnswerTemplate(missionAnswerTemplate, {
    teamId,
    teamNumber,
    key: normalizedMissionKey,
    missionNumber,
  }) || "1";
  return normalizeMissionEntry({
    ...buildMissionConfigFromRoute(teamId, missionNumber),
    missionAnswer,
    missionAnswerTemplate,
    missionImageUrl: missionEntry.imageUrl || "",
    routeLabel: String(missionEntry.displayName || normalizedMissionKey).trim(),
    routeKey: normalizedMissionKey,
    photoSlots: normalizeCount(missionEntry.photoSlots),
    specialSlots: normalizeCount(missionEntry.specialSlots),
    photoPlan: normalizePhotoPlan(missionEntry.photoPlan, {
      photoSlots: missionEntry.photoSlots || 0,
      specialSlots: missionEntry.specialSlots || 0,
    }),
    missionStep: {
      mode: missionEntry.mode || STEP_MODES.ANSWER,
      answer: missionAnswer,
      autoAdvanceSeconds: normalizeAdvanceSeconds(missionEntry.autoAdvanceSeconds || 0),
      allowBypass: missionEntry.allowBypass !== false,
      photoSlots: normalizeCount(missionEntry.photoSlots),
      specialSlots: normalizeCount(missionEntry.specialSlots),
    },
  });
}

function renderRouteBuilder() {
  if (!elements.routeCodeTableBody || !elements.routeMissionLibraryBody || !elements.routeMatrixBody || !elements.routeMatrixHead) {
    return;
  }
  const routeConfig = ensureRouteBuilderConfig();
  if (elements.routeMissionKeysInput) {
    elements.routeMissionKeysInput.value = routeConfig.missionKeys.join(", ");
  }
  renderRouteCodeLibrary(routeConfig);
  renderRouteMissionLibrary(routeConfig);
  renderOutdoorAssetLibrary(routeConfig);
  renderRouteMatrix(routeConfig);
  renderRouteTemplates();
  bindInlineImageDropzones(elements.routeCodeTableBody, handleRouteLibraryDrop);
  bindInlineImageDropzones(elements.routeMissionLibraryBody, handleRouteLibraryDrop);
  bindInlineImageDropzones(elements.outdoorAssetLibraryBody, handleRouteLibraryDrop);
}

function renderOutdoorAssetLibrary(routeConfig) {
  if (!elements.outdoorAssetPanel || !elements.outdoorAssetLibraryBody) return;
  elements.outdoorAssetPanel.hidden = true;
  elements.outdoorAssetLibraryBody.innerHTML = "";
  return;
  const rows = [];
  for (let missionNumber = 2; missionNumber <= missionTotal - 1; missionNumber += 1) {
    routeConfig.missionKeys.forEach((key) => {
      const entry =
        routeConfig.outdoorAssets?.[missionNumber]?.[key]
        || routeConfig.outdoorAssets?.[String(missionNumber)]?.[key]
        || createDefaultOutdoorAssetEntry(missionNumber, key);
      rows.push(`
        <tr data-outdoor-step="${missionNumber}" data-outdoor-key="${key}">
          <td><span class="team-number-badge">Step ${missionNumber}</span></td>
          <td><span class="team-number-badge">${key}</span></td>
          <td><input class="outdoor-asset-label route-library-input" data-outdoor-step="${missionNumber}" data-outdoor-key="${key}" value="${entry.label || ""}" placeholder="표시명" /></td>
          <td><input class="outdoor-asset-code-answer route-library-input route-library-input--short" data-outdoor-step="${missionNumber}" data-outdoor-key="${key}" value="${entry.codeAnswer || ""}" placeholder="${key}${missionNumber}" /></td>
          <td>
            <select class="outdoor-asset-mission-mode" data-outdoor-step="${missionNumber}" data-outdoor-key="${key}">
              ${buildStepModeOptions(entry.missionMode || STEP_MODES.ANSWER, true)}
            </select>
          </td>
          <td><input class="outdoor-asset-delay" data-outdoor-step="${missionNumber}" data-outdoor-key="${key}" type="number" min="0" max="60" value="${secondsToDelayMinutes(entry.autoAdvanceSeconds || 0)}" /></td>
          <td><input class="outdoor-asset-slot-plan route-library-input route-library-input--slots" data-outdoor-step="${missionNumber}" data-outdoor-key="${key}" value="${stringifyPhotoPlan(entry.photoPlan)}" placeholder="예: 단체, 인증샷" /></td>
          <td>
            <div class="route-asset-dropzone" data-route-upload-drop="outdoor-code" data-route-step="${missionNumber}" data-route-key="${key}">
              <div class="route-asset-thumb ${entry.codeImageUrl ? "" : "is-empty"}">
                ${entry.codeImageUrl ? `<img src="${entry.codeImageUrl}" alt="${key} code" />` : "<span>코드</span>"}
              </div>
              <label class="btn btn-secondary btn--compact">코드<input type="file" hidden accept="image/*" data-route-upload="outdoor-code" data-route-step="${missionNumber}" data-route-key="${key}" /></label>
            </div>
          </td>
          <td>
            <div class="route-asset-dropzone" data-route-upload-drop="outdoor-mission" data-route-step="${missionNumber}" data-route-key="${key}">
              <div class="route-asset-thumb ${entry.missionImageUrl ? "" : "is-empty"}">
                ${entry.missionImageUrl ? `<img src="${entry.missionImageUrl}" alt="${key} mission" />` : "<span>미션</span>"}
              </div>
              <label class="btn btn-secondary btn--compact">미션<input type="file" hidden accept="image/*" data-route-upload="outdoor-mission" data-route-step="${missionNumber}" data-route-key="${key}" /></label>
            </div>
          </td>
        </tr>
      `);
    });
  }
  elements.outdoorAssetLibraryBody.innerHTML = rows.join("");
}

function loadRouteTemplates() {
  try {
    const raw = window.localStorage.getItem(ROUTE_TEMPLATE_STORAGE_KEY);
    const parsed = JSON.parse(raw || "[]");
    routeTemplates = Array.isArray(parsed) ? parsed : [];
  } catch {
    routeTemplates = [];
  }
}

function persistRouteTemplates() {
  try {
    window.localStorage.setItem(ROUTE_TEMPLATE_STORAGE_KEY, JSON.stringify(routeTemplates));
  } catch {
    // Ignore localStorage access issues.
  }
}

function renderRouteTemplates() {
  if (!elements.routeTemplateSelect) return;
  const currentValue = elements.routeTemplateSelect.value;
  elements.routeTemplateSelect.innerHTML = [
    `<option value="">저장된 패턴 선택</option>`,
    ...routeTemplates.map((template) => (
      `<option value="${template.id}">${template.name} · ${template.teamCount}조 · ${template.missionTotal}미션</option>`
    )),
  ].join("");
  if (currentValue && routeTemplates.some((template) => template.id === currentValue)) {
    elements.routeTemplateSelect.value = currentValue;
  }
}

function renderRouteCodeLibrary(routeConfig) {
  elements.routeCodeTableBody.innerHTML = Array.from({ length: missionTotal }, (_, index) => {
    const missionNumber = index + 1;
    const entry = routeConfig.codeLibrary[missionNumber] || createDefaultRouteCodeEntry(missionNumber);
    const variants = Object.entries(routeConfig.codeVariants?.[missionNumber] || {})
      .sort(([a], [b]) => a.localeCompare(b, "ko"))
      .map(([variantKey, variantEntry]) => `
        <tr class="route-variant-row" data-code-row="${missionNumber}" data-code-variant-row="${variantKey}">
          <td>
            <div class="route-variant-cell">
              <span class="route-variant-badge">${variantKey}</span>
              <button type="button" class="btn btn-secondary btn--compact route-delete-variant-btn" data-delete-code-variant="${missionNumber}" data-code-variant-key="${variantKey}">삭제</button>
            </div>
          </td>
          <td><input class="route-code-name route-library-input" data-code-number="${missionNumber}" data-code-variant-key="${variantKey}" value="${variantEntry.displayName || ""}" placeholder="표시명" title="표시명" /></td>
          <td><input class="route-code-answer route-library-input route-library-input--short" data-code-number="${missionNumber}" data-code-variant-key="${variantKey}" value="${variantEntry.answer || ""}" placeholder="${variantKey}" title="정답" /></td>
          <td>
            <select class="route-code-mode" data-code-number="${missionNumber}" data-code-variant-key="${variantKey}">
              ${buildStepModeOptions(variantEntry.mode || STEP_MODES.ANSWER, false)}
            </select>
          </td>
          <td><input class="route-code-delay" data-code-number="${missionNumber}" data-code-variant-key="${variantKey}" type="number" min="0" max="60" value="${secondsToDelayMinutes(variantEntry.autoAdvanceSeconds || 0)}" /></td>
          <td><input class="route-code-slot-plan route-library-input route-library-input--slots" data-code-number="${missionNumber}" data-code-variant-key="${variantKey}" value="${stringifyPhotoPlan(variantEntry.photoPlan)}" placeholder="예: 전체 셀카, 점프샷" title="쉼표로 구분된 사진 슬롯 이름" /></td>
          <td>
            <div class="route-asset-pair">
              <div class="route-asset-dropzone" data-route-upload-drop="code" data-route-key="${variantKey}" data-route-variant="base" data-route-step="${missionNumber}">
                <div class="route-asset-thumb ${variantEntry.imageUrl ? "" : "is-empty"}">
                  ${variantEntry.imageUrl ? `<img src="${variantEntry.imageUrl}" alt="${variantKey}" />` : "<span>기본</span>"}
                </div>
                <label class="btn btn-secondary btn--compact">기본<input type="file" hidden accept="image/*" data-route-upload="code" data-route-key="${variantKey}" data-route-variant="base" data-route-step="${missionNumber}" /></label>
              </div>
              <div class="route-asset-dropzone route-asset-dropzone--rain" data-route-upload-drop="code" data-route-key="${variantKey}" data-route-variant="rain" data-route-step="${missionNumber}">
                <div class="route-asset-thumb ${variantEntry.rainImageUrl ? "" : "is-empty"}">
                  ${variantEntry.rainImageUrl ? `<img src="${variantEntry.rainImageUrl}" alt="우천 ${variantKey}" />` : "<span>우천</span>"}
                </div>
                <label class="btn btn-secondary btn--compact">우천<input type="file" hidden accept="image/*" data-route-upload="code" data-route-key="${variantKey}" data-route-variant="rain" data-route-step="${missionNumber}" /></label>
              </div>
            </div>
          </td>
        </tr>
      `)
      .join("");
    return `
      <tr data-code-row="${missionNumber}">
        <td>
          <div class="route-base-cell">
            <span class="team-number-badge">코드 ${missionNumber}</span>
            <button type="button" class="btn btn-secondary btn--compact route-add-variant-btn" data-add-code-variant="${missionNumber}">예외 추가</button>
          </div>
        </td>
        <td><input class="route-code-name route-library-input" data-code-number="${missionNumber}" value="${entry.displayName || ""}" placeholder="표시명" title="표시명" /></td>
        <td><input class="route-code-answer route-library-input route-library-input--short" data-code-number="${missionNumber}" value="${entry.answer || ""}" placeholder="${missionNumber}" title="정답" /></td>
        <td>
          <select class="route-code-mode" data-code-number="${missionNumber}">
            ${buildStepModeOptions(entry.mode || STEP_MODES.ANSWER, false)}
          </select>
        </td>
        <td><input class="route-code-delay" data-code-number="${missionNumber}" type="number" min="0" max="60" value="${secondsToDelayMinutes(entry.autoAdvanceSeconds || 0)}" /></td>
        <td><input class="route-code-slot-plan route-library-input route-library-input--slots" data-code-number="${missionNumber}" value="${stringifyPhotoPlan(entry.photoPlan)}" placeholder="예: 전체 셀카, 점프샷" title="쉼표로 구분된 사진 슬롯 이름" /></td>
        <td>
          <div class="route-asset-pair">
            <div class="route-asset-dropzone" data-route-upload-drop="code" data-route-key="${missionNumber}" data-route-variant="base">
              <div class="route-asset-thumb ${entry.imageUrl ? "" : "is-empty"}">
                ${entry.imageUrl ? `<img src="${entry.imageUrl}" alt="코드 ${missionNumber}" />` : "<span>기본</span>"}
              </div>
              <label class="btn btn-secondary btn--compact">
                기본
                <input type="file" hidden accept="image/*" data-route-upload="code" data-route-key="${missionNumber}" data-route-variant="base" />
              </label>
            </div>
            <div class="route-asset-dropzone route-asset-dropzone--rain" data-route-upload-drop="code" data-route-key="${missionNumber}" data-route-variant="rain">
              <div class="route-asset-thumb ${entry.rainImageUrl ? "" : "is-empty"}">
                ${entry.rainImageUrl ? `<img src="${entry.rainImageUrl}" alt="우천 코드 ${missionNumber}" />` : "<span>우천</span>"}
              </div>
              <label class="btn btn-secondary btn--compact">
                우천
                <input type="file" hidden accept="image/*" data-route-upload="code" data-route-key="${missionNumber}" data-route-variant="rain" />
              </label>
            </div>
          </div>
        </td>
      </tr>
      ${variants}
    `;
  }).join("");
}

function autoFillRouteMatrix() {
  const routeConfig = ensureRouteBuilderConfig();
  const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
  const middleCount = Math.max(1, missionTotal - 2);
  const keys = routeConfig.missionKeys.length ? routeConfig.missionKeys : buildDefaultRouteKeys(middleCount);
  for (let teamNumber = 1; teamNumber <= teamCount; teamNumber += 1) {
    const teamId = `Team${teamNumber}`;
    routeConfig.routes[teamId] = Array.from({ length: middleCount }, (_, routeIndex) => (
      keys[(routeIndex + teamNumber - 1) % keys.length] || keys[0] || "A"
    ));
    routeConfig.codeRoutes[teamId] = Array.from({ length: middleCount }, (_, routeIndex) => getDefaultCodeKeyForMissionNumber(routeIndex + 2));
  }
  renderRouteBuilder();
  markRouteBuilderDirty();
  showAdminToast("팀 배치표를 기본 순열로 채웠습니다. 필요한 팀만 수정하세요.", "success", 2800);
}

function autoFillRouteMatrixFromActiveTeam() {
  const startTeamId = activeRoutePreview.teamId;
  if (!startTeamId) {
    showAdminToast("먼저 시작할 팀의 셀을 하나 선택하세요.", "warn", 2600);
    return;
  }
  const startTeamNumber = Number(startTeamId.replace("Team", "")) || 0;
  const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
  if (!startTeamNumber) {
    showAdminToast("시작 팀 정보를 읽지 못했습니다.", "warn", 2600);
    return;
  }
  const routeConfig = ensureRouteBuilderConfig();
  const middleCount = Math.max(1, missionTotal - 2);
  const keys = routeConfig.missionKeys.length ? routeConfig.missionKeys : buildDefaultRouteKeys(middleCount);
  for (let teamNumber = startTeamNumber; teamNumber <= teamCount; teamNumber += 1) {
    const teamId = `Team${teamNumber}`;
    routeConfig.routes[teamId] = Array.from({ length: middleCount }, (_, routeIndex) => (
      keys[(routeIndex + teamNumber - 1) % keys.length] || keys[0] || "A"
    ));
    routeConfig.codeRoutes[teamId] = Array.from({ length: middleCount }, (_, routeIndex) => getDefaultCodeKeyForMissionNumber(routeIndex + 2));
  }
  renderRouteBuilder();
  markRouteBuilderDirty();
  showAdminToast(`${formatMissionTeamLabel(startTeamId)}부터 아래 팀을 기본 순열로 다시 채웠습니다.`, "success", 3000);
}

function getRouteDisplayLabel(routeConfig, key = "", missionNumber = 2) {
  const parts = getRouteDisplayParts(routeConfig, key, missionNumber);
  if (!parts.label) return parts.key;
  const label = String(parts.label || "").trim();
  const normalizedKey = String(parts.key || "").trim().toUpperCase();
  return label && label !== normalizedKey ? `${normalizedKey}(${label})` : normalizedKey;
}

function getRouteDisplayParts(routeConfig, key = "", missionNumber = 2) {
  const normalizedKey = String(key || "").trim().toUpperCase();
  if (!normalizedKey) {
    return { key: "-", label: "" };
  }
  let label = "";
  if (isOutdoorRouteMode(routeConfig) && missionNumber > 1 && missionNumber < missionTotal) {
    const outdoorEntry =
      routeConfig.outdoorAssets?.[missionNumber]?.[normalizedKey]
      || routeConfig.outdoorAssets?.[String(missionNumber)]?.[normalizedKey]
      || null;
    label = String(outdoorEntry?.label || "").trim();
    if (!label) {
      const fallbackEntry = getEffectiveRouteMissionEntry(routeConfig.missionLibrary?.[normalizedKey] || {}, normalizedKey);
      label = String(fallbackEntry?.displayName || "").trim();
    }
  } else {
    const entry = getEffectiveRouteMissionEntry(routeConfig.missionLibrary?.[normalizedKey] || {}, normalizedKey);
    label = String(entry?.displayName || "").trim();
  }
  return {
    key: normalizedKey,
    label: label && label !== normalizedKey ? label : "",
  };
}

function getRouteAnswerPreview(routeConfig, key = "", missionNumber = 2, teamId = "", teamNumber = 0) {
  const normalizedKey = String(key || "").trim().toUpperCase();
  if (!normalizedKey) return "-";
  if (isOutdoorRouteMode(routeConfig) && missionNumber > 1 && missionNumber < missionTotal) {
    const asset =
      routeConfig.outdoorAssets?.[missionNumber]?.[normalizedKey]
      || routeConfig.outdoorAssets?.[String(missionNumber)]?.[normalizedKey]
      || null;
    if (asset) {
      const preview = renderAnswerTemplate(asset.missionAnswerTemplate || "", {
        teamId,
        teamNumber,
        key: normalizedKey,
        missionNumber,
      });
      return preview || "-";
    }
  }
  const effectiveMissionEntry = getEffectiveRouteMissionEntry(routeConfig.missionLibrary[normalizedKey] || {}, normalizedKey);
  const preview = renderAnswerTemplate(effectiveMissionEntry.answerTemplate || "", {
    teamId,
    teamNumber,
    key: normalizedKey,
    missionNumber,
  });
  return preview || "-";
}

function getRouteCodeAnswerPreview(routeConfig, codeKey = "", missionNumber = 2) {
  const normalizedKey = String(codeKey || "").trim().toUpperCase();
  if (!normalizedKey) return "-";
  const entry = getRouteCodeEntry(routeConfig, normalizedKey, missionNumber);
  return String(entry.answer || normalizedKey).trim() || "-";
}

function buildAppliedRouteStaffCell(teamId, missionNumber, routeConfig) {
  const appliedMission = normalizeMissionEntry(
    ensureMissionConfig(teamId)?.[missionNumber]
    || buildMissionConfigFromRoute(teamId, missionNumber)
  );
  const fallbackMissionKey = missionNumber === 1
    ? getRouteStartMissionKey(routeConfig, teamId)
    : missionNumber === missionTotal
      ? getRouteEndMissionKey(routeConfig, teamId)
      : (routeConfig.routes?.[teamId] || [])[missionNumber - 2] || "";
  const missionKey = String(appliedMission.routeKey || fallbackMissionKey || "-").trim().toUpperCase() || "-";
  const codeAnswer = String(
    appliedMission.codeStep?.answer
    || appliedMission.codeAnswer
    || getRouteCodeAnswerPreview(routeConfig, appliedMission.codeKey || "", missionNumber)
    || "-"
  ).trim() || "-";
  return {
    key: missionKey,
    answer: codeAnswer,
  };
}

function renderRouteMissionLibrary(routeConfig) {
  const keys = ["S", ...routeConfig.missionKeys, "L"];
  elements.routeMissionLibraryBody.innerHTML = keys.map((key) => {
    const entry = routeConfig.missionLibrary[key] || createDefaultRouteMissionEntry(key);
    const effectiveEntry = getEffectiveRouteMissionEntry(entry, key);
    const sample = renderAnswerTemplate(effectiveEntry.answerTemplate, {
      teamId: "Team1",
      teamNumber: 1,
      key,
      missionNumber: 1,
    });
    const variants = Object.keys(routeConfig.missionLibrary || {})
      .filter((candidate) => candidate.startsWith(`${key}-`))
      .sort((a, b) => a.localeCompare(b, "ko"))
      .map((variantKey) => {
        const variantEntry = routeConfig.missionLibrary[variantKey] || createDefaultRouteMissionEntry(variantKey);
        const variantEffectiveEntry = getEffectiveRouteMissionEntry(variantEntry, variantKey);
        const variantSample = renderAnswerTemplate(variantEffectiveEntry.answerTemplate, {
          teamId: "Team1",
          teamNumber: 1,
          key: variantKey,
          missionNumber: 1,
        });
        return `
          <tr class="route-variant-row" data-mission-key="${variantKey}">
            <td>
              <div class="route-variant-cell">
                <span class="route-variant-badge">${variantKey}</span>
                <button type="button" class="btn btn-secondary btn--compact route-delete-variant-btn" data-delete-mission-variant="${variantKey}">삭제</button>
              </div>
            </td>
            <td><input class="route-mission-name route-library-input" data-mission-key="${variantKey}" value="${variantEntry.displayName || ""}" placeholder="표시명" title="표시명" /></td>
            <td><input class="route-mission-template route-library-input route-library-input--template" data-mission-key="${variantKey}" value="${variantEntry.answerTemplate || ""}" placeholder="${getDefaultRouteAnswerTemplate(variantKey)}" title="정답 템플릿" /></td>
            <td>
              <select class="route-mission-mode" data-mission-key="${variantKey}">
                ${buildStepModeOptions(variantEntry.mode || STEP_MODES.ANSWER, true)}
              </select>
            </td>
            <td><input class="route-mission-delay" data-mission-key="${variantKey}" type="number" min="0" max="60" value="${secondsToDelayMinutes(variantEntry.autoAdvanceSeconds || 0)}" /></td>
            <td><input class="route-mission-slot-plan route-library-input route-library-input--slots" data-mission-key="${variantKey}" value="${stringifyPhotoPlan(variantEntry.photoPlan)}" placeholder="예: 전체 셀카, 점프샷, 핵심가치" title="쉼표로 구분된 사진 슬롯 이름" /></td>
            <td>
              <div class="route-asset-pair">
                <div class="route-asset-dropzone" data-route-upload-drop="mission" data-route-key="${variantKey}" data-route-variant="base">
                  <div class="route-asset-thumb ${variantEntry.imageUrl ? "" : "is-empty"}">
                    ${variantEntry.imageUrl ? `<img src="${variantEntry.imageUrl}" alt="${variantKey}" />` : "<span>기본</span>"}
                  </div>
                  <label class="btn btn-secondary btn--compact">기본<input type="file" hidden accept="image/*" data-route-upload="mission" data-route-key="${variantKey}" data-route-variant="base" /></label>
                </div>
                <div class="route-asset-dropzone route-asset-dropzone--rain" data-route-upload-drop="mission" data-route-key="${variantKey}" data-route-variant="rain">
                  <div class="route-asset-thumb ${variantEntry.rainImageUrl ? "" : "is-empty"}">
                    ${variantEntry.rainImageUrl ? `<img src="${variantEntry.rainImageUrl}" alt="우천 ${variantKey}" />` : "<span>우천</span>"}
                  </div>
                  <label class="btn btn-secondary btn--compact">우천<input type="file" hidden accept="image/*" data-route-upload="mission" data-route-key="${variantKey}" data-route-variant="rain" /></label>
                </div>
              </div>
            </td>
            <td><span class="route-sample-answer">${variantSample || "-"}</span></td>
          </tr>
        `;
      })
      .join("");
    return `
      <tr data-mission-key="${key}">
        <td>
          <div class="route-base-cell">
            <span class="team-number-badge">${key}</span>
            ${key !== "S" && key !== "L" ? `<button type="button" class="btn btn-secondary btn--compact route-add-variant-btn" data-add-mission-variant="${key}">예외 추가</button>` : ""}
          </div>
        </td>
        <td><input class="route-mission-name route-library-input" data-mission-key="${key}" value="${entry.displayName || ""}" placeholder="표시명" title="표시명" /></td>
        <td><input class="route-mission-template route-library-input route-library-input--template" data-mission-key="${key}" value="${entry.answerTemplate || ""}" placeholder="${getDefaultRouteAnswerTemplate(key)}" title="정답 템플릿" /></td>
        <td>
          <select class="route-mission-mode" data-mission-key="${key}">
            ${buildStepModeOptions(entry.mode || STEP_MODES.ANSWER, true)}
          </select>
        </td>
        <td><input class="route-mission-delay" data-mission-key="${key}" type="number" min="0" max="60" value="${secondsToDelayMinutes(entry.autoAdvanceSeconds || 0)}" /></td>
        <td><input class="route-mission-slot-plan route-library-input route-library-input--slots" data-mission-key="${key}" value="${stringifyPhotoPlan(entry.photoPlan)}" placeholder="예: 전체 셀카, 점프샷, 핵심가치" title="쉼표로 구분된 사진 슬롯 이름" /></td>
        <td>
          <div class="route-asset-pair">
            <div class="route-asset-dropzone" data-route-upload-drop="mission" data-route-key="${key}" data-route-variant="base">
              <div class="route-asset-thumb ${entry.imageUrl ? "" : "is-empty"}">
                ${entry.imageUrl ? `<img src="${entry.imageUrl}" alt="${key}" />` : "<span>기본</span>"}
              </div>
              <label class="btn btn-secondary btn--compact">
                기본
                <input type="file" hidden accept="image/*" data-route-upload="mission" data-route-key="${key}" data-route-variant="base" />
              </label>
            </div>
            <div class="route-asset-dropzone route-asset-dropzone--rain" data-route-upload-drop="mission" data-route-key="${key}" data-route-variant="rain">
              <div class="route-asset-thumb ${entry.rainImageUrl ? "" : "is-empty"}">
                ${entry.rainImageUrl ? `<img src="${entry.rainImageUrl}" alt="우천 ${key}" />` : "<span>우천</span>"}
              </div>
              <label class="btn btn-secondary btn--compact">
                우천
                <input type="file" hidden accept="image/*" data-route-upload="mission" data-route-key="${key}" data-route-variant="rain" />
              </label>
            </div>
          </div>
        </td>
        <td><span class="route-sample-answer">${sample || "-"}</span></td>
      </tr>
      ${variants}
    `;
  }).join("");
}

function renderRouteMatrix(routeConfig) {
  const sanitize = (value = "") => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const middleCount = Math.max(1, missionTotal - 2);
  const warningsByTeam = buildRouteValidationMap(routeConfig);
  if (elements.routeKeyOptions) {
    elements.routeKeyOptions.innerHTML = buildMissionLibraryKeys(routeConfig)
      .map((key) => `<option value="${key}"></option>`)
      .join("");
  }
  if (elements.routeCodeKeyOptions) {
    elements.routeCodeKeyOptions.innerHTML = Array.from({ length: missionTotal }, (_, index) => {
      const missionNumber = index + 1;
      return buildCodeKeyOptions(routeConfig, missionNumber);
    }).flat().filter((value, index, array) => array.indexOf(value) === index)
      .map((key) => `<option value="${key}"></option>`)
      .join("");
  }
  const routeHeaders = routeConfig.missionKeys?.length
    ? routeConfig.missionKeys.slice(0, middleCount)
    : Array.from({ length: middleCount }, (_, index) => `${index + 1}타임`);
  elements.routeMatrixHead.innerHTML = `
    <tr>
      <th>팀</th>
      <th>팀 비밀번호</th>
      <th>S</th>
      ${routeHeaders.map((label) => `<th>${label}</th>`).join("")}
      <th>L</th>
      <th>검증</th>
    </tr>
  `;
  const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
  elements.routeMatrixBody.innerHTML = Array.from({ length: teamCount }, (_, index) => {
    const teamNumber = index + 1;
    const teamId = `Team${teamNumber}`;
    const route = routeConfig.routes[teamId] || [];
    const warnings = warningsByTeam.get(teamId) || [];
    const warningBadges = warnings.length
      ? warnings
          .map((warning) => `<span class="route-warning-badge" title="${sanitize(toRouteWarningLabel(warning))}">${sanitize(toRouteWarningShortCode(warning))}</span>`)
          .join("")
      : '<span class="route-warning-badge route-warning-badge--ok" title="정상">OK</span>';
    const password = resolveTeamPassword(teamProfiles[teamId]?.password, teamNumber);
    const startCodeKey = getRouteStartCodeKey(routeConfig, teamId);
    const startMissionKey = getRouteStartMissionKey(routeConfig, teamId);
    const startCodePreviewText = getRouteCodeAnswerPreview(routeConfig, startCodeKey, 1);
    const startPreviewText = getRouteAnswerPreview(routeConfig, startMissionKey, 1, teamId, teamNumber);
    const endCodeKey = getRouteEndCodeKey(routeConfig, teamId);
    const endMissionKey = getRouteEndMissionKey(routeConfig, teamId);
    const endCodePreviewText = getRouteCodeAnswerPreview(routeConfig, endCodeKey, missionTotal);
    const endPreviewText = getRouteAnswerPreview(routeConfig, endMissionKey, missionTotal, teamId, teamNumber);
    return `
      <tr data-route-team="${teamId}" class="${warnings.length ? "is-has-issue" : ""}">
        <td>
          <div class="route-team-cell">
            <span class="team-number-badge">${teamNumber}팀</span>
            <div class="route-row-actions">
              <button type="button" class="btn btn-secondary btn--compact route-row-action-btn" data-route-row-rotate-left="${teamId}" title="왼쪽 회전">L</button>
              <button type="button" class="btn btn-secondary btn--compact route-row-action-btn" data-route-row-rotate-right="${teamId}" title="오른쪽 회전">R</button>
              <button type="button" class="btn btn-secondary btn--compact route-row-action-btn" data-route-row-copy="${teamId}" title="행 복사">C</button>
              <button type="button" class="btn btn-secondary btn--compact route-row-action-btn" data-route-row-paste="${teamId}" title="행 붙여넣기">V</button>
              <button type="button" class="btn btn-secondary btn--compact route-row-action-btn" data-route-row-clear="${teamId}" title="행 비우기">X</button>
            </div>
            <button type="button" class="mission-config-btn route-team-edit-btn" data-team-id="${teamId}">수정</button>
          </div>
        </td>
        <td>
          <input
            class="route-team-password-input"
            data-team-id="${teamId}"
            value="${sanitize(password || "")}"
            placeholder="예) ${getDefaultTeamPassword(teamNumber)}"
          />
        </td>
        <td>
          <div class="route-matrix-stack">
            <input class="route-edge-code-input" data-team-id="${teamId}" data-edge-position="start" value="${startCodeKey}" maxlength="8" list="routeCodeKeyOptions" title="코드 단계 C1 · 코드 정답 예시 ${sanitize(startCodePreviewText)}" placeholder="C1" />
            <input class="route-edge-mission-input" data-team-id="${teamId}" data-edge-position="start" value="${startMissionKey}" maxlength="8" list="routeKeyOptions" title="미션 정답 예시 ${sanitize(startPreviewText)}" placeholder="S" />
          </div>
          <div class="route-matrix-preview"><span>C ${startCodePreviewText}</span><span>M ${startPreviewText}</span></div>
        </td>
        ${Array.from({ length: middleCount }, (_, routeIndex) => {
          const key = String(route[routeIndex] || "").trim().toUpperCase();
          const missionNumber = routeIndex + 2;
          const codeKey = String(routeConfig.codeRoutes?.[teamId]?.[routeIndex] || getDefaultCodeKeyForMissionNumber(missionNumber)).trim().toUpperCase();
          const codePreviewText = getRouteCodeAnswerPreview(routeConfig, codeKey, missionNumber);
          const previewText = getRouteAnswerPreview(routeConfig, key, routeIndex + 2, teamId, teamNumber);
          return `
            <td>
              <div class="route-matrix-stack">
                <input class="route-code-matrix-input" data-team-id="${teamId}" data-route-index="${routeIndex}" value="${codeKey}" maxlength="8" list="routeCodeKeyOptions" title="코드 단계 C${missionNumber} · 코드 정답 예시 ${sanitize(codePreviewText)}" placeholder="C${missionNumber}" />
                <input class="route-matrix-input ${activeRoutePreview.teamId === teamId && activeRoutePreview.routeIndex === routeIndex ? "is-active" : ""}" data-team-id="${teamId}" data-route-index="${routeIndex}" value="${key}" maxlength="8" list="routeKeyOptions" title="미션 정답 예시 ${sanitize(previewText)}" />
              </div>
              <div class="route-matrix-preview"><span>C ${codePreviewText}</span><span>M ${previewText}</span></div>
            </td>
          `;
        }).join("")}
        <td>
          <div class="route-matrix-stack">
            <input class="route-edge-code-input" data-team-id="${teamId}" data-edge-position="end" value="${endCodeKey}" maxlength="8" list="routeCodeKeyOptions" title="코드 단계 C${missionTotal} · 코드 정답 예시 ${sanitize(endCodePreviewText)}" placeholder="C${getDefaultCodeKeyForMissionNumber(missionTotal)}" />
            <input class="route-edge-mission-input" data-team-id="${teamId}" data-edge-position="end" value="${endMissionKey}" maxlength="8" list="routeKeyOptions" title="미션 정답 예시 ${sanitize(endPreviewText)}" placeholder="L" />
          </div>
          <div class="route-matrix-preview"><span>C ${endCodePreviewText}</span><span>M ${endPreviewText}</span></div>
        </td>
        <td class="route-assignment-warning ${warnings.length ? "" : "is-ok"}">${warningBadges}</td>
      </tr>
    `;
  }).join("");
  if (elements.routeMatrixMeta) {
    const warningTeams = Array.from(warningsByTeam.values()).filter((warnings) => warnings.length > 0).length;
    const modeSuffix = isRainModeEnabled() ? " · 우천시 값 표시 중" : "";
    const modeLabel = "중간 코드/미션 키";
    const usageText = "각 단계 셀의 위칸은 코드키, 아래칸은 미션키입니다. 예: 2-1 / A-1";
    elements.routeMatrixMeta.textContent = warningTeams
      ? `${modeLabel} ${routeConfig.missionKeys.join(", ")} · 현재 ${warningTeams}팀에 비밀번호/배치 검토 경고가 있습니다.${modeSuffix}`
      : `${modeLabel} ${routeConfig.missionKeys.join(", ")} · ${usageText}${modeSuffix}`;
  }
  renderRoutePreview();
  renderRouteSummary(routeConfig);
  renderRouteStaffSheet(routeConfig);
  attachMissionButtons();
}

function renderRouteSummary(routeConfig) {
  if (elements.routeSummaryPanel?.hidden) return;
  if (!elements.routeSummaryList || !elements.routeSummaryBadge) return;
  const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
  const summaries = Array.from({ length: teamCount }, (_, index) => {
    const teamNumber = index + 1;
    const teamId = `Team${teamNumber}`;
    const middleRoute = (routeConfig.routes?.[teamId] || []).map((key, routeIndex) => {
      const missionNumber = routeIndex + 2;
      const missionLabel = getRouteDisplayLabel(routeConfig, key, missionNumber);
      const codeKey = String(routeConfig.codeRoutes?.[teamId]?.[routeIndex] || getDefaultCodeKeyForMissionNumber(missionNumber)).trim().toUpperCase();
      return `${codeKey}/${missionLabel}`;
    });
    const startCodeKey = getRouteStartCodeKey(routeConfig, teamId);
    const startMissionKey = getRouteStartMissionKey(routeConfig, teamId);
    const endCodeKey = getRouteEndCodeKey(routeConfig, teamId);
    const endMissionKey = getRouteEndMissionKey(routeConfig, teamId);
    const fullRoute = [
      `${startCodeKey}/${getRouteDisplayLabel(routeConfig, startMissionKey, 1)}`,
      ...middleRoute,
      `${endCodeKey}/${getRouteDisplayLabel(routeConfig, endMissionKey, missionTotal)}`,
    ];
    const hasGaps = middleRoute.some((value) => value === "-");
    return {
      teamId,
      teamNumber,
      hasGaps,
      text: fullRoute.join(" → "),
    };
  });
  const gapCount = summaries.filter((item) => item.hasGaps).length;
  elements.routeSummaryBadge.dataset.state = gapCount ? "warn" : "ready";
  elements.routeSummaryBadge.textContent = gapCount ? `${gapCount}팀 미완성` : "전체 요약 준비";
  elements.routeSummaryList.innerHTML = summaries.map((item) => `
    <div class="route-summary-item ${item.hasGaps ? "is-incomplete" : ""}">
      <span class="route-summary-item__team">${item.teamNumber}팀</span>
      <span class="route-summary-item__path">${item.text}</span>
    </div>
  `).join("");
  if (!elements.routeAssignmentPanel?.hidden) {
    renderRouteAssignmentReport(routeConfig, gapCount);
  }
}

function renderRouteAssignmentReport(routeConfig, gapCount = 0) {
  if (!elements.routeAssignmentHead || !elements.routeAssignmentBody || !elements.routeAssignmentBadge) return;
  const sanitize = (value = "") => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
  const middleCount = Math.max(1, missionTotal - 2);
  const warningsByTeam = buildRouteValidationMap(routeConfig);
  const routeHeaders = routeConfig.missionKeys?.length
    ? routeConfig.missionKeys.slice(0, middleCount)
    : Array.from({ length: middleCount }, (_, index) => `${index + 1}타임`);

  elements.routeAssignmentHead.innerHTML = `
    <tr>
      <th>팀</th>
      <th>팀ID</th>
      <th>팀 비밀번호</th>
      <th>S</th>
      ${routeHeaders.map((label) => `<th>${sanitize(label)}</th>`).join("")}
      <th>L</th>
      <th>검증</th>
    </tr>
  `;

  const rows = [];
  for (let teamNumber = 1; teamNumber <= teamCount; teamNumber += 1) {
    const teamId = `Team${teamNumber}`;
    const route = routeConfig.routes?.[teamId] || [];
    const warnings = warningsByTeam.get(teamId) || [];
    const warningBadges = warnings.length
      ? warnings
          .map((warning) => `<span class="route-warning-badge" title="${sanitize(toRouteWarningLabel(warning))}">${sanitize(toRouteWarningShortCode(warning))}</span>`)
          .join("")
      : '<span class="route-warning-badge route-warning-badge--ok" title="정상">OK</span>';
    rows.push(`
      <tr>
        <td><span class="team-number-badge">${teamNumber}팀</span></td>
        <td class="route-assignment-cell">${sanitize(teamId)}</td>
        <td class="route-assignment-cell">${sanitize(getTeamPasswordByTeamId(teamId) || "-")}</td>
        <td class="route-assignment-cell">START</td>
        ${Array.from({ length: middleCount }, (_, routeIndex) => (
          `<td class="route-assignment-cell">${sanitize(String(route[routeIndex] || "-").trim().toUpperCase() || "-")}</td>`
        )).join("")}
        <td class="route-assignment-cell">LAST</td>
        <td class="route-assignment-warning ${warnings.length ? "" : "is-ok"}">${warningBadges}</td>
      </tr>
    `);
  }
  elements.routeAssignmentBody.innerHTML = rows.join("");

  const warningTeams = Array.from(warningsByTeam.values()).filter((warnings) => warnings.length > 0).length;
  const unresolvedTeams = Math.max(gapCount, warningTeams);
  elements.routeAssignmentBadge.dataset.state = unresolvedTeams ? "warn" : "ready";
  elements.routeAssignmentBadge.textContent = unresolvedTeams ? `${unresolvedTeams}팀 검토 필요` : `${teamCount}팀 정상`;
  if (elements.routeAssignmentMeta) {
    elements.routeAssignmentMeta.textContent = unresolvedTeams
      ? `세로 팀 기준 리포트입니다. 팀 비밀번호/배치 키를 한 번에 확인하세요. 현재 ${unresolvedTeams}팀에 경고가 있습니다.`
      : "세로 팀 기준 리포트입니다. 팀 비밀번호/배치 키를 한 번에 확인하세요.";
  }
}

function renderRouteStaffSheet(routeConfig) {
  if (!elements.routeStaffSheetHead || !elements.routeStaffSheetBody || !elements.routeStaffSheetBadge) return;
  const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
  const middleCount = Math.max(1, missionTotal - 2);
  const routeHeaders = routeConfig.missionKeys?.length
    ? routeConfig.missionKeys.slice(0, middleCount)
    : Array.from({ length: middleCount }, (_, index) => `${index + 1}타임`);
  const warningsByTeam = buildRouteValidationMap(routeConfig);
  elements.routeStaffSheetHead.innerHTML = `
    <tr>
      <th>팀</th>
      <th>비밀번호</th>
      <th>S</th>
      ${routeHeaders.map((label) => `<th>${label}</th>`).join("")}
      <th>L</th>
    </tr>
  `;
  const rows = [];
  for (let teamNumber = 1; teamNumber <= teamCount; teamNumber += 1) {
    const teamId = `Team${teamNumber}`;
    const startCell = buildAppliedRouteStaffCell(teamId, 1, routeConfig);
    const lastCell = buildAppliedRouteStaffCell(teamId, missionTotal, routeConfig);
    const hasIssue = (warningsByTeam.get(teamId) || []).length > 0;
    rows.push(`
      <tr class="${hasIssue ? "is-has-issue" : ""}">
        <td><span class="team-number-badge">${teamNumber}팀</span></td>
        <td class="route-assignment-cell">${getTeamPasswordByTeamId(teamId) || "-"}</td>
        <td class="route-staff-cell">
          <strong>${startCell.key}</strong>
          <span>정답 ${startCell.answer}</span>
        </td>
        ${Array.from({ length: middleCount }, (_, routeIndex) => {
          const missionNumber = routeIndex + 2;
          const cell = buildAppliedRouteStaffCell(teamId, missionNumber, routeConfig);
          return `
            <td class="route-staff-cell">
              <strong>${cell.key}</strong>
              <span>정답 ${cell.answer}</span>
            </td>
          `;
        }).join("")}
        <td class="route-staff-cell">
          <strong>${lastCell.key}</strong>
          <span>정답 ${lastCell.answer}</span>
        </td>
      </tr>
    `);
  }
  elements.routeStaffSheetBody.innerHTML = rows.join("");
  const issueCount = Array.from(warningsByTeam.values()).filter((warnings) => warnings.length > 0).length;
  elements.routeStaffSheetBadge.dataset.state = issueCount ? "warn" : "ready";
  elements.routeStaffSheetBadge.textContent = issueCount ? `${issueCount}팀 확인` : `${teamCount}팀 준비`;
  if (elements.routeStaffSheetMeta) {
    elements.routeStaffSheetMeta.textContent = issueCount
      ? `진행팀이 바로 보는 최종 순서표입니다. 현재 ${issueCount}팀에 배치 경고가 있어 검토가 필요합니다.`
      : "진행팀이 바로 보는 최종 순서표입니다. 팀 비밀번호와 최종 순서를 함께 확인할 수 있습니다.";
  }
}

function renderRouteStaffCompact(routeConfig) {
  if (!elements.routeStaffCompactList || !elements.routeStaffCompactBadge) return;
  const sanitize = (value = "") => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
  const middleCount = Math.max(1, missionTotal - 2);
  const warningsByTeam = buildRouteValidationMap(routeConfig);
  const rows = [];
  let issueCount = 0;
  for (let teamNumber = 1; teamNumber <= teamCount; teamNumber += 1) {
    const teamId = `Team${teamNumber}`;
    const warnings = warningsByTeam.get(teamId) || [];
    if (warnings.length) issueCount += 1;
    const path = Array.from({ length: middleCount }, (_, routeIndex) => {
      const missionNumber = routeIndex + 2;
      const codeKey = String(routeConfig.codeRoutes?.[teamId]?.[routeIndex] || getDefaultCodeKeyForMissionNumber(missionNumber)).trim().toUpperCase();
      const missionKey = String(routeConfig.routes?.[teamId]?.[routeIndex] || "").trim().toUpperCase() || "-";
      return `${codeKey}/${missionKey}`;
    }).join(" -> ");
    rows.push(`
      <div class="route-staff-compact-item ${warnings.length ? "is-has-issue" : ""}">
        <div class="route-staff-compact-top">
          <strong>${teamNumber}팀</strong>
          <span>비밀번호 ${sanitize(getTeamPasswordByTeamId(teamId) || "-")}</span>
        </div>
        <div class="route-staff-compact-path">S -> ${sanitize(path)} -> L</div>
      </div>
    `);
  }
  elements.routeStaffCompactList.innerHTML = rows.length
    ? rows.join("")
    : `<div class="route-preview__empty">아직 팀표가 없습니다.</div>`;
  elements.routeStaffCompactBadge.dataset.state = issueCount ? "warn" : "ready";
  elements.routeStaffCompactBadge.textContent = issueCount ? `${issueCount}팀 확인` : `${teamCount}팀 요약`;
  if (elements.routeStaffCompactMeta) {
    elements.routeStaffCompactMeta.textContent = issueCount
      ? `S -> 코드키/미션키 -> L 순서의 한 줄 요약입니다. 현재 ${issueCount}팀에 배치 경고가 있습니다.`
      : "S -> 코드키/미션키 -> L 순서의 한 줄 요약입니다.";
  }
}

function renderRouteLegend(routeConfig) {
  if (!elements.routeCodeLegendList || !elements.routeMissionLegendList || !elements.routeLegendBadge) return;
  const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
  const middleCount = Math.max(1, missionTotal - 2);
  const codeKeys = new Set();
  const missionKeys = new Set();
  for (let teamNumber = 1; teamNumber <= teamCount; teamNumber += 1) {
    const teamId = `Team${teamNumber}`;
    for (let routeIndex = 0; routeIndex < middleCount; routeIndex += 1) {
      const missionNumber = routeIndex + 2;
      const codeKey = String(routeConfig.codeRoutes?.[teamId]?.[routeIndex] || getDefaultCodeKeyForMissionNumber(missionNumber)).trim().toUpperCase();
      const missionKey = String(routeConfig.routes?.[teamId]?.[routeIndex] || "").trim().toUpperCase();
      if (codeKey) codeKeys.add(codeKey);
      if (missionKey) missionKeys.add(missionKey);
    }
  }
  const sortedCodeKeys = Array.from(codeKeys).sort((a, b) => a.localeCompare(b, "ko"));
  const sortedMissionKeys = Array.from(missionKeys).sort((a, b) => a.localeCompare(b, "ko"));

  elements.routeCodeLegendList.innerHTML = sortedCodeKeys.length
    ? sortedCodeKeys.map((codeKey) => {
      const baseKey = extractCodeVariantBase(codeKey);
      const codeEntry = getRouteCodeEntry(routeConfig, codeKey, Number(baseKey) || 1);
      return `<div class="route-legend-item"><strong>${codeKey}</strong><span>${codeEntry.displayName || "-"}</span></div>`;
    }).join("")
    : `<div class="route-preview__empty">사용 중인 코드키가 없습니다.</div>`;

  elements.routeMissionLegendList.innerHTML = sortedMissionKeys.length
    ? sortedMissionKeys.map((missionKey) => {
      const parts = getRouteDisplayParts(routeConfig, missionKey, 2);
      return `<div class="route-legend-item"><strong>${missionKey}</strong><span>${parts.label || "-"}</span></div>`;
    }).join("")
    : `<div class="route-preview__empty">사용 중인 미션키가 없습니다.</div>`;

  const totalKeys = sortedCodeKeys.length + sortedMissionKeys.length;
  elements.routeLegendBadge.dataset.state = totalKeys ? "ready" : "warn";
  elements.routeLegendBadge.textContent = totalKeys ? `${sortedCodeKeys.length}/${sortedMissionKeys.length}` : "대기";
  if (elements.routeLegendMeta) {
    elements.routeLegendMeta.textContent = totalKeys
      ? `코드키 ${sortedCodeKeys.length}개, 미션키 ${sortedMissionKeys.length}개가 현재 팀표에서 사용 중입니다.`
      : "아직 팀표에 입력된 키가 없습니다.";
  }
}

function buildRouteStaffSheetPrintHtml(routeConfig) {
  const title = elements.projectNameInput?.value.trim() || currentProjectId || "SMART Mission Race";
  const tableHtml = `
    <table>
      ${elements.routeStaffSheetHead?.innerHTML ? `<thead>${elements.routeStaffSheetHead.innerHTML}</thead>` : ""}
      ${elements.routeStaffSheetBody?.innerHTML ? `<tbody>${elements.routeStaffSheetBody.innerHTML}</tbody>` : ""}
    </table>
  `;
  return `
    <!doctype html>
    <html lang="ko">
      <head>
        <meta charset="utf-8" />
        <title>${title} 진행팀 최종 팀표</title>
        <style>
          body { font-family: "Pretendard","Noto Sans KR",sans-serif; margin: 24px; color: #0f172a; }
          h1 { margin: 0 0 8px; font-size: 22px; }
          p { margin: 0 0 16px; color: #475569; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          th, td { border: 1px solid #cbd5e1; padding: 8px 6px; vertical-align: top; text-align: center; }
          th { background: #e2e8f0; font-size: 12px; }
          td strong { display: block; font-size: 13px; color: #0f172a; }
          td span { display: block; margin-top: 4px; font-size: 11px; color: #475569; word-break: keep-all; }
        </style>
      </head>
      <body>
        <h1>${title} · 진행팀 최종 팀표</h1>
        <p>팀 비밀번호와 단계별 최종 순서를 한 장으로 정리한 출력표입니다. 각 중간 칸은 <strong>코드키 / 미션키</strong> 순서입니다.</p>
        ${tableHtml}
      </body>
    </html>
  `;
}

function handlePrintRouteStaffSheet() {
  const routeConfig = ensureRouteBuilderConfig();
  renderRouteStaffSheet(routeConfig);
  const popup = window.open("", "_blank", "width=1400,height=900");
  if (!popup) {
    showAdminToast("브라우저 팝업 차단 때문에 인쇄 화면을 열지 못했습니다.", "warn", 3200);
    return;
  }
  popup.document.open();
  popup.document.write(buildRouteStaffSheetPrintHtml(routeConfig));
  popup.document.close();
  popup.focus();
  popup.print();
}

function createRouteTemplateName() {
  const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
  const middleCount = Math.max(1, missionTotal - 2);
  return `${middleCount}미션 ${teamCount}조 패턴`;
}

function serializeRouteTemplate() {
  const routeConfig = ensureRouteBuilderConfig();
  const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
  const middleCount = Math.max(1, missionTotal - 2);
  const routes = {};
  const codeRoutes = {};
  const startRoutes = {};
  const endRoutes = {};
  const startCodeRoutes = {};
  const endCodeRoutes = {};
  for (let teamNumber = 1; teamNumber <= teamCount; teamNumber += 1) {
    const teamId = `Team${teamNumber}`;
    startRoutes[teamId] = getRouteStartMissionKey(routeConfig, teamId);
    endRoutes[teamId] = getRouteEndMissionKey(routeConfig, teamId);
    startCodeRoutes[teamId] = getRouteStartCodeKey(routeConfig, teamId);
    endCodeRoutes[teamId] = getRouteEndCodeKey(routeConfig, teamId);
    routes[teamId] = Array.from({ length: middleCount }, (_, index) => String(routeConfig.routes?.[teamId]?.[index] || "").trim().toUpperCase());
    codeRoutes[teamId] = Array.from({ length: middleCount }, (_, index) => String(routeConfig.codeRoutes?.[teamId]?.[index] || getDefaultCodeKeyForMissionNumber(index + 2)).trim().toUpperCase());
  }
  const missionLibraryKeys = buildMissionLibraryKeys(routeConfig);
  const missionLibrary = {};
  missionLibraryKeys.forEach((key) => {
    if (routeConfig.missionLibrary?.[key]) {
      missionLibrary[key] = JSON.parse(JSON.stringify(routeConfig.missionLibrary[key]));
    }
  });
  const codeLibrary = {};
  for (let missionNumber = 1; missionNumber <= missionTotal; missionNumber += 1) {
    codeLibrary[missionNumber] = JSON.parse(JSON.stringify(routeConfig.codeLibrary?.[missionNumber] || createDefaultRouteCodeEntry(missionNumber)));
  }
  const codeVariants = {};
  for (let missionNumber = 1; missionNumber <= missionTotal; missionNumber += 1) {
    if (routeConfig.codeVariants?.[missionNumber] && Object.keys(routeConfig.codeVariants[missionNumber]).length) {
      codeVariants[missionNumber] = JSON.parse(JSON.stringify(routeConfig.codeVariants[missionNumber]));
    }
  }
  return {
    id: `tpl_${Date.now()}`,
    name: elements.routeTemplateNameInput?.value.trim() || createRouteTemplateName(),
    teamCount,
    missionTotal,
    mode: routeConfig.mode || "academy",
    missionKeys: [...routeConfig.missionKeys],
    codeLibrary,
    codeVariants,
    missionLibrary,
    startRoutes,
    endRoutes,
    routes,
    startCodeRoutes,
    endCodeRoutes,
    codeRoutes,
    savedAt: Date.now(),
  };
}

function handleSaveRouteTemplate() {
  const template = serializeRouteTemplate();
  const existingIndex = routeTemplates.findIndex((item) => item.name === template.name);
  if (existingIndex >= 0) {
    routeTemplates[existingIndex] = { ...routeTemplates[existingIndex], ...template, id: routeTemplates[existingIndex].id };
  } else {
    routeTemplates.unshift(template);
  }
  routeTemplates = routeTemplates.slice(0, 20);
  persistRouteTemplates();
  renderRouteTemplates();
  if (elements.routeTemplateSelect) {
    elements.routeTemplateSelect.value = existingIndex >= 0 ? routeTemplates[existingIndex].id : template.id;
  }
  showAdminToast(`배치 패턴을 저장했습니다: ${template.name}`, "success", 2800);
}

function findSelectedRouteTemplate() {
  const selectedId = elements.routeTemplateSelect?.value || "";
  return routeTemplates.find((item) => item.id === selectedId) || null;
}

function handleLoadRouteTemplate() {
  const template = findSelectedRouteTemplate();
  if (!template) {
    showAdminToast("불러올 패턴을 먼저 선택하세요.", "warn", 2600);
    return;
  }
  missionTotal = Math.max(1, Number(template.missionTotal) || missionTotal);
  if (elements.missionCountInput) elements.missionCountInput.value = missionTotal;
  const teamCount = Math.max(1, Math.min(30, Number(template.teamCount) || defaultTeamCount));
  if (elements.teamCountInput) elements.teamCountInput.value = teamCount;
  renderTeamRows(teamCount);
  routeBuilderConfig = normalizeRouteBuilderConfig({
    ...createDefaultRouteBuilderConfig(),
    mode: template.mode === "outdoor" ? "outdoor" : "academy",
    missionKeys: Array.isArray(template.missionKeys) ? template.missionKeys : buildDefaultRouteKeys(Math.max(1, missionTotal - 2)),
    codeLibrary: template.codeLibrary || {},
    codeVariants: template.codeVariants || {},
    missionLibrary: template.missionLibrary || {},
    startRoutes: template.startRoutes || {},
    endRoutes: template.endRoutes || {},
    routes: template.routes || {},
    startCodeRoutes: template.startCodeRoutes || {},
    endCodeRoutes: template.endCodeRoutes || {},
    codeRoutes: template.codeRoutes || {},
  });
  if (elements.routeModeInput) {
    elements.routeModeInput.value = routeBuilderConfig.mode === "outdoor" ? "outdoor" : "academy";
  }
  if (elements.routeTemplateNameInput) {
    elements.routeTemplateNameInput.value = template.name;
  }
  renderRouteBuilder();
  renderMissionOverview();
  renderSetupRoadmap();
  markRouteBuilderDirty();
  showAdminToast(`배치 패턴을 불러왔습니다: ${template.name}`, "success", 2800);
}

function handleDeleteRouteTemplate() {
  const template = findSelectedRouteTemplate();
  if (!template) {
    showAdminToast("삭제할 패턴을 먼저 선택하세요.", "warn", 2600);
    return;
  }
  routeTemplates = routeTemplates.filter((item) => item.id !== template.id);
  persistRouteTemplates();
  renderRouteTemplates();
  if (elements.routeTemplateNameInput?.value.trim() === template.name) {
    elements.routeTemplateNameInput.value = "";
  }
  showAdminToast(`배치 패턴을 삭제했습니다: ${template.name}`, "success", 2600);
}

function renderRoutePreview() {
  if (elements.routePreviewPanel?.hidden) return;
  if (!elements.routePreview || !elements.routePreviewBadge) return;
  const routeConfig = ensureRouteBuilderConfig();
  const teamId = activeRoutePreview.teamId;
  const routeIndex = activeRoutePreview.routeIndex;
  if (!teamId || routeIndex < 0) {
    elements.routePreviewBadge.dataset.state = "warn";
    elements.routePreviewBadge.textContent = "대기";
    elements.routePreview.innerHTML = `<div class="route-preview__empty">팀 배치표 셀을 선택하면 연결된 공통 미션과 실제 정답이 표시됩니다.</div>`;
    return;
  }
  const teamNumber = Number(teamId.replace("Team", "")) || 0;
  const key = String(routeConfig.routes?.[teamId]?.[routeIndex] || "").trim().toUpperCase();
  if (!key) {
    elements.routePreviewBadge.dataset.state = "warn";
    elements.routePreviewBadge.textContent = `${formatMissionTeamLabel(teamId)} · ${routeIndex + 2}타임`;
    elements.routePreview.innerHTML = `<div class="route-preview__empty">이 칸은 아직 비어 있습니다. 공통 미션 키를 입력하거나 붙여넣기 하세요.</div>`;
    return;
  }
  const missionNumber = routeIndex + 2;
  const codeKey = resolveRouteCodeKey(teamId, missionNumber);
  const codeEntry = getRouteCodeEntry(routeConfig, codeKey, missionNumber);
  const isOutdoorMiddleStep = isOutdoorRouteMode(routeConfig) && missionNumber > 1 && missionNumber < missionTotal;
  const outdoorEntry = isOutdoorMiddleStep
    ? (
      routeConfig.outdoorAssets?.[missionNumber]?.[key]
      || routeConfig.outdoorAssets?.[String(missionNumber)]?.[key]
      || null
    )
    : null;
  const entry = isOutdoorMiddleStep
    ? (outdoorEntry || getEffectiveRouteMissionEntry(routeConfig.missionLibrary?.[key] || null, key))
    : getEffectiveRouteMissionEntry(routeConfig.missionLibrary?.[key] || null, key);
  if (!entry) {
    elements.routePreviewBadge.dataset.state = "risk";
    elements.routePreviewBadge.textContent = "오류";
    elements.routePreview.innerHTML = `<div class="route-preview__empty">정의되지 않은 미션 키입니다. ${isOutdoorMiddleStep ? "야외 단계 자산 라이브러리" : "공통 미션 라이브러리"}와 배치표를 확인하세요.</div>`;
    return;
  }
  const answer = getRouteAnswerPreview(routeConfig, key, missionNumber, teamId, teamNumber);
  const labelParts = getRouteDisplayParts(routeConfig, key, missionNumber);
  const label = String(labelParts.label || key).trim();
  const imageUrl = String(
    isOutdoorMiddleStep
      ? (entry.missionImageUrl || entry.codeImageUrl || "")
      : (entry.imageUrl || "")
  ).trim();
  const mode = isOutdoorMiddleStep
    ? (entry.missionMode || STEP_MODES.ANSWER)
    : (entry.mode || STEP_MODES.ANSWER);
  const photoSlots = isOutdoorMiddleStep
    ? (Array.isArray(entry.photoPlan) ? entry.photoPlan.length : (Number(entry.photoSlots) || 0))
    : (Number(entry.photoSlots) || 0);
  const specialSlots = isOutdoorMiddleStep
    ? 0
    : (Number(entry.specialSlots) || 0);
  elements.routePreviewBadge.dataset.state = "ready";
  elements.routePreviewBadge.textContent = `${formatMissionTeamLabel(teamId)} · ${missionNumber}타임`;
  elements.routePreview.innerHTML = `
    <div class="route-preview__grid">
      <div class="route-preview__media ${imageUrl ? "" : "is-empty"}">
        ${imageUrl ? `<img src="${imageUrl}" alt="${key}" />` : `<span>이미지 없음</span>`}
      </div>
      <div class="route-preview__info">
        <div class="route-preview__key">${key}${label && label !== key ? ` · ${label}` : ""}</div>
        <div class="route-preview__meta">${formatMissionTeamLabel(teamId)} · ${missionNumber}타임 · 코드 ${codeKey}(${codeEntry.answer || "-"}) · 미션 정답 ${answer || "-"}</div>
        <div class="route-preview__meta">방식 ${describeStepMode(mode)} · 사진 ${photoSlots} · 추가 슬롯 ${specialSlots}${isRainModeEnabled() ? " · 우천 적용" : ""}</div>
      </div>
    </div>
  `;
}

function openMissionModal(teamId = null) {
  setActiveAdminTab("missions");
  const persistedTeamId = getPersistedMissionTeam();
  const candidateTeamId = teamId || persistedTeamId;
  const targetTeamId =
    (candidateTeamId && teamProfiles[candidateTeamId] ? candidateTeamId : "") || Object.keys(teamProfiles).find(Boolean) || "Team1";
  activeMissionTeam = targetTeamId;
  rebuildMissionConfigFromCurrentRoute(targetTeamId);
  persistMissionViewState();
  const teamNumber = Number(targetTeamId.replace("Team", "")) || 0;
  const routeConfig = ensureRouteBuilderConfig();
  if (elements.missionModalTitle) {
    elements.missionModalTitle.textContent = `문제 입력 (${teamNumber ? `${teamNumber}팀` : targetTeamId})`;
  }
  if (elements.missionModalSubtitle) {
    elements.missionModalSubtitle.textContent = `공통 배치표 기준 경로: ${(routeConfig.routes?.[targetTeamId] || []).join(" → ") || "-"} · 이 창의 저장값이 팀 최종 화면에 그대로 반영됩니다.`;
  }
  activeMissionRow = "1";
  renderMissionJumpbar();
  updateMissionTeamNav(targetTeamId);
  renderMissionModalRows(targetTeamId);
  applyMissionModalDensity();
  renderMissionOverview();
  syncActionAvailability();
  elements.missionModal?.classList.add("active");
  if (elements.missionModal) elements.missionModal.hidden = false;
}

function closeMissionModal() {
  if (elements.missionModal) {
    elements.missionModal.classList.remove("active");
    elements.missionModal.hidden = true;
  }
  renderMissionOverview();
  syncActionAvailability();
}

function renderMissionModalRows(teamId) {
  if (!elements.missionModalBody) return;
  const config = ensureMissionConfig(teamId);
  const rows = [];
  for (let i = 1; i <= missionTotal; i++) {
    const mission = resolveRenderedMissionEntry(teamId, i, config[i] || {});
    const codeStep = getStepConfig(mission, "codeStep");
    const missionStep = getStepConfig(mission, "missionStep");
    const photoConfig = getPhotoConfigFromMission(mission);
    const routeKey = resolveRouteMissionKey(teamId, i);
    const teamNumber = Number(teamId.replace("Team", "")) || 0;
    const routeConfig = ensureRouteBuilderConfig();
    const appliedCodeKey = String(mission.codeKey || resolveRouteCodeKey(teamId, i) || i).trim().toUpperCase();
    const appliedMissionKey = normalizeMissionRouteToken(mission.routeKey || routeKey || "");
    const missionLibraryEntry = getEffectiveRouteMissionEntry(
      routeConfig.missionLibrary?.[appliedMissionKey] || createDefaultRouteMissionEntry(appliedMissionKey),
      appliedMissionKey,
    );
    const routePreview = renderAnswerTemplate(missionLibraryEntry.answerTemplate, {
      teamId,
      teamNumber,
      key: appliedMissionKey,
      missionNumber: i,
    });
    const hasOverride = isMissionOverride(teamId, i, mission);
    rows.push(`
      <tr data-mission="${i}">
        <td class="mission-index-cell"><span class="mission-index-badge">M${i}</span></td>
        <td>
          <div class="mission-step-card">
            <div class="mission-step-origin">
              <span class="mission-step-origin__badge">공통 코드 C${appliedCodeKey}</span>
              <span class="mission-step-origin__text">${hasOverride ? "예외 수정됨" : "기본 공통값을 따릅니다."}</span>
              <button type="button" class="btn btn-secondary btn--compact mission-import-default" data-mission-number="${i}" data-import-type="code">코드 공통 불러오기</button>
            </div>
            <div class="mission-step-top">
              <label class="mission-inline-field">
                <span>방식</span>
                <select class="mission-code-mode">
                  ${buildStepModeOptions(codeStep.mode, true)}
                </select>
              </label>
              <label class="mission-inline-field mission-inline-field--seconds">
                <span>대기(분)</span>
                <input class="mission-code-delay" type="number" min="0" max="60" value="${secondsToDelayMinutes(codeStep.autoAdvanceSeconds || 0)}" placeholder="0" />
              </label>
              <label class="mission-inline-check">
                <input class="mission-code-bypass" type="checkbox" ${codeStep.allowBypass !== false ? "checked" : ""} />
                <span>특별</span>
              </label>
            </div>
            <div class="mission-step-bottom">
              <label class="mission-step-answer-field mission-step-answer-field--inline ${needsAnswerField(codeStep.mode) ? "" : "is-disabled"}">
                <span>${getAnswerLabel(codeStep.mode, "code")}</span>
                <input class="mission-code" value="${codeStep.answer || ""}" placeholder="${getAnswerPlaceholder(codeStep.mode, "code")}" ${needsAnswerField(codeStep.mode) ? "" : "disabled"} />
              </label>
            </div>
          </div>
        </td>
        <td>
          <div class="mission-step-card">
            <div class="mission-step-origin">
              <span class="mission-step-origin__badge">공통 미션 ${appliedMissionKey}</span>
              <span class="mission-step-origin__text">${hasOverride ? `예외 수정됨 · 기본 정답 ${routePreview || "-"}` : `기본 정답 예시 ${routePreview || "-"}`}</span>
              <button type="button" class="btn btn-secondary btn--compact mission-import-default" data-mission-number="${i}" data-import-type="mission">미션 공통 불러오기</button>
              ${hasOverride ? `<button type="button" class="btn btn-secondary btn--compact mission-restore-default" data-mission-number="${i}">공통값 복원</button>` : ""}
            </div>
            <div class="mission-step-top">
              <label class="mission-inline-field">
                <span>방식</span>
                <select class="mission-mission-mode">
                  ${buildStepModeOptions(missionStep.mode, true)}
                </select>
              </label>
              <label class="mission-inline-field mission-inline-field--seconds">
                <span>대기(분)</span>
                <input class="mission-mission-delay" type="number" min="0" max="60" value="${secondsToDelayMinutes(missionStep.autoAdvanceSeconds || 0)}" placeholder="0" />
              </label>
              <label class="mission-inline-check">
                <input class="mission-mission-bypass" type="checkbox" ${missionStep.allowBypass !== false ? "checked" : ""} />
                <span>특별</span>
              </label>
            </div>
            <div class="mission-step-bottom">
              <label class="mission-step-answer-field mission-step-answer-field--inline ${needsAnswerField(missionStep.mode) ? "" : "is-disabled"}">
                <span>${getAnswerLabel(missionStep.mode, "mission")}</span>
                <input class="mission-answer" value="${missionStep.answer || ""}" placeholder="${getAnswerPlaceholder(missionStep.mode, "mission")}" ${needsAnswerField(missionStep.mode) ? "" : "disabled"} />
              </label>
              <div class="mission-slot-config ${usesPhotoStep(mission) ? "" : "is-disabled"}">
                <label class="mission-slot-field">
                  <span>사진</span>
                  <input class="mission-photo-slots" type="number" min="0" max="10" value="${photoConfig.photoSlots || 0}" placeholder="0" ${usesPhotoStep(mission) ? "" : "disabled"} />
                </label>
                <label class="mission-slot-field mission-slot-field--special ${photoConfig.specialSlots > 0 ? "is-visible" : ""}">
                  <span>추가 슬롯</span>
                  <input class="mission-special-slots" type="number" min="0" max="10" value="${photoConfig.specialSlots || 0}" placeholder="0" title="기본 사진 외에 추가로 받아야 하는 슬롯 수" ${usesPhotoStep(mission) ? "" : "disabled"} />
                </label>
                <button type="button" class="mission-slot-toggle ${photoConfig.specialSlots > 0 ? "is-active" : ""}" ${usesPhotoStep(mission) ? "" : "disabled"}>
                  ${photoConfig.specialSlots > 0 ? "추가 슬롯 ON" : "추가 슬롯"}
                </button>
              </div>
            </div>
          </div>
        </td>
        <td>
          <div class="mission-cell-stack mission-cell-stack--media">
            <div class="mission-upload-row">
              <label class="file-pill">
                업로드
                <input type="file" class="mission-code-file" data-type="code" accept="image/*" hidden />
              </label>
              <span class="mission-upload-status code-status ${mission.codeImageUrl ? "is-done" : "is-empty"}">${mission.codeImageUrl ? "완료" : "미입력"}</span>
            </div>
            <div class="mission-thumb mission-thumb-dropzone" data-mission-number="${i}" data-upload-type="code" title="이미지를 끌어다 놓거나 클릭해 업로드">
              ${mission.codeImageUrl ? `<img src="${mission.codeImageUrl}" alt="CODE ${i}" />` : `<span class="mission-thumb__empty">CODE</span>`}
            </div>
          </div>
        </td>
        <td>
          <div class="mission-cell-stack mission-cell-stack--media">
            <div class="mission-upload-row">
              <label class="file-pill">
                업로드
                <input type="file" class="mission-answer-file" data-type="mission" accept="image/*" hidden />
              </label>
              <span class="mission-upload-status mission-status ${mission.missionImageUrl ? "is-done" : "is-empty"}">${mission.missionImageUrl ? "완료" : "미입력"}</span>
            </div>
            <div class="mission-thumb mission-thumb-dropzone" data-mission-number="${i}" data-upload-type="mission" title="이미지를 끌어다 놓거나 클릭해 업로드">
              ${mission.missionImageUrl ? `<img src="${mission.missionImageUrl}" alt="MISSION ${i}" />` : `<span class="mission-thumb__empty">MISSION</span>`}
            </div>
          </div>
        </td>
      </tr>
    `);
  }
  elements.missionModalBody.innerHTML = rows.join("");
  bindInlineImageDropzones(elements.missionModalBody, (file, zone) => handleMissionAssetDrop(file, zone, teamId));
  attachMissionModalHandlers(teamId);
  setActiveMissionRow(activeMissionRow);
}

function getMissionModalTeamOrder() {
  const filteredOrder = getMissionOverviewOrder();
  if (filteredOrder.length) return filteredOrder;
  const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
  const order = [];
  for (let i = 1; i <= teamCount; i++) {
    order.push(`Team${i}`);
  }
  return order;
}

function updateMissionTeamNav(teamId) {
  const order = getMissionModalTeamOrder();
  const index = order.indexOf(teamId);
  if (elements.missionModalPrevTeam) {
    elements.missionModalPrevTeam.disabled = index <= 0;
  }
  if (elements.missionModalNextTeam) {
    elements.missionModalNextTeam.disabled = index < 0 || index >= order.length - 1;
  }
  if (elements.missionModalSaveNext) {
    elements.missionModalSaveNext.disabled = index < 0 || index >= order.length - 1;
  }
}

function moveMissionModalTeam(direction = 1) {
  const order = getMissionModalTeamOrder();
  const currentIndex = order.indexOf(activeMissionTeam);
  if (currentIndex < 0) return;
  const nextTeamId = order[currentIndex + direction];
  if (!nextTeamId) return;
  openMissionModal(nextTeamId);
}

function attachMissionModalHandlers(teamId) {
  if (!elements.missionModalBody) return;
  const config = ensureMissionConfig(teamId);
  elements.missionModalBody.querySelectorAll("tr[data-mission]").forEach((row) => {
    row.addEventListener("click", () => setActiveMissionRow(row.dataset.mission));
    row.querySelectorAll("input, select, button").forEach((field) => {
      field.addEventListener("focus", () => setActiveMissionRow(row.dataset.mission));
    });
    const missionNumber = row.dataset.mission;
    const mission = normalizeMissionEntry(config[missionNumber] || {});
    config[missionNumber] = mission;
    const codeInput = row.querySelector(".mission-code");
    const answerInput = row.querySelector(".mission-answer");
    const codeModeSelect = row.querySelector(".mission-code-mode");
    const missionModeSelect = row.querySelector(".mission-mission-mode");
    const codeDelayInput = row.querySelector(".mission-code-delay");
    const missionDelayInput = row.querySelector(".mission-mission-delay");
    const codeBypassInput = row.querySelector(".mission-code-bypass");
    const missionBypassInput = row.querySelector(".mission-mission-bypass");
    const codeAnswerField = row.querySelector(".mission-step-answer-field");
    const missionAnswerField = row.querySelectorAll(".mission-step-answer-field")[1];
    const photoSlotsInput = row.querySelector(".mission-photo-slots");
    const specialSlotsInput = row.querySelector(".mission-special-slots");
    const specialField = row.querySelector(".mission-slot-field--special");
    const specialToggle = row.querySelector(".mission-slot-toggle");
    const slotConfig = row.querySelector(".mission-slot-config");
    const fileInputs = row.querySelectorAll('input[type="file"]');

    codeModeSelect?.addEventListener("change", () => {
      mission.codeStep.mode = codeModeSelect.value;
      if (mission.codeStep.mode === STEP_MODES.PHOTO_HQ && !Number(mission.photoSlots)) {
        mission.photoSlots = 1;
        mission.photoPlan = normalizePhotoPlan(mission.photoPlan, {
          photoSlots: mission.photoSlots,
          specialSlots: mission.specialSlots,
        });
        mission.codeStep.photoSlots = mission.photoSlots;
        mission.codeStep.specialSlots = mission.specialSlots;
        mission.missionStep.photoSlots = 1;
      } else if (mission.codeStep.mode !== STEP_MODES.PHOTO_HQ && mission.missionStep.mode !== STEP_MODES.PHOTO_HQ) {
        mission.photoSlots = 0;
        mission.specialSlots = 0;
        mission.photoPlan = [];
        mission.codeStep.photoSlots = 0;
        mission.codeStep.specialSlots = 0;
        mission.missionStep.photoSlots = 0;
        mission.missionStep.specialSlots = 0;
      }
      syncStepFieldState(codeAnswerField, codeInput, mission.codeStep.mode, "code");
      syncPhotoModeState(slotConfig, photoSlotsInput, specialSlotsInput, specialField, specialToggle, mission);
      markDirty("mission");
    });
    missionModeSelect?.addEventListener("change", () => {
      mission.missionStep.mode = missionModeSelect.value;
      if (mission.missionStep.mode !== STEP_MODES.PHOTO_HQ && mission.codeStep.mode !== STEP_MODES.PHOTO_HQ) {
        mission.photoSlots = 0;
        mission.specialSlots = 0;
        mission.photoPlan = [];
        mission.codeStep.photoSlots = 0;
        mission.codeStep.specialSlots = 0;
        mission.missionStep.photoSlots = 0;
        mission.missionStep.specialSlots = 0;
      } else if (!Number(mission.photoSlots)) {
        mission.photoSlots = 1;
        mission.photoPlan = normalizePhotoPlan(mission.photoPlan, {
          photoSlots: mission.photoSlots,
          specialSlots: mission.specialSlots,
        });
        mission.missionStep.photoSlots = 1;
      }
      syncStepFieldState(missionAnswerField, answerInput, mission.missionStep.mode, "mission");
      syncPhotoModeState(slotConfig, photoSlotsInput, specialSlotsInput, specialField, specialToggle, mission);
      markDirty("mission");
    });
    codeDelayInput?.addEventListener("input", () => {
      mission.codeStep.autoAdvanceSeconds = delayMinutesToSeconds(codeDelayInput.value);
      codeDelayInput.value = secondsToDelayMinutes(mission.codeStep.autoAdvanceSeconds);
      markDirty("mission");
    });
    codeBypassInput?.addEventListener("change", () => {
      mission.codeStep.allowBypass = codeBypassInput.checked;
      markDirty("mission");
    });
    missionDelayInput?.addEventListener("input", () => {
      mission.missionStep.autoAdvanceSeconds = delayMinutesToSeconds(missionDelayInput.value);
      missionDelayInput.value = secondsToDelayMinutes(mission.missionStep.autoAdvanceSeconds);
      markDirty("mission");
    });
    missionBypassInput?.addEventListener("change", () => {
      mission.missionStep.allowBypass = missionBypassInput.checked;
      markDirty("mission");
    });
    codeInput.addEventListener("input", () => {
      mission.codeAnswer = codeInput.value.trim() || "1";
      mission.codeStep.answer = mission.codeAnswer;
      markDirty("mission");
    });
    answerInput.addEventListener("input", () => {
      mission.missionAnswer = answerInput.value.trim() || "1";
      mission.missionStep.answer = mission.missionAnswer;
      markDirty("mission");
    });
    photoSlotsInput.addEventListener("input", () => {
      const nextValue = normalizeSlotCount(photoSlotsInput.value);
      mission.photoSlots = nextValue;
      mission.photoPlan = normalizePhotoPlan(mission.photoPlan, {
        photoSlots: mission.photoSlots,
        specialSlots: mission.specialSlots,
      });
      mission.codeStep.photoSlots = nextValue;
      mission.missionStep.photoSlots = nextValue;
      if (nextValue > 0 && mission.missionStep.mode === STEP_MODES.ANSWER && mission.codeStep.mode !== STEP_MODES.PHOTO_HQ) {
        mission.missionStep.mode = STEP_MODES.PHOTO_HQ;
        if (missionModeSelect) missionModeSelect.value = STEP_MODES.PHOTO_HQ;
        syncStepFieldState(missionAnswerField, answerInput, mission.missionStep.mode, "mission");
      }
      syncPhotoModeState(slotConfig, photoSlotsInput, specialSlotsInput, specialField, specialToggle, mission);
      markDirty("mission");
    });
    specialSlotsInput.addEventListener("input", () => {
      const nextValue = normalizeSlotCount(specialSlotsInput.value);
      mission.specialSlots = nextValue;
      mission.photoPlan = normalizePhotoPlan(mission.photoPlan, {
        photoSlots: mission.photoSlots,
        specialSlots: mission.specialSlots,
      });
      mission.codeStep.specialSlots = nextValue;
      mission.missionStep.specialSlots = nextValue;
      if (nextValue > 0 && mission.missionStep.mode === STEP_MODES.ANSWER && mission.codeStep.mode !== STEP_MODES.PHOTO_HQ) {
        mission.missionStep.mode = STEP_MODES.PHOTO_HQ;
        if (missionModeSelect) missionModeSelect.value = STEP_MODES.PHOTO_HQ;
        syncStepFieldState(missionAnswerField, answerInput, mission.missionStep.mode, "mission");
      }
      syncPhotoModeState(slotConfig, photoSlotsInput, specialSlotsInput, specialField, specialToggle, mission);
      markDirty("mission");
    });
    specialToggle?.addEventListener("click", () => {
      if (!usesPhotoStep(mission)) return;
      const nextValue = Number(mission.specialSlots) > 0 ? 0 : 1;
      mission.specialSlots = nextValue;
      mission.photoPlan = normalizePhotoPlan(mission.photoPlan, {
        photoSlots: mission.photoSlots,
        specialSlots: mission.specialSlots,
      });
      mission.codeStep.specialSlots = nextValue;
      mission.missionStep.specialSlots = nextValue;
      specialSlotsInput.value = nextValue;
      syncPhotoModeState(slotConfig, photoSlotsInput, specialSlotsInput, specialField, specialToggle, mission);
      markDirty("mission");
    });
    syncStepFieldState(codeAnswerField, codeInput, mission.codeStep.mode, "code");
    syncStepFieldState(missionAnswerField, answerInput, mission.missionStep.mode, "mission");
    syncPhotoModeState(slotConfig, photoSlotsInput, specialSlotsInput, specialField, specialToggle, mission);

    fileInputs.forEach((input) => {
      input.addEventListener("change", async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const type = event.target.dataset.type;
        await applyMissionAssetUpload({
          file,
          missionNumber,
          type,
          mission,
          row,
        });
        event.target.value = "";
      });
    });

    row.querySelectorAll(".mission-thumb-dropzone").forEach((thumb) => {
      thumb.addEventListener("click", () => {
        const uploadType = thumb.dataset.uploadType || "code";
        row.querySelector(uploadType === "code" ? ".mission-code-file" : ".mission-answer-file")?.click();
      });
    });

    row.querySelector(".mission-restore-default")?.addEventListener("click", () => {
      const restored = buildMissionConfigFromRoute(teamId, Number(missionNumber));
      config[missionNumber] = restored;
      markDirty("mission");
      renderMissionModalRows(teamId);
      showAdminToast(`M${missionNumber}을 공통값으로 복원했습니다.`, "success", 2200);
    });
    row.querySelectorAll(".mission-import-default").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.importType === "code") {
          const currentCodeKey = `C${resolveRouteCodeKey(teamId, Number(missionNumber))}`;
          const selectedCodeKey = promptLibrarySelection("code", currentCodeKey);
          if (!selectedCodeKey) return;
          const restored = buildMissionConfigFromSelectedCode(teamId, Number(missionNumber), selectedCodeKey);
          copyMissionStepData(mission, restored, "codeStep");
          showAdminToast(`M${missionNumber} 코드 ${selectedCodeKey}를 불러왔습니다.`, "success", 2200);
        } else {
          const currentMissionKey = resolveRouteMissionKey(teamId, Number(missionNumber));
          const selectedMissionKey = promptLibrarySelection("mission", currentMissionKey);
          if (!selectedMissionKey) return;
          const restored = buildMissionConfigFromSelectedMission(teamId, Number(missionNumber), selectedMissionKey);
          copyMissionStepData(mission, restored, "missionStep");
          showAdminToast(`M${missionNumber} 미션 ${selectedMissionKey}를 불러왔습니다.`, "success", 2200);
        }
        markDirty("mission");
        renderMissionModalRows(teamId);
      });
    });
  });
}

async function applyMissionAssetUpload({ file, missionNumber, type = "mission", mission, row }) {
  if (!file || !mission || !row) return;
  const statusEl = row.querySelector(type === "code" ? ".code-status" : ".mission-status");
  const thumbEl = row.querySelectorAll(".mission-thumb")[type === "code" ? 0 : 1];
  if (statusEl) statusEl.textContent = "업로드 중...";
  try {
    markDirty("mission");
    const url = await uploadMissionAsset(file, missionNumber, type);
    if (type === "code") {
      mission.codeImageUrl = url;
    } else {
      mission.missionImageUrl = url;
    }
    if (statusEl) {
      statusEl.textContent = "완료";
      statusEl.classList.remove("is-empty");
      statusEl.classList.add("is-done");
    }
    if (thumbEl) {
      thumbEl.innerHTML = `<img src="${url}" alt="${type === "code" ? "CODE" : "MISSION"} ${missionNumber}" />`;
    }
  } catch (error) {
    console.error(error);
    if (statusEl) {
      statusEl.textContent = "실패";
      statusEl.classList.remove("is-done");
      statusEl.classList.add("is-empty");
    }
  }
}

async function handleMissionAssetDrop(file, zone, teamId) {
  const row = zone?.closest("tr[data-mission]");
  if (!row || !teamId) return;
  const missionNumber = row.dataset.mission;
  const config = ensureMissionConfig(teamId);
  const mission = normalizeMissionEntry(config[missionNumber] || {});
  config[missionNumber] = mission;
  await applyMissionAssetUpload({
    file,
    missionNumber,
    type: zone.dataset.uploadType || "mission",
    mission,
    row,
  });
}

function buildStepModeOptions(selectedMode, includePhoto = false) {
  const options = [
    { value: STEP_MODES.ANSWER, label: "정답" },
    { value: STEP_MODES.QR, label: "QR" },
    { value: STEP_MODES.HQ, label: "HQ" },
    { value: STEP_MODES.PHOTO_HQ, label: "사진 + HQ 승인" },
  ];
  return options
    .map((option) => `<option value="${option.value}" ${option.value === selectedMode ? "selected" : ""}>${option.label}</option>`)
    .join("");
}

function needsAnswerField(mode) {
  return mode === STEP_MODES.ANSWER || mode === STEP_MODES.QR;
}

function usesPhotoStep(mission = {}) {
  return mission.codeStep?.mode === STEP_MODES.PHOTO_HQ || mission.missionStep?.mode === STEP_MODES.PHOTO_HQ;
}

function getAnswerLabel(mode, stepType = "code") {
  if (mode === STEP_MODES.QR) return "QR 값";
  if (mode === STEP_MODES.HQ) return "HQ 승인 안내";
  if (mode === STEP_MODES.PHOTO_HQ) return "사진 안내";
  return stepType === "code" ? "코드 정답" : "미션 정답";
}

function getAnswerPlaceholder(mode, stepType = "code") {
  if (mode === STEP_MODES.QR) return "강사/장소 QR 값";
  if (mode === STEP_MODES.HQ) return "HQ에서 직접 승인";
  if (mode === STEP_MODES.PHOTO_HQ) return "업로드 후 HQ 승인";
  return stepType === "code" ? "코드 정답" : "미션 정답";
}

function syncStepFieldState(container, input, mode, stepType = "code") {
  if (!container || !input) return;
  const enabled = needsAnswerField(mode);
  container.classList.toggle("is-disabled", !enabled);
  const label = container.querySelector("span");
  if (label) label.textContent = getAnswerLabel(mode, stepType);
  input.placeholder = getAnswerPlaceholder(mode, stepType);
  input.disabled = !enabled;
}

function syncPhotoModeState(slotConfig, photoInput, specialInput, specialField, toggleEl, mission) {
  const enabled = usesPhotoStep(mission);
  slotConfig?.classList.toggle("is-disabled", !enabled);
  if (photoInput) {
    photoInput.disabled = !enabled;
    photoInput.value = enabled ? normalizeSlotCount(mission.photoSlots) : 0;
  }
  if (specialInput) {
    specialInput.disabled = !enabled;
    specialInput.value = enabled ? normalizeSlotCount(mission.specialSlots) : 0;
  }
  syncSpecialSlotState(specialField, toggleEl, enabled ? mission.specialSlots : 0);
  if (toggleEl) toggleEl.disabled = !enabled;
}

function syncSpecialSlotState(fieldEl, toggleEl, count) {
  const isVisible = Number(count) > 0;
  fieldEl?.classList.toggle("is-visible", isVisible);
  if (toggleEl) {
    toggleEl.classList.toggle("is-active", isVisible);
    toggleEl.textContent = isVisible ? "추가 슬롯 사용 중" : "추가 슬롯 사용";
  }
}

function normalizeSlotCount(value) {
  return normalizeCount(value);
}

function syncMissionModalInputs(teamId) {
  if (!elements.missionModalBody || !teamId) return;
  const config = ensureMissionConfig(teamId);
  elements.missionModalBody.querySelectorAll("tr[data-mission]").forEach((row) => {
    const missionNumber = Number(row.dataset.mission);
    if (!missionNumber) return;
    const mission = normalizeMissionEntry(config[missionNumber] || {});
    config[missionNumber] = mission;

    const codeMode = row.querySelector(".mission-code-mode")?.value || mission.codeStep.mode;
    const missionMode = row.querySelector(".mission-mission-mode")?.value || mission.missionStep.mode;
    const codeDelayValue = row.querySelector(".mission-code-delay")?.value;
    const missionDelayValue = row.querySelector(".mission-mission-delay")?.value;
    const codeBypass = row.querySelector(".mission-code-bypass");
    const missionBypass = row.querySelector(".mission-mission-bypass");
    const codeInput = row.querySelector(".mission-code");
    const answerInput = row.querySelector(".mission-answer");
    const photoSlotsInput = row.querySelector(".mission-photo-slots");
    const specialSlotsInput = row.querySelector(".mission-special-slots");

    mission.codeStep.mode = codeMode;
    mission.missionStep.mode = missionMode;
    mission.codeStep.autoAdvanceSeconds = delayMinutesToSeconds(codeDelayValue);
    mission.missionStep.autoAdvanceSeconds = delayMinutesToSeconds(missionDelayValue);
    mission.codeStep.allowBypass = codeBypass ? codeBypass.checked : mission.codeStep.allowBypass !== false;
    mission.missionStep.allowBypass = missionBypass ? missionBypass.checked : mission.missionStep.allowBypass !== false;

    if (needsAnswerField(mission.codeStep.mode) && codeInput) {
      mission.codeAnswer = codeInput.value.trim() || "1";
      mission.codeStep.answer = mission.codeAnswer;
    }
    if (needsAnswerField(mission.missionStep.mode) && answerInput) {
      mission.missionAnswer = answerInput.value.trim() || "1";
      mission.missionStep.answer = mission.missionAnswer;
    }

    if (usesPhotoStep(mission)) {
      mission.photoSlots = normalizeSlotCount(photoSlotsInput?.value || 0);
      mission.specialSlots = normalizeSlotCount(specialSlotsInput?.value || 0);
      mission.photoPlan = normalizePhotoPlan(mission.photoPlan, {
        photoSlots: mission.photoSlots,
        specialSlots: mission.specialSlots,
      });
      mission.codeStep.photoSlots = mission.codeStep.mode === STEP_MODES.PHOTO_HQ ? mission.photoSlots : 0;
      mission.codeStep.specialSlots = mission.codeStep.mode === STEP_MODES.PHOTO_HQ ? mission.specialSlots : 0;
      mission.missionStep.photoSlots = mission.missionStep.mode === STEP_MODES.PHOTO_HQ ? mission.photoSlots : 0;
      mission.missionStep.specialSlots = mission.missionStep.mode === STEP_MODES.PHOTO_HQ ? mission.specialSlots : 0;
    } else {
      mission.photoSlots = 0;
      mission.specialSlots = 0;
      mission.photoPlan = [];
      mission.codeStep.photoSlots = 0;
      mission.codeStep.specialSlots = 0;
      mission.missionStep.photoSlots = 0;
      mission.missionStep.specialSlots = 0;
    }
  });
}

async function uploadMissionAsset(file, missionNumber, type) {
  const projectId = getProjectIdOrAlert();
  if (!projectId) throw new Error("Missing project id");
  const path = `projects/${projectId}/missions/${missionNumber}/${type}-${Date.now()}-${file.name}`;
  const storageRef = sRef(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

async function saveMissionConfiguration(options = {}) {
  const projectId = getProjectIdOrAlert("먼저 프로젝트를 저장한 뒤 문제를 저장하세요.");
  if (!projectId) return;
  const teamId = activeMissionTeam;
  if (!teamId) {
    showAdminToast("팀을 선택한 뒤 저장하세요.", "warn", 2800);
    return;
  }
  try {
    syncMissionModalInputs(teamId);
    const payload = normalizeMissionConfig(ensureMissionConfig(teamId));
    for (let missionNumber = 1; missionNumber <= missionTotal; missionNumber += 1) {
      payload[missionNumber] = resolveRenderedMissionEntry(teamId, missionNumber, payload[missionNumber] || {});
    }
    const teamOverride = buildTeamOverrideFor(teamId, payload);
    const order = getMissionModalTeamOrder();
    const currentIndex = order.indexOf(teamId);
    const nextTeamId = currentIndex >= 0 ? order[currentIndex + 1] || null : null;
    const updates = {
      [`projects/${projectId}/teams/${teamId}/config/missions`]: payload,
      [`projects/${projectId}/teamOverrides/${teamId}`]: Object.keys(teamOverride).length ? teamOverride : null,
    };
    await update(ref(db), updates);
    missionConfigs[teamId] = payload;
    if (projectsCache[projectId]) {
      projectsCache[projectId].teams = projectsCache[projectId].teams || {};
      projectsCache[projectId].teams[teamId] = projectsCache[projectId].teams[teamId] || {};
      projectsCache[projectId].teams[teamId].config = projectsCache[projectId].teams[teamId].config || {};
      projectsCache[projectId].teams[teamId].config.missions = payload;
      projectsCache[projectId].teamOverrides = projectsCache[projectId].teamOverrides || {};
      if (Object.keys(teamOverride).length) {
        projectsCache[projectId].teamOverrides[teamId] = teamOverride;
      } else {
        delete projectsCache[projectId].teamOverrides[teamId];
      }
    }
    renderMissionOverview();
    markSaved("mission");
    renderSetupRoadmap();
    renderLaunchReadiness();
    renderStartGatePanel();
    renderRehearsalPanel();
    if (options.goNext) {
      if (nextTeamId) {
        showAdminToast(`${formatMissionTeamLabel(teamId)} 저장 완료 · 다음 ${formatMissionTeamLabel(nextTeamId)}으로 이동합니다.`, "success", 3000);
        openMissionModal(nextTeamId);
        return;
      }
      showAdminToast(`${formatMissionTeamLabel(teamId)} 저장 완료 · 현재 필터의 마지막 팀입니다.`, "success", 3000);
      closeMissionModal();
      return;
    }
    const filterLabel = getMissionOverviewFilterLabel();
    showAdminToast(`${formatMissionTeamLabel(teamId)} 저장 완료 · ${filterLabel} 흐름에서 계속 작업할 수 있습니다.`, "success", 3000);
    renderMissionModalRows(teamId);
    updateMissionTeamNav(teamId);
  } catch (error) {
    console.error(error);
    showAdminToast("문제 저장 중 오류가 발생했습니다.", "error", 3600);
  }
}

function renderMissionOverview() {
  if (!elements.missionOverview) return;
  const teamCount = Math.max(1, Number(elements.teamCountInput?.value) || defaultTeamCount);
  const summaries = [];

  for (let i = 1; i <= teamCount; i++) {
    const teamId = `Team${i}`;
    const config = ensureMissionConfig(teamId);
    let answerCount = 0;
    let codeImageCount = 0;
    let missionImageCount = 0;
    let missingAnswerSteps = 0;
    let missingPhotoSlotMissions = 0;

    for (let missionNumber = 1; missionNumber <= missionTotal; missionNumber++) {
      const mission = normalizeMissionEntry(config[missionNumber] || {});
      const codeStep = getStepConfig(mission, "codeStep");
      const missionStep = getStepConfig(mission, "missionStep");
      const photoConfig = getPhotoConfigFromMission(mission);
      const codeReady = !needsAnswerField(codeStep.mode) || String(codeStep.answer || "").trim() !== "1";
      const missionReady = !needsAnswerField(missionStep.mode) || String(missionStep.answer || "").trim() !== "1";
      if (codeReady && missionReady) answerCount += 1;
      if (!codeReady) missingAnswerSteps += 1;
      if (!missionReady) missingAnswerSteps += 1;
      if (missionStep.mode === STEP_MODES.PHOTO_HQ && ((photoConfig.photoSlots || 0) + (photoConfig.specialSlots || 0) <= 0)) {
        missingPhotoSlotMissions += 1;
      }
      if (mission.codeImageUrl) codeImageCount += 1;
      if (mission.missionImageUrl) missionImageCount += 1;
    }

    const completionScore = answerCount + codeImageCount + missionImageCount;
    const issueBadges = [];
    if (missingAnswerSteps > 0) issueBadges.push(`값 누락 ${missingAnswerSteps}`);
    if (missingPhotoSlotMissions > 0) issueBadges.push(`사진 슬롯 ${missingPhotoSlotMissions}`);
    if (codeImageCount < missionTotal) issueBadges.push(`코드 이미지 ${missionTotal - codeImageCount}`);
    if (missionImageCount < missionTotal) issueBadges.push(`미션 이미지 ${missionTotal - missionImageCount}`);
    summaries.push({
      teamId,
      teamNumber: i,
      answerCount,
      codeImageCount,
      missionImageCount,
      completionScore,
      issueBadges,
      hasValueIssues: missingAnswerSteps > 0,
      hasPhotoSlotIssues: missingPhotoSlotMissions > 0,
      hasCodeImageIssues: codeImageCount < missionTotal,
      hasMissionImageIssues: missionImageCount < missionTotal,
    });
  }

  summaries.sort((a, b) => {
    if (a.completionScore !== b.completionScore) {
      return a.completionScore - b.completionScore;
    }
    return a.teamNumber - b.teamNumber;
  });
  lastMissionOverviewOrder = summaries.map((item) => item.teamId);

  const filteredSummaries = summaries.filter((item) => {
    switch (missionOverviewFilter) {
      case "issues":
        return item.issueBadges.length > 0;
      case "values":
        return item.hasValueIssues;
      case "slots":
        return item.hasPhotoSlotIssues;
      case "codeImages":
        return item.hasCodeImageIssues;
      case "missionImages":
        return item.hasMissionImageIssues;
      default:
        return true;
    }
  });
  lastVisibleMissionOverviewOrder = filteredSummaries.map((item) => item.teamId);
  renderMissionOverviewMeta(filteredSummaries.length, summaries.length);

  const cards = filteredSummaries.map((item) => `
      <article class="mission-team-card ${activeMissionTeam === item.teamId ? "is-active" : ""}" data-team-card="${item.teamId}">
        <div class="mission-team-card__header">
          <span class="team-number-badge">${item.teamNumber}팀</span>
          <button type="button" class="mission-team-card__btn" data-team-id="${item.teamId}">문제 입력</button>
        </div>
        <div class="mission-team-card__stats">
          <div class="mission-team-card__stat">
            <span class="mission-team-card__label">단계 값 준비</span>
            <strong>${item.answerCount}/${missionTotal}</strong>
          </div>
          <div class="mission-team-card__stat">
            <span class="mission-team-card__label">코드 이미지</span>
            <strong>${item.codeImageCount}/${missionTotal}</strong>
          </div>
          <div class="mission-team-card__stat">
            <span class="mission-team-card__label">미션 이미지</span>
            <strong>${item.missionImageCount}/${missionTotal}</strong>
          </div>
        </div>
        <div class="mission-team-card__issues">
          ${item.issueBadges.length
            ? item.issueBadges.map((label) => `<span class="mission-team-card__issue">${label}</span>`).join("")
            : `<span class="mission-team-card__issue mission-team-card__issue--ok">설정 준비 완료</span>`}
        </div>
      </article>
    `);

  elements.missionOverview.innerHTML = cards.length
    ? cards.join("")
    : `<div class="mission-overview__empty">현재 필터에 해당하는 팀이 없습니다.</div>`;
  elements.missionOverview.querySelectorAll("[data-team-id]").forEach((button) => {
    button.addEventListener("click", () => openMissionModal(button.dataset.teamId));
  });
  syncActionAvailability();
}

function renderMissionOverviewMeta(visibleCount = 0, totalCount = 0) {
  if (!elements.missionOverviewMeta) return;
  const filterLabels = {
    all: "전체",
    issues: "누락만",
    values: "값 누락",
    slots: "사진 슬롯",
    codeImages: "코드 이미지",
    missionImages: "미션 이미지",
  };
  const label = filterLabels[missionOverviewFilter] || "전체";
  const activeTeamLabel = activeMissionTeam
    ? ` · 현재 작업 ${Number(activeMissionTeam.replace("Team", "")) || activeMissionTeam}팀`
    : "";
  if (missionOverviewFilter === "all") {
    elements.missionOverviewMeta.textContent = `전체 ${totalCount}팀을 현재 우선순위 순서로 표시합니다${activeTeamLabel}.`;
    return;
  }
  const hiddenActiveNotice =
    activeMissionTeam && !lastVisibleMissionOverviewOrder.includes(activeMissionTeam)
      ? " · 현재 작업 팀은 이 필터 결과에 포함되지 않습니다"
      : "";
  elements.missionOverviewMeta.textContent = `${label} 필터 적용 중 · ${visibleCount}/${totalCount}팀 표시 · 빠른 이동과 모달 순서도 이 기준을 따릅니다${activeTeamLabel}${hiddenActiveNotice}.`;
}

function persistMissionViewState() {
  try {
    window.sessionStorage.setItem(MISSION_FILTER_STORAGE_KEY, missionOverviewFilter);
    if (activeMissionTeam) {
      window.sessionStorage.setItem(MISSION_TEAM_STORAGE_KEY, activeMissionTeam);
    }
  } catch (_error) {
    // Ignore sessionStorage access issues.
  }
}

function getPersistedMissionTeam() {
  try {
    return window.sessionStorage.getItem(MISSION_TEAM_STORAGE_KEY) || "";
  } catch (_error) {
    return "";
  }
}

function findPriorityMissionTeam() {
  const order = getMissionOverviewOrder();
  return order[0] || null;
}

function getMissionOverviewOrder() {
  return lastVisibleMissionOverviewOrder.length ? lastVisibleMissionOverviewOrder : lastMissionOverviewOrder;
}

function getMissionActionContextText() {
  const visibleCount = lastVisibleMissionOverviewOrder.length || lastMissionOverviewOrder.length;
  const totalCount = lastMissionOverviewOrder.length;
  const activeTeamLabel = activeMissionTeam ? ` · 현재 작업 ${formatMissionTeamLabel(activeMissionTeam)}` : "";
  const hiddenActiveNotice =
    activeMissionTeam && lastVisibleMissionOverviewOrder.length > 0 && !lastVisibleMissionOverviewOrder.includes(activeMissionTeam)
      ? " · 현재 작업 팀은 필터 결과 밖에 있습니다"
      : "";
  return `미션 설정을 확인하는 중입니다. 현재 필터는 ${getMissionOverviewFilterLabel()}이며 ${visibleCount}/${totalCount}팀을 보고 있습니다${activeTeamLabel}${hiddenActiveNotice}.`;
}

function formatMissionTeamLabel(teamId = "") {
  const numeric = Number(String(teamId).replace("Team", ""));
  return Number.isFinite(numeric) && numeric > 0 ? `${numeric}팀` : teamId || "팀";
}

function getMissionOverviewFilterLabel() {
  const filterLabels = {
    all: "전체",
    issues: "누락만",
    values: "값 누락",
    slots: "사진 슬롯",
    codeImages: "코드 이미지",
    missionImages: "미션 이미지",
  };
  return filterLabels[missionOverviewFilter] || "전체";
}

function getProjectNextActionHint() {
  const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
  const teams = collectTeamProfiles();
  const missionHealth = analyzeMissionConfiguration(Object.keys(teams));
  const hasTeamPasswordGap = Object.values(teams).some((team, index) => {
    const expected = getDefaultTeamPassword(index + 1);
    return !String(team.password || "").trim() || String(team.password || "").trim() === expected;
  });

  if (Object.keys(teams).length < teamCount || hasTeamPasswordGap) {
    return "다음으로 팀 탭에서 팀 비밀번호를 확인하세요.";
  }
  if (missionHealth.missingStepAnswers > 0 || missionHealth.missingPhotoSlots > 0) {
    return "다음으로 미션 탭에서 단계 값과 사진 슬롯을 채우세요.";
  }
  if (missionHealth.missingCodeImages > 0 || missionHealth.missingMissionImages > 0) {
    return "다음으로 미션 탭에서 이미지 누락을 채우세요.";
  }
  return "다음으로 운영 탭에서 리허설과 HQ 진입을 확인하세요.";
}

function getProjectNextTab() {
  const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
  const teams = collectTeamProfiles();
  const missionHealth = analyzeMissionConfiguration(Object.keys(teams));
  const hasTeamPasswordGap = Object.values(teams).some((team, index) => {
    const expected = getDefaultTeamPassword(index + 1);
    return !String(team.password || "").trim() || String(team.password || "").trim() === expected;
  });

  if (Object.keys(teams).length < teamCount || hasTeamPasswordGap) {
    return "teams";
  }
  if (missionHealth.missingStepAnswers > 0 || missionHealth.missingPhotoSlots > 0) {
    return "missions";
  }
  if (missionHealth.missingCodeImages > 0 || missionHealth.missingMissionImages > 0) {
    return "missions";
  }
  return "ops";
}

function renderAnnouncementTargets() {
  if (!elements.announcementTargetSelect) return;
  const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
  const options = ['<option value="__broadcast">전체 팀</option>'];
  for (let i = 1; i <= teamCount; i++) {
    options.push(`<option value="Team${i}">${i}팀</option>`);
  }
  const currentValue = elements.announcementTargetSelect.value;
  elements.announcementTargetSelect.innerHTML = options.join("");
  if (currentValue && elements.announcementTargetSelect.querySelector(`option[value="${currentValue}"]`)) {
    elements.announcementTargetSelect.value = currentValue;
  }
}

async function handleSendAnnouncement() {
  const projectId = getProjectIdOrAlert("먼저 프로젝트를 저장하세요.");
  if (!projectId) return;
  const target = elements.announcementTargetSelect?.value || "__broadcast";
  const message = elements.announcementMessageInput?.value.trim() || "";
  if (!message) {
    showAdminToast("공지 내용을 입력하세요.", "warn", 2600);
    return;
  }
  try {
    await push(ref(db, `chat/${projectId}/${target}`), {
      sender: "HQ",
      text: message,
      createdAt: serverTimestamp(),
    });
    await recordAuditLog(projectId, target === "__broadcast" ? "announcement_broadcast" : "announcement_team", {
      source: "admin",
      teamId: target === "__broadcast" ? "" : target,
      target,
      text: message,
    });
    if (elements.announcementMessageInput) {
      elements.announcementMessageInput.value = "";
    }
    showAdminToast(target === "__broadcast" ? "전체 공지를 보냈습니다." : `${formatMissionTeamLabel(target)}에 공지를 보냈습니다.`, "success", 2800);
  } catch (error) {
    console.error(error);
    showAdminToast("공지 발송 중 오류가 발생했습니다.", "error", 3200);
  }
}

function setupAssetDropzone(dropzone, input, assetType) {
  if (!dropzone || !input) return;
  dropzone.addEventListener("click", (event) => {
    if (event.target === input) return;
    input.click();
  });
  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add("is-dragging");
    });
  });
  ["dragleave", "dragend", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      if (eventName === "drop") return;
      dropzone.classList.remove("is-dragging");
    });
  });
  dropzone.addEventListener("drop", (event) => {
    dropzone.classList.remove("is-dragging");
    const file = event.dataTransfer?.files?.[0];
    handleAssetUpload(file, assetType);
  });
}

function bindInlineImageDropzones(container, onDrop) {
  if (!container || container.dataset.dropzoneBound === "yes") return;
  container.addEventListener("click", (event) => {
    const zone = event.target.closest(".route-asset-dropzone");
    if (!zone) return;
    if (event.target.closest("input, button, label")) return;
    zone.querySelector('input[type="file"]')?.click();
  });
  ["dragenter", "dragover"].forEach((eventName) => {
    container.addEventListener(eventName, (event) => {
      const zone = event.target.closest(".route-asset-dropzone, .mission-thumb-dropzone");
      if (!zone) return;
      event.preventDefault();
      zone.classList.add("is-dragging");
    });
  });
  ["dragleave", "dragend"].forEach((eventName) => {
    container.addEventListener(eventName, (event) => {
      const zone = event.target.closest(".route-asset-dropzone, .mission-thumb-dropzone");
      if (!zone) return;
      event.preventDefault();
      zone.classList.remove("is-dragging");
    });
  });
  container.addEventListener("drop", (event) => {
    const zone = event.target.closest(".route-asset-dropzone, .mission-thumb-dropzone");
    if (!zone) return;
    event.preventDefault();
    zone.classList.remove("is-dragging");
    const file = event.dataTransfer?.files?.[0];
    if (file) onDrop(file, zone);
  });
  container.dataset.dropzoneBound = "yes";
}

async function persistRainModeChange(enabled) {
  if (!currentProjectId) return false;
  const now = Date.now();
  try {
    await update(ref(db), {
      [`projects/${currentProjectId}/meta/rainMode`]: enabled,
      [`projects/${currentProjectId}/meta/weatherMode`]: enabled ? "rain" : "normal",
      [`projects/${currentProjectId}/meta/updatedAt`]: now,
    });
    projectsCache[currentProjectId] = projectsCache[currentProjectId] || {};
    projectsCache[currentProjectId].meta = {
      ...(projectsCache[currentProjectId].meta || {}),
      rainMode: enabled,
      weatherMode: enabled ? "rain" : "normal",
      updatedAt: now,
    };
    lastSavedAtValue = now;
    renderProjectList();
    renderSaveState();
    renderCurrentProjectBar();
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function handleAssetUpload(file, assetType = "logo") {
  if (!file) return;
  const projectId = getProjectIdOrAlert();
  if (!projectId) return;
  const safeName = `${Date.now()}-${file.name}`;
  const path =
    assetType === "background"
      ? `projects/${projectId}/login/background-${safeName}`
      : `projects/${projectId}/logos/shared-${safeName}`;
  const storageRef = sRef(storage, path);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  if (assetType === "background") {
    metaLoginBackgroundUrl = url;
    if (elements.loginBackgroundPreview) {
      elements.loginBackgroundPreview.src = url;
      elements.loginBackgroundPreview.classList.remove("hidden");
    }
  } else {
    metaLogoUrl = url;
    if (elements.sharedLogoPreview) elements.sharedLogoPreview.src = url;
  }
  renderLoginPreview();
  markRouteBuilderDirty();
}

function handleRouteBuilderInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const routeConfig = ensureRouteBuilderConfig();
  if (target.matches(".route-code-name, .route-code-answer, .route-code-mode, .route-code-delay, .route-code-slot-plan")) {
    const missionNumber = Number(target.dataset.codeNumber);
    if (!missionNumber) return;
    const variantKey = String(target.dataset.codeVariantKey || "").trim().toUpperCase();
    const entry = variantKey
      ? (
        routeConfig.codeVariants?.[missionNumber]?.[variantKey]
        || createDefaultRouteCodeVariantEntry(String(missionNumber), missionNumber, Number(variantKey.split("-")[1]) || 1)
      )
      : (routeConfig.codeLibrary[missionNumber] || createDefaultRouteCodeEntry(missionNumber));
    if (target.matches(".route-code-name")) entry.displayName = target.value.trim() || `코드 ${missionNumber}`;
    if (target.matches(".route-code-answer")) entry.answer = target.value.trim() || variantKey || String(missionNumber);
    if (target.matches(".route-code-mode")) entry.mode = target.value;
    if (target.matches(".route-code-delay")) {
      entry.autoAdvanceSeconds = delayMinutesToSeconds(target.value);
      target.value = secondsToDelayMinutes(entry.autoAdvanceSeconds);
    }
    if (target.matches(".route-code-slot-plan")) {
      entry.photoPlan = parsePhotoPlanInput(target.value);
      entry.photoSlots = entry.photoPlan.length;
      entry.specialSlots = 0;
      target.value = stringifyPhotoPlan(entry.photoPlan);
    }
    if (variantKey) {
      routeConfig.codeVariants = routeConfig.codeVariants || {};
      routeConfig.codeVariants[missionNumber] = routeConfig.codeVariants[missionNumber] || {};
      routeConfig.codeVariants[missionNumber][variantKey] = entry;
    } else {
      routeConfig.codeLibrary[missionNumber] = entry;
    }
  } else if (target.matches(".route-mission-name, .route-mission-template, .route-mission-mode, .route-mission-delay, .route-mission-slot-plan")) {
    const key = String(target.dataset.missionKey || "").trim().toUpperCase();
    if (!key) return;
    const entry = routeConfig.missionLibrary[key] || createDefaultRouteMissionEntry(key);
    if (target.matches(".route-mission-name")) entry.displayName = target.value.trim() || key;
    if (target.matches(".route-mission-template")) entry.answerTemplate = normalizeRouteAnswerTemplate(target.value, key);
    if (target.matches(".route-mission-mode")) entry.mode = target.value;
    if (target.matches(".route-mission-delay")) {
      entry.autoAdvanceSeconds = delayMinutesToSeconds(target.value);
      target.value = secondsToDelayMinutes(entry.autoAdvanceSeconds);
    }
    if (target.matches(".route-mission-slot-plan")) {
      entry.photoPlan = parsePhotoPlanInput(target.value);
      entry.photoSlots = entry.photoPlan.length;
      entry.specialSlots = 0;
      target.value = stringifyPhotoPlan(entry.photoPlan);
    }
    routeConfig.missionLibrary[key] = entry;
    if (event.type === "change") {
      renderRouteBuilder();
    }
  } else if (target.matches(".outdoor-asset-label, .outdoor-asset-code-answer, .outdoor-asset-mission-mode, .outdoor-asset-delay, .outdoor-asset-slot-plan")) {
    const missionNumber = Number(target.dataset.outdoorStep);
    const key = String(target.dataset.outdoorKey || "").trim().toUpperCase();
    if (!missionNumber || !key) return;
    routeConfig.outdoorAssets = routeConfig.outdoorAssets || {};
    routeConfig.outdoorAssets[missionNumber] = routeConfig.outdoorAssets[missionNumber] || {};
    const entry = routeConfig.outdoorAssets[missionNumber][key] || createDefaultOutdoorAssetEntry(missionNumber, key);
    if (target.matches(".outdoor-asset-label")) entry.label = target.value.trim() || `Step ${missionNumber} ${key}`;
    if (target.matches(".outdoor-asset-code-answer")) entry.codeAnswer = target.value.trim() || `${key}${missionNumber}`;
    if (target.matches(".outdoor-asset-mission-mode")) entry.missionMode = target.value;
    if (target.matches(".outdoor-asset-delay")) {
      entry.autoAdvanceSeconds = delayMinutesToSeconds(target.value);
      target.value = secondsToDelayMinutes(entry.autoAdvanceSeconds);
    }
    if (target.matches(".outdoor-asset-slot-plan")) {
      entry.photoPlan = parsePhotoPlanInput(target.value);
      entry.photoSlots = entry.photoPlan.length;
      target.value = stringifyPhotoPlan(entry.photoPlan);
    }
    routeConfig.outdoorAssets[missionNumber][key] = entry;
    if (event.type === "change") {
      renderRouteBuilder();
    }
  } else if (target.matches(".route-matrix-input")) {
    const teamId = String(target.dataset.teamId || "");
    const routeIndex = Number(target.dataset.routeIndex);
    if (!teamId || !Number.isFinite(routeIndex)) return;
    routeConfig.routes[teamId] = routeConfig.routes[teamId] || [];
    routeConfig.routes[teamId][routeIndex] = target.value.trim().toUpperCase();
    if (event.type === "change") {
      renderRouteBuilder();
    }
  } else if (target.matches(".route-code-matrix-input")) {
    const teamId = String(target.dataset.teamId || "");
    const routeIndex = Number(target.dataset.routeIndex);
    if (!teamId || !Number.isFinite(routeIndex)) return;
    routeConfig.codeRoutes[teamId] = routeConfig.codeRoutes[teamId] || [];
    routeConfig.codeRoutes[teamId][routeIndex] = normalizeCodeRouteToken(target.value);
    if (event.type === "change") {
      renderRouteBuilder();
    }
  } else if (target.matches(".route-edge-code-input")) {
    const teamId = String(target.dataset.teamId || "");
    const edgePosition = String(target.dataset.edgePosition || "").trim().toLowerCase();
    if (!teamId || !edgePosition) return;
    if (edgePosition === "start") {
      routeConfig.startCodeRoutes[teamId] = normalizeCodeRouteToken(target.value);
    } else if (edgePosition === "end") {
      routeConfig.endCodeRoutes[teamId] = normalizeCodeRouteToken(target.value);
    }
    if (event.type === "change") {
      renderRouteBuilder();
    }
  } else if (target.matches(".route-edge-mission-input")) {
    const teamId = String(target.dataset.teamId || "");
    const edgePosition = String(target.dataset.edgePosition || "").trim().toLowerCase();
    if (!teamId || !edgePosition) return;
    if (edgePosition === "start") {
      routeConfig.startRoutes[teamId] = normalizeMissionRouteToken(target.value);
    } else if (edgePosition === "end") {
      routeConfig.endRoutes[teamId] = normalizeMissionRouteToken(target.value);
    }
    if (event.type === "change") {
      renderRouteBuilder();
    }
  } else if (target.matches(".route-team-password-input")) {
    const teamId = String(target.dataset.teamId || "");
    const teamNumber = Number(teamId.replace("Team", "")) || 0;
    if (!teamId || !teamNumber) return;
    teamProfiles[teamId] = teamProfiles[teamId] || { name: "", password: "" };
    teamProfiles[teamId].password = resolveTeamPassword(target.value, teamNumber);
    if (event.type === "change") {
      renderRouteBuilder();
    }
  } else {
    return;
  }
  markRouteBuilderDirty();
}

function handleRouteLibraryClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const routeConfig = ensureRouteBuilderConfig();
  if (target.matches("[data-add-code-variant]")) {
    const missionNumber = Number(target.dataset.addCodeVariant);
    if (!missionNumber) return;
    routeConfig.codeVariants = routeConfig.codeVariants || {};
    routeConfig.codeVariants[missionNumber] = routeConfig.codeVariants[missionNumber] || {};
    const variantKey = buildCodeVariantKey(missionNumber, routeConfig.codeVariants[missionNumber]);
    routeConfig.codeVariants[missionNumber][variantKey] = createDefaultRouteCodeVariantEntry(String(missionNumber), missionNumber, Number(variantKey.split("-")[1]) || 1);
    renderRouteBuilder();
    markRouteBuilderDirty();
    showAdminToast(`코드 ${variantKey} 예외를 추가했습니다.`, "success", 2200);
  } else if (target.matches("[data-delete-code-variant]")) {
    const missionNumber = Number(target.dataset.deleteCodeVariant);
    const variantKey = String(target.dataset.codeVariantKey || "").trim().toUpperCase();
    if (!missionNumber || !variantKey) return;
    if (routeConfig.codeVariants?.[missionNumber]?.[variantKey]) {
      delete routeConfig.codeVariants[missionNumber][variantKey];
      if (!Object.keys(routeConfig.codeVariants[missionNumber]).length) {
        delete routeConfig.codeVariants[missionNumber];
      }
    }
    Object.keys(routeConfig.codeRoutes || {}).forEach((teamId) => {
      routeConfig.codeRoutes[teamId] = (routeConfig.codeRoutes[teamId] || []).map((value, index) => {
        const current = String(value || "").trim().toUpperCase();
        if (index + 2 !== missionNumber) return current;
        return current === variantKey ? getDefaultCodeKeyForMissionNumber(missionNumber).toUpperCase() : current;
      });
      if (missionNumber === 1 && String(routeConfig.startCodeRoutes?.[teamId] || "").trim().toUpperCase() === variantKey) {
        routeConfig.startCodeRoutes[teamId] = getDefaultCodeKeyForMissionNumber(1).toUpperCase();
      }
      if (missionNumber === missionTotal && String(routeConfig.endCodeRoutes?.[teamId] || "").trim().toUpperCase() === variantKey) {
        routeConfig.endCodeRoutes[teamId] = getDefaultCodeKeyForMissionNumber(missionTotal).toUpperCase();
      }
    });
    renderRouteBuilder();
    markRouteBuilderDirty();
    showAdminToast(`코드 ${variantKey} 예외를 삭제했습니다.`, "success", 2200);
  } else if (target.matches("[data-add-mission-variant]")) {
    const baseKey = String(target.dataset.addMissionVariant || "").trim().toUpperCase();
    if (!baseKey) return;
    const variantKey = buildMissionVariantKey(baseKey, routeConfig.missionLibrary);
    routeConfig.missionLibrary[variantKey] = createDefaultRouteMissionEntry(variantKey);
    renderRouteBuilder();
    markRouteBuilderDirty();
    showAdminToast(`미션 ${variantKey} 예외를 추가했습니다.`, "success", 2200);
  } else if (target.matches("[data-delete-mission-variant]")) {
    const variantKey = String(target.dataset.deleteMissionVariant || "").trim().toUpperCase();
    if (!variantKey) return;
    delete routeConfig.missionLibrary[variantKey];
    Object.keys(routeConfig.routes || {}).forEach((teamId) => {
      routeConfig.routes[teamId] = (routeConfig.routes[teamId] || []).map((value) => {
        const current = String(value || "").trim().toUpperCase();
        return current === variantKey ? "" : current;
      });
      if (String(routeConfig.startRoutes?.[teamId] || "").trim().toUpperCase() === variantKey) {
        routeConfig.startRoutes[teamId] = "S";
      }
      if (String(routeConfig.endRoutes?.[teamId] || "").trim().toUpperCase() === variantKey) {
        routeConfig.endRoutes[teamId] = "L";
      }
    });
    renderRouteBuilder();
    markRouteBuilderDirty();
    showAdminToast(`미션 ${variantKey} 예외를 삭제했습니다.`, "success", 2200);
  }
}

function handleRouteMatrixFocus(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement) || !target.matches(".route-matrix-input")) return;
  activeRoutePreview = {
    teamId: String(target.dataset.teamId || ""),
    routeIndex: Number(target.dataset.routeIndex),
  };
  renderRoutePreview();
}

async function copyRouteRow(teamId) {
  const routeConfig = ensureRouteBuilderConfig();
  const route = routeConfig.routes?.[teamId] || [];
  const codeRoute = routeConfig.codeRoutes?.[teamId] || [];
  const text = [
    `${getRouteStartCodeKey(routeConfig, teamId)}/${getRouteStartMissionKey(routeConfig, teamId)}`,
    ...route.map((value, index) => {
      const codeKey = String(codeRoute[index] || getDefaultCodeKeyForMissionNumber(index + 2)).trim().toUpperCase();
      const missionKey = String(value || "").trim().toUpperCase();
      return `${codeKey}/${missionKey}`;
    }),
    `${getRouteEndCodeKey(routeConfig, teamId)}/${getRouteEndMissionKey(routeConfig, teamId)}`,
  ].join("\t");
  if (!text) {
    showAdminToast(`${formatMissionTeamLabel(teamId)} 배치표가 아직 비어 있습니다.`, "warn", 2600);
    return;
  }
  try {
    if (!navigator.clipboard?.writeText) throw new Error("clipboard-unavailable");
    await navigator.clipboard.writeText(text);
    showAdminToast(`${formatMissionTeamLabel(teamId)} 코드/미션 경로를 복사했습니다.`, "success", 2400);
  } catch (error) {
    console.error(error);
    showAdminToast("브라우저에서 클립보드 복사를 허용하지 않았습니다.", "warn", 2800);
  }
}

function rotateRouteRow(teamId, direction = 1) {
  const routeConfig = ensureRouteBuilderConfig();
  const currentRoute = (routeConfig.routes?.[teamId] || []).map((value) => String(value || "").trim().toUpperCase());
  const currentCodeRoute = (routeConfig.codeRoutes?.[teamId] || []).map((value, index) => String(value || getDefaultCodeKeyForMissionNumber(index + 2)).trim().toUpperCase());
  const validRoute = currentRoute.filter(Boolean);
  const validCodeRoute = currentCodeRoute.filter(Boolean);
  if (validRoute.length <= 1) {
    showAdminToast(`${formatMissionTeamLabel(teamId)} 회전할 미션 키가 부족합니다.`, "warn", 2600);
    return;
  }
  const normalizedDirection = direction < 0 ? -1 : 1;
  const rotated = normalizedDirection < 0
    ? [validRoute[validRoute.length - 1], ...validRoute.slice(0, -1)]
    : [...validRoute.slice(1), validRoute[0]];
  const rotatedCodes = normalizedDirection < 0
    ? [validCodeRoute[validCodeRoute.length - 1], ...validCodeRoute.slice(0, -1)]
    : [...validCodeRoute.slice(1), validCodeRoute[0]];
  routeConfig.routes[teamId] = Array.from({ length: Math.max(1, missionTotal - 2) }, (_, index) => rotated[index] || "");
  routeConfig.codeRoutes[teamId] = Array.from({ length: Math.max(1, missionTotal - 2) }, (_, index) => rotatedCodes[index] || getDefaultCodeKeyForMissionNumber(index + 2));
  activeRoutePreview = { teamId, routeIndex: 0 };
  renderRouteBuilder();
  markRouteBuilderDirty();
  showAdminToast(`${formatMissionTeamLabel(teamId)} 경로를 ${normalizedDirection < 0 ? "좌" : "우"}회전했습니다.`, "success", 2600);
}

async function pasteRouteRow(teamId) {
  const routeConfig = ensureRouteBuilderConfig();
  try {
    if (!navigator.clipboard?.readText) throw new Error("clipboard-unavailable");
    const text = await navigator.clipboard.readText();
    const values = String(text || "")
      .split(/\r?\n/)[0]
      .split("\t")
      .map((value) => String(value || "").trim().toUpperCase())
      .filter((value) => value.length);
    if (!values.length) {
      showAdminToast("클립보드에 붙여넣을 배치표 값이 없습니다.", "warn", 2600);
      return;
    }
    const expectsEdgeTokens = values.length >= Math.max(1, missionTotal - 2) + 2;
    const startToken = expectsEdgeTokens ? (values[0] || "") : "";
    const endToken = expectsEdgeTokens ? (values[values.length - 1] || "") : "";
    routeConfig.startRoutes[teamId] = startToken.includes("/") ? normalizeMissionRouteToken(startToken.split("/")[1] || "S") : "S";
    routeConfig.startCodeRoutes[teamId] = startToken.includes("/") ? String(startToken.split("/")[0] || getDefaultCodeKeyForMissionNumber(1)).trim().toUpperCase() : getDefaultCodeKeyForMissionNumber(1).toUpperCase();
    routeConfig.routes[teamId] = Array.from({ length: Math.max(1, missionTotal - 2) }, (_, index) => {
      const token = values[index + (expectsEdgeTokens ? 1 : 0)] || "";
      return token.includes("/") ? token.split("/")[1] || "" : token;
    });
    routeConfig.codeRoutes[teamId] = Array.from({ length: Math.max(1, missionTotal - 2) }, (_, index) => {
      const token = values[index + (expectsEdgeTokens ? 1 : 0)] || "";
      return token.includes("/") ? token.split("/")[0] || getDefaultCodeKeyForMissionNumber(index + 2) : getDefaultCodeKeyForMissionNumber(index + 2);
    });
    routeConfig.endRoutes[teamId] = endToken.includes("/") ? normalizeMissionRouteToken(endToken.split("/")[1] || "L") : "L";
    routeConfig.endCodeRoutes[teamId] = endToken.includes("/") ? String(endToken.split("/")[0] || getDefaultCodeKeyForMissionNumber(missionTotal)).trim().toUpperCase() : getDefaultCodeKeyForMissionNumber(missionTotal).toUpperCase();
    activeRoutePreview = { teamId, routeIndex: 0 };
    renderRouteBuilder();
    markRouteBuilderDirty();
    showAdminToast(`${formatMissionTeamLabel(teamId)} 배치표에 클립보드 값을 붙여넣었습니다.`, "success", 2600);
  } catch (error) {
    console.error(error);
    showAdminToast("브라우저에서 클립보드 읽기를 허용하지 않았습니다.", "warn", 2800);
  }
}

function clearRouteRow(teamId) {
  const routeConfig = ensureRouteBuilderConfig();
  routeConfig.startRoutes[teamId] = "S";
  routeConfig.startCodeRoutes[teamId] = getDefaultCodeKeyForMissionNumber(1);
  routeConfig.routes[teamId] = Array.from({ length: Math.max(1, missionTotal - 2) }, () => "");
  routeConfig.endRoutes[teamId] = "L";
  routeConfig.endCodeRoutes[teamId] = getDefaultCodeKeyForMissionNumber(missionTotal);
  routeConfig.codeRoutes[teamId] = Array.from({ length: Math.max(1, missionTotal - 2) }, (_, index) => getDefaultCodeKeyForMissionNumber(index + 2));
  activeRoutePreview = { teamId, routeIndex: 0 };
  renderRouteBuilder();
  markRouteBuilderDirty();
  showAdminToast(`${formatMissionTeamLabel(teamId)} 배치표를 비웠습니다.`, "success", 2400);
}

function handleRouteMatrixAction(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const rotateLeftTeamId = target.closest("[data-route-row-rotate-left]")?.getAttribute("data-route-row-rotate-left");
  if (rotateLeftTeamId) {
    rotateRouteRow(rotateLeftTeamId, -1);
    return;
  }
  const rotateRightTeamId = target.closest("[data-route-row-rotate-right]")?.getAttribute("data-route-row-rotate-right");
  if (rotateRightTeamId) {
    rotateRouteRow(rotateRightTeamId, 1);
    return;
  }
  const copyTeamId = target.closest("[data-route-row-copy]")?.getAttribute("data-route-row-copy");
  if (copyTeamId) {
    void copyRouteRow(copyTeamId);
    return;
  }
  const pasteTeamId = target.closest("[data-route-row-paste]")?.getAttribute("data-route-row-paste");
  if (pasteTeamId) {
    void pasteRouteRow(pasteTeamId);
    return;
  }
  const clearTeamId = target.closest("[data-route-row-clear]")?.getAttribute("data-route-row-clear");
  if (clearTeamId) {
    clearRouteRow(clearTeamId);
  }
}

function clearSelectedRouteColumn() {
  if (!Number.isFinite(activeRoutePreview.routeIndex) || activeRoutePreview.routeIndex < 0) {
    showAdminToast("먼저 비울 타임 셀을 하나 선택하세요.", "warn", 2600);
    return;
  }
  const routeConfig = ensureRouteBuilderConfig();
  const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
  for (let teamNumber = 1; teamNumber <= teamCount; teamNumber += 1) {
    const teamId = `Team${teamNumber}`;
    routeConfig.routes[teamId] = routeConfig.routes[teamId] || [];
    routeConfig.routes[teamId][activeRoutePreview.routeIndex] = "";
  }
  renderRouteBuilder();
  markRouteBuilderDirty();
  showAdminToast(`${activeRoutePreview.routeIndex + 1}타임 열을 전체 비웠습니다.`, "success", 2600);
}

function duplicateRouteToNextTeam() {
  const sourceTeamId = activeRoutePreview.teamId;
  if (!sourceTeamId) {
    showAdminToast("먼저 복제 기준이 될 팀의 셀을 하나 선택하세요.", "warn", 2600);
    return;
  }
  const sourceTeamNumber = Number(sourceTeamId.replace("Team", "")) || 0;
  const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
  if (!sourceTeamNumber || sourceTeamNumber >= teamCount) {
    showAdminToast("마지막 팀은 아래 팀으로 복제할 수 없습니다.", "warn", 2600);
    return;
  }
  const nextTeamId = `Team${sourceTeamNumber + 1}`;
  const routeConfig = ensureRouteBuilderConfig();
  const sourceRoute = routeConfig.routes?.[sourceTeamId] || [];
  const sourceCodeRoute = routeConfig.codeRoutes?.[sourceTeamId] || [];
  routeConfig.startRoutes[nextTeamId] = getRouteStartMissionKey(routeConfig, sourceTeamId);
  routeConfig.endRoutes[nextTeamId] = getRouteEndMissionKey(routeConfig, sourceTeamId);
  routeConfig.routes[nextTeamId] = Array.from({ length: Math.max(1, missionTotal - 2) }, (_, index) => sourceRoute[index] || "");
  routeConfig.startCodeRoutes[nextTeamId] = getRouteStartCodeKey(routeConfig, sourceTeamId);
  routeConfig.endCodeRoutes[nextTeamId] = getRouteEndCodeKey(routeConfig, sourceTeamId);
  routeConfig.codeRoutes[nextTeamId] = Array.from({ length: Math.max(1, missionTotal - 2) }, (_, index) => sourceCodeRoute[index] || getDefaultCodeKeyForMissionNumber(index + 2));
  activeRoutePreview = { teamId: nextTeamId, routeIndex: activeRoutePreview.routeIndex };
  renderRouteBuilder();
  markRouteBuilderDirty();
  showAdminToast(`${formatMissionTeamLabel(sourceTeamId)} 배치표를 ${formatMissionTeamLabel(nextTeamId)}에 복제했습니다.`, "success", 2800);
}

function duplicateRouteToRemainingTeams() {
  const sourceTeamId = activeRoutePreview.teamId;
  if (!sourceTeamId) {
    showAdminToast("먼저 기준이 될 팀의 셀을 하나 선택하세요.", "warn", 2600);
    return;
  }
  const sourceTeamNumber = Number(sourceTeamId.replace("Team", "")) || 0;
  const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
  if (!sourceTeamNumber || sourceTeamNumber >= teamCount) {
    showAdminToast("마지막 팀 아래에는 복제할 대상이 없습니다.", "warn", 2600);
    return;
  }
  const routeConfig = ensureRouteBuilderConfig();
  const sourceRoute = routeConfig.routes?.[sourceTeamId] || [];
  const sourceCodeRoute = routeConfig.codeRoutes?.[sourceTeamId] || [];
  const sourceStartRoute = getRouteStartMissionKey(routeConfig, sourceTeamId);
  const sourceEndRoute = getRouteEndMissionKey(routeConfig, sourceTeamId);
  const sourceStartCode = getRouteStartCodeKey(routeConfig, sourceTeamId);
  const sourceEndCode = getRouteEndCodeKey(routeConfig, sourceTeamId);
  let copiedTeams = 0;
  for (let teamNumber = sourceTeamNumber + 1; teamNumber <= teamCount; teamNumber += 1) {
    const targetTeamId = `Team${teamNumber}`;
    routeConfig.startRoutes[targetTeamId] = sourceStartRoute;
    routeConfig.endRoutes[targetTeamId] = sourceEndRoute;
    routeConfig.routes[targetTeamId] = Array.from({ length: Math.max(1, missionTotal - 2) }, (_, index) => sourceRoute[index] || "");
    routeConfig.startCodeRoutes[targetTeamId] = sourceStartCode;
    routeConfig.endCodeRoutes[targetTeamId] = sourceEndCode;
    routeConfig.codeRoutes[targetTeamId] = Array.from({ length: Math.max(1, missionTotal - 2) }, (_, index) => sourceCodeRoute[index] || getDefaultCodeKeyForMissionNumber(index + 2));
    copiedTeams += 1;
  }
  renderRouteBuilder();
  markRouteBuilderDirty();
  showAdminToast(`${formatMissionTeamLabel(sourceTeamId)} 배치표를 아래 ${copiedTeams}개 팀에 복제했습니다.`, "success", 3000);
}

function parseTeamRange(rawValue, teamCount) {
  const value = String(rawValue || "").trim();
  const match = value.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) return null;
  const start = Math.max(1, Math.min(teamCount, Number(match[1]) || 0));
  const end = Math.max(1, Math.min(teamCount, Number(match[2]) || 0));
  if (!start || !end) return null;
  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
  };
}

function duplicateRouteToRange() {
  const sourceTeamId = activeRoutePreview.teamId;
  if (!sourceTeamId) {
    showAdminToast("먼저 기준이 될 팀의 셀을 하나 선택하세요.", "warn", 2600);
    return;
  }
  const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
  const range = parseTeamRange(elements.routeRangeApplyInput?.value, teamCount);
  if (!range) {
    showAdminToast("복제 범위를 `3-7` 형태로 입력하세요.", "warn", 2800);
    return;
  }
  const sourceTeamNumber = Number(sourceTeamId.replace("Team", "")) || 0;
  const routeConfig = ensureRouteBuilderConfig();
  const sourceRoute = routeConfig.routes?.[sourceTeamId] || [];
  const sourceCodeRoute = routeConfig.codeRoutes?.[sourceTeamId] || [];
  const sourceStartRoute = getRouteStartMissionKey(routeConfig, sourceTeamId);
  const sourceEndRoute = getRouteEndMissionKey(routeConfig, sourceTeamId);
  const sourceStartCode = getRouteStartCodeKey(routeConfig, sourceTeamId);
  const sourceEndCode = getRouteEndCodeKey(routeConfig, sourceTeamId);
  let copiedTeams = 0;
  for (let teamNumber = range.start; teamNumber <= range.end; teamNumber += 1) {
    if (teamNumber === sourceTeamNumber) continue;
    const targetTeamId = `Team${teamNumber}`;
    routeConfig.startRoutes[targetTeamId] = sourceStartRoute;
    routeConfig.endRoutes[targetTeamId] = sourceEndRoute;
    routeConfig.routes[targetTeamId] = Array.from({ length: Math.max(1, missionTotal - 2) }, (_, index) => sourceRoute[index] || "");
    routeConfig.startCodeRoutes[targetTeamId] = sourceStartCode;
    routeConfig.endCodeRoutes[targetTeamId] = sourceEndCode;
    routeConfig.codeRoutes[targetTeamId] = Array.from({ length: Math.max(1, missionTotal - 2) }, (_, index) => sourceCodeRoute[index] || getDefaultCodeKeyForMissionNumber(index + 2));
    copiedTeams += 1;
  }
  if (!copiedTeams) {
    showAdminToast("입력한 범위에 복제할 대상 팀이 없습니다.", "warn", 2600);
    return;
  }
  renderRouteBuilder();
  markRouteBuilderDirty();
  showAdminToast(`${formatMissionTeamLabel(sourceTeamId)} 배치표를 ${range.start}-${range.end}팀 범위에 복제했습니다.`, "success", 3000);
}

function autoFillRouteRange() {
  const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
  const range = parseTeamRange(elements.routeRangeApplyInput?.value, teamCount);
  if (!range) {
    showAdminToast("순열을 채울 범위를 `3-7` 형태로 입력하세요.", "warn", 2800);
    return;
  }
  const routeConfig = ensureRouteBuilderConfig();
  const middleCount = Math.max(1, missionTotal - 2);
  const keys = routeConfig.missionKeys.length ? routeConfig.missionKeys : buildDefaultRouteKeys(middleCount);
  for (let teamNumber = range.start; teamNumber <= range.end; teamNumber += 1) {
    const teamId = `Team${teamNumber}`;
    routeConfig.startRoutes[teamId] = "S";
    routeConfig.endRoutes[teamId] = "L";
    routeConfig.routes[teamId] = Array.from({ length: middleCount }, (_, routeIndex) => (
      keys[(routeIndex + teamNumber - range.start) % keys.length] || keys[0] || "A"
    ));
    routeConfig.startCodeRoutes[teamId] = getDefaultCodeKeyForMissionNumber(1);
    routeConfig.endCodeRoutes[teamId] = getDefaultCodeKeyForMissionNumber(missionTotal);
    routeConfig.codeRoutes[teamId] = Array.from({ length: middleCount }, (_, routeIndex) => getDefaultCodeKeyForMissionNumber(routeIndex + 2));
  }
  activeRoutePreview = { teamId: `Team${range.start}`, routeIndex: 0 };
  renderRouteBuilder();
  markRouteBuilderDirty();
  showAdminToast(`${range.start}-${range.end}팀 범위를 기본 순열로 다시 채웠습니다.`, "success", 3000);
}

function getTeamPasswordByTeamId(teamId) {
  if (!teamId) return "";
  const routeRow = elements.routeMatrixBody?.querySelector(`tr[data-route-team="${teamId}"]`);
  const routeInput = routeRow?.querySelector(".route-team-password-input");
  if (routeInput instanceof HTMLInputElement) {
    return resolveTeamPassword(routeInput.value, Number(teamId.replace("Team", "")) || 0);
  }
  const row = elements.teamTableBody?.querySelector(`tr[data-team-id="${teamId}"]`);
  const input = row?.querySelector("input");
  if (input) return resolveTeamPassword(input.value, Number(teamId.replace("Team", "")) || 0);
  const profile = teamProfiles[teamId];
  if (profile?.password) return resolveTeamPassword(profile.password, Number(teamId.replace("Team", "")) || 0);
  return "";
}

function applyImportedTeamPassword(teamId, password) {
  if (!teamId || !String(password || "").trim()) return;
  const teamNumber = Number(teamId.replace("Team", "")) || 0;
  const resolvedPassword = resolveTeamPassword(password, teamNumber);
  teamProfiles[teamId] = teamProfiles[teamId] || { name: "", password: resolvedPassword };
  teamProfiles[teamId].password = resolvedPassword;
  const routeRow = elements.routeMatrixBody?.querySelector(`tr[data-route-team="${teamId}"]`);
  const routeInput = routeRow?.querySelector(".route-team-password-input");
  if (routeInput instanceof HTMLInputElement) routeInput.value = resolvedPassword;
  const row = elements.teamTableBody?.querySelector(`tr[data-team-id="${teamId}"]`);
  const input = row?.querySelector("input");
  if (input) input.value = resolvedPassword;
}

function buildRouteMatrixRows(projectId, routeConfig) {
  const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
  const middleCount = Math.max(1, missionTotal - 2);
  const routeHeaders = routeConfig.missionKeys?.length
    ? routeConfig.missionKeys.slice(0, middleCount)
    : Array.from({ length: middleCount }, (_, index) => `${index + 1}타임`);
  const header = ["project_id", "team_id", "team_number", "team_password", "start_code", "start_mission"];
  routeHeaders.forEach((label, index) => {
    header.push(`code_${index + 1}`);
    header.push(`mission_${label}`);
  });
  header.push("end_code", "end_mission", "route_summary");
  const rows = [header];
  for (let teamNumber = 1; teamNumber <= teamCount; teamNumber += 1) {
    const teamId = `Team${teamNumber}`;
    const middleRoute = Array.from({ length: middleCount }, (_, index) => String(routeConfig.routes?.[teamId]?.[index] || "").trim().toUpperCase());
    const middleCodeRoute = Array.from({ length: middleCount }, (_, index) => String(routeConfig.codeRoutes?.[teamId]?.[index] || getDefaultCodeKeyForMissionNumber(index + 2)).trim().toUpperCase());
    const startCodeKey = getRouteStartCodeKey(routeConfig, teamId);
    const startMissionKey = getRouteStartMissionKey(routeConfig, teamId);
    const endCodeKey = getRouteEndCodeKey(routeConfig, teamId);
    const endMissionKey = getRouteEndMissionKey(routeConfig, teamId);
    const summary = [
      `${startCodeKey}/${getRouteDisplayLabel(routeConfig, startMissionKey, 1)}`,
      ...middleRoute.map((key, index) => `${middleCodeRoute[index]}/${getRouteDisplayLabel(routeConfig, key, index + 2)}`),
      `${endCodeKey}/${getRouteDisplayLabel(routeConfig, endMissionKey, missionTotal)}`,
    ].join(" -> ");
    const middleColumns = [];
    middleRoute.forEach((key, index) => {
      middleColumns.push(middleCodeRoute[index]);
      middleColumns.push(key);
    });
    rows.push([
      projectId,
      teamId,
      teamNumber,
      getTeamPasswordByTeamId(teamId),
      startCodeKey,
      startMissionKey,
      ...middleColumns,
      endCodeKey,
      endMissionKey,
      summary,
    ]);
  }
  return rows;
}

function buildRouteValidationMap(routeConfig) {
  const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
  const middleCount = Math.max(1, missionTotal - 2);
  const routeIssues = analyzeRouteBuilder();
  const issueMap = new Map(routeIssues.map((item) => [item.teamId, item]));
  const duplicatePasswords = new Set(findDuplicateTeamPasswords(collectTeamProfiles()));
  const warningsByTeam = new Map();

  for (let teamNumber = 1; teamNumber <= teamCount; teamNumber += 1) {
    const teamId = `Team${teamNumber}`;
    const route = routeConfig.routes?.[teamId] || [];
    const codeRoute = routeConfig.codeRoutes?.[teamId] || [];
    const startRoute = getRouteStartMissionKey(routeConfig, teamId);
    const endRoute = getRouteEndMissionKey(routeConfig, teamId);
    const startCode = getRouteStartCodeKey(routeConfig, teamId);
    const endCode = getRouteEndCodeKey(routeConfig, teamId);
    const warnings = [];
    if (duplicatePasswords.has(teamId)) warnings.push({ code: "DUP_PASSWORD", label: "중복 비번" });
    if (!String(startRoute || "").trim() || !String(endRoute || "").trim()) {
      warnings.push({ code: "EMPTY_SLOT", label: "빈 칸" });
    }
    if (Array.from({ length: middleCount }, (_, index) => String(route[index] || "").trim()).some((value) => !value)) {
      warnings.push({ code: "EMPTY_SLOT", label: "빈 칸" });
    }
    if (!String(startCode || "").trim() || !String(endCode || "").trim()) {
      warnings.push({ code: "EMPTY_CODE", label: "빈 코드" });
    }
    if (Array.from({ length: middleCount }, (_, index) => String(codeRoute[index] || "").trim()).some((value) => !value)) {
      warnings.push({ code: "EMPTY_CODE", label: "빈 코드" });
    }
    const invalidCodes = [
      startCode && !hasRouteCodeKey(routeConfig, startCode, 1) ? startCode : "",
      ...Array.from({ length: middleCount }, (_, index) => {
      const missionNumber = index + 2;
      const codeKey = normalizeCodeRouteToken(codeRoute[index] || "").trim().toUpperCase();
      if (!codeKey) return "";
      return hasRouteCodeKey(routeConfig, codeKey, missionNumber) ? "" : codeKey;
      }),
      endCode && !hasRouteCodeKey(routeConfig, endCode, missionTotal) ? endCode : "",
    ].filter(Boolean);
    if (invalidCodes.length) warnings.push({
      code: "INVALID_CODE",
      detail: invalidCodes.join("/"),
      label: `정의 안 된 코드(${invalidCodes.join("/")})`,
    });
    const issue = issueMap.get(teamId);
    const edgeInvalid = [
      !hasRouteAssetKey(routeConfig, startRoute, 1) ? startRoute : "",
      !hasRouteAssetKey(routeConfig, endRoute, missionTotal) ? endRoute : "",
    ].filter(Boolean);
    if (edgeInvalid.length) warnings.push({
      code: "INVALID_KEY",
      detail: edgeInvalid.join("/"),
      label: `정의 안 된 키(${edgeInvalid.join("/")})`,
    });
    if (issue?.invalid?.length) warnings.push({
      code: "INVALID_KEY",
      detail: issue.invalid.join("/"),
      label: `정의 안 된 키(${issue.invalid.join("/")})`,
    });
    if (issue?.duplicates?.length) warnings.push({
      code: "DUP_KEY",
      detail: issue.duplicates.join("/"),
      label: `중복 키(${issue.duplicates.join("/")})`,
    });
    if (issue?.missing?.length) warnings.push({
      code: "MISSING_KEY",
      detail: issue.missing.join("/"),
      label: `누락(${issue.missing.join("/")})`,
    });
    if (issue?.countMismatch) warnings.push({ code: "COUNT_MISMATCH", label: "타임 수 불일치" });
    warningsByTeam.set(teamId, warnings);
  }
  return warningsByTeam;
}

function toRouteWarningToken(warning = {}) {
  if (!warning?.code) return "";
  return warning.detail ? `${warning.code}(${warning.detail})` : warning.code;
}

function toRouteWarningShortCode(warning = {}) {
  switch (warning?.code) {
    case "DUP_PASSWORD":
      return "PW";
    case "EMPTY_SLOT":
      return "EMP";
    case "EMPTY_CODE":
      return "COD";
    case "INVALID_CODE":
      return "ICD";
    case "INVALID_KEY":
      return "INV";
    case "DUP_KEY":
      return "DUP";
    case "MISSING_KEY":
      return "MIS";
    case "COUNT_MISMATCH":
      return "CNT";
    default:
      return String(warning?.code || "ERR").trim().slice(0, 4) || "ERR";
  }
}

function toRouteWarningLabel(warning = {}) {
  return String(warning?.label || warning?.code || "").trim();
}

function buildRouteAssignmentRows(projectId, routeConfig) {
  const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
  const middleCount = Math.max(1, missionTotal - 2);
  const routeHeaders = routeConfig.missionKeys?.length
    ? routeConfig.missionKeys.slice(0, middleCount)
    : Array.from({ length: middleCount }, (_, index) => `${index + 1}타임`);
  const header = ["project_id", "team_id", "team_number", "team_password", "start_code", "start_mission"];
  routeHeaders.forEach((label, index) => {
    header.push(`code_${index + 1}`);
    header.push(`mission_${label}`);
  });
  header.push("end_code", "end_mission", "route_summary", "validation");
  const rows = [header];
  const warningsByTeam = buildRouteValidationMap(routeConfig);

  for (let teamNumber = 1; teamNumber <= teamCount; teamNumber += 1) {
    const teamId = `Team${teamNumber}`;
    const middleRoute = Array.from({ length: middleCount }, (_, index) => String(routeConfig.routes?.[teamId]?.[index] || "").trim().toUpperCase());
    const middleCodeRoute = Array.from({ length: middleCount }, (_, index) => String(routeConfig.codeRoutes?.[teamId]?.[index] || getDefaultCodeKeyForMissionNumber(index + 2)).trim().toUpperCase());
    const startCodeKey = getRouteStartCodeKey(routeConfig, teamId);
    const startMissionKey = getRouteStartMissionKey(routeConfig, teamId);
    const endCodeKey = getRouteEndCodeKey(routeConfig, teamId);
    const endMissionKey = getRouteEndMissionKey(routeConfig, teamId);
    const summary = [
      `${startCodeKey}/${getRouteDisplayLabel(routeConfig, startMissionKey, 1)}`,
      ...middleRoute.map((key, index) => `${middleCodeRoute[index]}/${getRouteDisplayLabel(routeConfig, key, index + 2)}`),
      `${endCodeKey}/${getRouteDisplayLabel(routeConfig, endMissionKey, missionTotal)}`,
    ].join(" -> ");
    const warnings = warningsByTeam.get(teamId) || [];
    const middleColumns = [];
    middleRoute.forEach((key, index) => {
      middleColumns.push(middleCodeRoute[index]);
      middleColumns.push(key);
    });
    rows.push([
      projectId,
      teamId,
      teamNumber,
      getTeamPasswordByTeamId(teamId),
      startCodeKey,
      startMissionKey,
      ...middleColumns,
      endCodeKey,
      endMissionKey,
      summary,
      warnings.length ? warnings.map((warning) => toRouteWarningToken(warning)).join(" | ") : "ok",
    ]);
  }
  return rows;
}

function buildRouteStaffSheetRows(projectId, routeConfig) {
  const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
  const middleCount = Math.max(1, missionTotal - 2);
  const routeHeaders = routeConfig.missionKeys?.length
    ? routeConfig.missionKeys.slice(0, middleCount)
    : Array.from({ length: middleCount }, (_, index) => `${index + 1}타임`);
  const header = ["project_id", "team_id", "team_number", "team_password", "S"];
  routeHeaders.forEach((label) => {
    header.push(label);
  });
  header.push("L");
  const rows = [header];

  for (let teamNumber = 1; teamNumber <= teamCount; teamNumber += 1) {
    const teamId = `Team${teamNumber}`;
    const startCell = buildAppliedRouteStaffCell(teamId, 1, routeConfig);
    const stageCells = Array.from({ length: middleCount }, (_, index) => {
      const missionNumber = index + 2;
      const cell = buildAppliedRouteStaffCell(teamId, missionNumber, routeConfig);
      return `${cell.key} / 정답 ${cell.answer}`;
    });
    const endCell = buildAppliedRouteStaffCell(teamId, missionTotal, routeConfig);
    rows.push([
      projectId,
      teamId,
      teamNumber,
      getTeamPasswordByTeamId(teamId),
      `${startCell.key} / 정답 ${startCell.answer}`,
      ...stageCells,
      `${endCell.key} / 정답 ${endCell.answer}`,
    ]);
  }
  return rows;
}

function buildRouteStaffSheetCopyText(projectId, routeConfig) {
  const rows = buildRouteStaffSheetRows(projectId, routeConfig);
  const [header, ...dataRows] = rows;
  const title = elements.projectNameInput?.value.trim() || projectId || "SMART Mission Race";
  const codeLegendText = Array.from(new Set(dataRows.flatMap((row) => row.slice(5, -1).map((cell) => String(cell || "").split(" / ")[0].trim()).filter(Boolean))))
    .join(", ");
  const missionLegendText = Array.from(new Set(dataRows.flatMap((row) => row.slice(5, -1).map((cell) => String(cell || "").split(" / ")[1]?.trim() || "").filter(Boolean))))
    .join(", ");
  const lines = [
    `${title} 진행팀 최종 팀표`,
    `형식: 코드키 / 미션키`,
    codeLegendText ? `코드키: ${codeLegendText}` : "",
    missionLegendText ? `미션키: ${missionLegendText}` : "",
    "",
    header.join("\t"),
    ...dataRows.map((row) => row.join("\t")),
  ].filter(Boolean);
  return lines.join("\n");
}

function buildRouteIssueRows(projectId, routeConfig) {
  const rows = buildRouteAssignmentRows(projectId, routeConfig);
  if (rows.length <= 1) return rows;
  const [header, ...dataRows] = rows;
  const validationIndex = header.indexOf("validation");
  if (validationIndex < 0) return rows;
  const issueRows = dataRows.filter((row) => String(row[validationIndex] || "").toLowerCase() !== "ok");
  return [header, ...issueRows];
}

function parseCsvLine(line = "") {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values;
}

function parseRouteMatrixCsv(text = "") {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]);
  const teamIdIndex = header.indexOf("team_id");
  const passwordIndex = header.indexOf("team_password");
  const startCodeIndex = header.indexOf("start_code");
  const startMissionIndex = header.indexOf("start_mission");
  const endCodeIndex = header.indexOf("end_code");
  const endMissionIndex = header.indexOf("end_mission");
  const startIndex = startMissionIndex >= 0 ? startMissionIndex : (header.indexOf("S") >= 0 ? header.indexOf("S") : header.indexOf("START"));
  const lastIndex = endMissionIndex >= 0 ? endMissionIndex : (header.indexOf("L") >= 0 ? header.indexOf("L") : header.indexOf("LAST"));
  const routeColumns = startIndex >= 0 && lastIndex > startIndex
    ? header
        .map((label, index) => ({ label, index }))
        .filter((item) => item.index > startIndex && item.index < (endCodeIndex >= 0 ? endCodeIndex : lastIndex))
    : header
        .map((label, index) => ({ label, index }))
        .filter((item) => /^\d+타임$/.test(item.label));
  if (teamIdIndex < 0 || !routeColumns.length) return [];
  const groupedRouteColumns = [];
  for (let index = 0; index < routeColumns.length; index += 1) {
    const current = routeColumns[index];
    const next = routeColumns[index + 1];
    if (/^code_\d+$/i.test(current.label) && next && /^mission_/i.test(next.label)) {
      groupedRouteColumns.push({ codeIndex: current.index, missionIndex: next.index });
      index += 1;
      continue;
    }
    groupedRouteColumns.push({ codeIndex: -1, missionIndex: current.index });
  }
  return lines.slice(1).map((line) => {
    const row = parseCsvLine(line);
    const route = groupedRouteColumns.map((column) => String(row[column.missionIndex] || "").trim().toUpperCase());
    const codeRoute = groupedRouteColumns.map((column, index) => {
      const missionNumber = index + 2;
      return column.codeIndex >= 0
        ? String(row[column.codeIndex] || "").trim().toUpperCase()
        : getDefaultCodeKeyForMissionNumber(missionNumber).toUpperCase();
    });
    return {
      teamId: String(row[teamIdIndex] || "").trim(),
      teamPassword: passwordIndex >= 0 ? String(row[passwordIndex] || "").trim() : "",
      startCodeKey: startCodeIndex >= 0 ? String(row[startCodeIndex] || "").trim().toUpperCase() : getDefaultCodeKeyForMissionNumber(1).toUpperCase(),
      startMissionKey: startMissionIndex >= 0 ? normalizeMissionRouteToken(String(row[startMissionIndex] || "").trim()) : "S",
      route,
      codeRoute,
      endCodeKey: endCodeIndex >= 0 ? String(row[endCodeIndex] || "").trim().toUpperCase() : getDefaultCodeKeyForMissionNumber(missionTotal).toUpperCase(),
      endMissionKey: endMissionIndex >= 0 ? normalizeMissionRouteToken(String(row[endMissionIndex] || "").trim()) : "L",
    };
  }).filter((entry) => entry.teamId);
}

async function handleImportRouteMatrix(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const rows = parseRouteMatrixCsv(text);
    if (!rows.length) {
      showAdminToast("배치표 CSV 형식을 읽지 못했습니다. 내보낸 CSV 형식을 확인하세요.", "warn", 3200);
      return;
    }
    const routeConfig = ensureRouteBuilderConfig();
    const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
    let applied = 0;
    rows.forEach(({ teamId, route, codeRoute, teamPassword, startCodeKey, startMissionKey, endCodeKey, endMissionKey }) => {
      const teamNumber = Number(String(teamId).replace("Team", "")) || 0;
      if (!teamNumber || teamNumber > teamCount) return;
      routeConfig.startCodeRoutes[teamId] = startCodeKey || getDefaultCodeKeyForMissionNumber(1).toUpperCase();
      routeConfig.startRoutes[teamId] = startMissionKey || "S";
      routeConfig.routes[teamId] = Array.from({ length: Math.max(1, missionTotal - 2) }, (_, index) => route[index] || "");
      routeConfig.endCodeRoutes[teamId] = endCodeKey || getDefaultCodeKeyForMissionNumber(missionTotal).toUpperCase();
      routeConfig.endRoutes[teamId] = endMissionKey || "L";
      routeConfig.codeRoutes[teamId] = Array.from({ length: Math.max(1, missionTotal - 2) }, (_, index) => codeRoute[index] || getDefaultCodeKeyForMissionNumber(index + 2));
      applyImportedTeamPassword(teamId, teamPassword);
      applied += 1;
    });
    if (!applied) {
      showAdminToast("현재 팀 수와 맞는 배치표 행이 없어 가져오지 못했습니다.", "warn", 3200);
      return;
    }
    renderRouteBuilder();
    markRouteBuilderDirty();
    showAdminToast(`배치표 CSV에서 ${applied}개 팀 행을 가져왔습니다.`, "success", 3200);
  } catch (error) {
    console.error(error);
    showAdminToast("배치표 CSV를 가져오는 중 오류가 발생했습니다.", "error", 3200);
  } finally {
    input.value = "";
  }
}

function handleExportRouteMatrix() {
  const routeConfig = ensureRouteBuilderConfig();
  const projectId = resolveProjectId() || getDraftProjectId();
  if (!projectId) {
    showAdminToast("먼저 프로젝트 이름을 입력하거나 저장하세요.", "warn", 2800);
    return;
  }
  const rows = buildRouteMatrixRows(projectId, routeConfig);
  const filename = `${projectId}_route_matrix_${new Date().toISOString().slice(0, 10)}.csv`;
  downloadCsv(filename, toCsv(rows));
  showAdminToast(`배치표 CSV를 내려받았습니다. ${Math.max(0, rows.length - 1)}개 팀 행이 포함되었습니다.`, "success", 3200);
  if (currentProjectId) {
    void recordAuditLog(currentProjectId, "project_export_route_matrix", {
      source: "admin",
      filename,
      rowCount: Math.max(0, rows.length - 1),
    });
  }
}

function handleExportRouteAssignmentReport() {
  const routeConfig = ensureRouteBuilderConfig();
  const projectId = resolveProjectId() || getDraftProjectId();
  if (!projectId) {
    showAdminToast("먼저 프로젝트 이름을 입력하거나 저장하세요.", "warn", 2800);
    return;
  }
  const rows = buildRouteAssignmentRows(projectId, routeConfig);
  const filename = `${projectId}_team_assignment_report_${new Date().toISOString().slice(0, 10)}.csv`;
  downloadCsv(filename, toCsv(rows));
  showAdminToast(`팀배치표 리포트 CSV를 내려받았습니다. ${Math.max(0, rows.length - 1)}개 팀 행이 포함되었습니다.`, "success", 3200);
  if (currentProjectId) {
    void recordAuditLog(currentProjectId, "project_export_route_assignment_report", {
      source: "admin",
      filename,
      rowCount: Math.max(0, rows.length - 1),
    });
  }
}

function handleExportRouteIssuesReport() {
  const routeConfig = ensureRouteBuilderConfig();
  const projectId = resolveProjectId() || getDraftProjectId();
  if (!projectId) {
    showAdminToast("먼저 프로젝트 이름을 입력하거나 저장하세요.", "warn", 2800);
    return;
  }
  const rows = buildRouteIssueRows(projectId, routeConfig);
  const issueCount = Math.max(0, rows.length - 1);
  if (!issueCount) {
    showAdminToast("현재 문제팀이 없어 CSV를 만들지 않았습니다.", "success", 3000);
    return;
  }
  const filename = `${projectId}_team_assignment_issues_${new Date().toISOString().slice(0, 10)}.csv`;
  downloadCsv(filename, toCsv(rows));
  showAdminToast(`문제팀 CSV를 내려받았습니다. ${issueCount}개 팀 행이 포함되었습니다.`, "success", 3200);
  if (currentProjectId) {
    void recordAuditLog(currentProjectId, "project_export_route_issues_report", {
      source: "admin",
      filename,
      rowCount: issueCount,
    });
  }
}

function handleExportRouteStaffSheet() {
  const routeConfig = ensureRouteBuilderConfig();
  const projectId = resolveProjectId() || getDraftProjectId();
  if (!projectId) {
    showAdminToast("먼저 프로젝트 이름을 입력하거나 저장하세요.", "warn", 2800);
    return;
  }
  const rows = buildRouteStaffSheetRows(projectId, routeConfig);
  const filename = `${projectId}_staff_route_sheet_${new Date().toISOString().slice(0, 10)}.csv`;
  downloadCsv(filename, toCsv(rows));
  showAdminToast(`진행팀 최종 팀표 CSV를 내려받았습니다. ${Math.max(0, rows.length - 1)}개 팀 행이 포함되었습니다.`, "success", 3200);
  if (currentProjectId) {
    void recordAuditLog(currentProjectId, "project_export_route_staff_sheet", {
      source: "admin",
      filename,
      rowCount: Math.max(0, rows.length - 1),
    });
  }
}

async function handleCopyRouteStaffSheet() {
  const routeConfig = ensureRouteBuilderConfig();
  const projectId = resolveProjectId() || getDraftProjectId();
  if (!projectId) {
    showAdminToast("먼저 프로젝트 이름을 입력하거나 저장하세요.", "warn", 2800);
    return;
  }
  try {
    if (!navigator.clipboard?.writeText) throw new Error("clipboard-unavailable");
    const text = buildRouteStaffSheetCopyText(projectId, routeConfig);
    await navigator.clipboard.writeText(text);
    showAdminToast("진행팀 최종 팀표를 클립보드에 복사했습니다.", "success", 2800);
  } catch (error) {
    console.error(error);
    showAdminToast("클립보드 복사에 실패했습니다. 브라우저 권한을 확인하세요.", "error", 3200);
  }
}

function fillSelectedRouteColumn() {
  if (!Number.isFinite(activeRoutePreview.routeIndex) || activeRoutePreview.routeIndex < 0) {
    showAdminToast("먼저 일괄 입력할 타임 셀을 하나 선택하세요.", "warn", 2600);
    return;
  }
  const fillKey = String(elements.routeColumnFillInput?.value || "").trim().toUpperCase();
  if (!fillKey) {
    showAdminToast("일괄 입력할 공통 미션 키를 입력하세요. 예: A", "warn", 2600);
    return;
  }
  const routeConfig = ensureRouteBuilderConfig();
  if (!routeConfig.missionLibrary?.[fillKey]) {
    showAdminToast(`공통 미션 라이브러리에 ${fillKey} 키가 없습니다.`, "warn", 2800);
    return;
  }
  const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
  for (let teamNumber = 1; teamNumber <= teamCount; teamNumber += 1) {
    const teamId = `Team${teamNumber}`;
    routeConfig.routes[teamId] = routeConfig.routes[teamId] || [];
    routeConfig.routes[teamId][activeRoutePreview.routeIndex] = fillKey;
  }
  renderRouteBuilder();
  markRouteBuilderDirty();
  showAdminToast(`${activeRoutePreview.routeIndex + 1}타임 열을 ${fillKey}로 일괄 입력했습니다.`, "success", 2800);
}

function handleRouteMatrixPaste(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.matches(".route-matrix-input")) return;
  const rawText = event.clipboardData?.getData("text/plain") || "";
  if (!rawText.trim()) return;
  event.preventDefault();
  const startTeamId = String(target.dataset.teamId || "");
  const startRouteIndex = Number(target.dataset.routeIndex);
  if (!startTeamId || !Number.isFinite(startRouteIndex)) return;
  const startTeamNumber = Number(startTeamId.replace("Team", "")) || 1;
  const routeConfig = ensureRouteBuilderConfig();
  const rows = rawText
    .split(/\r?\n/)
    .map((line) => line.split("\t").map((value) => String(value || "").trim().toUpperCase()))
    .filter((cols) => cols.some(Boolean));
  if (!rows.length) return;
  const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
  let updatedCells = 0;
  rows.forEach((cols, rowOffset) => {
    const teamNumber = startTeamNumber + rowOffset;
    if (teamNumber > teamCount) return;
    const teamId = `Team${teamNumber}`;
    routeConfig.routes[teamId] = routeConfig.routes[teamId] || [];
    cols.forEach((value, colOffset) => {
      const routeIndex = startRouteIndex + colOffset;
      if (routeIndex >= Math.max(1, missionTotal - 2)) return;
      routeConfig.routes[teamId][routeIndex] = value;
      updatedCells += 1;
    });
  });
  activeRoutePreview = { teamId: startTeamId, routeIndex: startRouteIndex };
  renderRouteBuilder();
  markRouteBuilderDirty();
  showAdminToast(`배치표 ${updatedCells}칸을 붙여넣었습니다.`, "success", 2400);
}

async function handleRouteBuilderUpload(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.type !== "file" || !input.dataset.routeUpload) return;
  const file = input.files?.[0];
  if (!file) return;
  await applyRouteLibraryAssetUpload(
    file,
    input.dataset.routeUpload,
    input.dataset.routeKey || "",
    input.dataset.routeVariant || "base",
    input.dataset.routeStep || "",
  );
  input.value = "";
}

async function applyRouteLibraryAssetUpload(file, assetType = "mission", key = "", variant = "base", stepNumber = "") {
  if (!file) return;
  try {
    const url = await uploadRouteLibraryAsset(file, assetType, key, stepNumber);
    const routeConfig = ensureRouteBuilderConfig();
    if (assetType === "code") {
      const normalizedKey = normalizeCodeRouteToken(key);
      const missionNumber = Number(stepNumber) || Number(extractCodeVariantBase(normalizedKey));
      if (!missionNumber) throw new Error("Missing code mission number");
      if (normalizedKey.includes("-")) {
        routeConfig.codeVariants = routeConfig.codeVariants || {};
        routeConfig.codeVariants[missionNumber] = routeConfig.codeVariants[missionNumber] || {};
        const entry = routeConfig.codeVariants[missionNumber][normalizedKey]
          || createDefaultRouteCodeVariantEntry(String(missionNumber), missionNumber, Number(normalizedKey.split("-")[1]) || 1);
        if (variant === "rain") entry.rainImageUrl = url;
        else entry.imageUrl = url;
        routeConfig.codeVariants[missionNumber][normalizedKey] = entry;
      } else {
        const entry = routeConfig.codeLibrary[missionNumber] || createDefaultRouteCodeEntry(missionNumber);
        if (variant === "rain") entry.rainImageUrl = url;
        else entry.imageUrl = url;
        routeConfig.codeLibrary[missionNumber] = entry;
      }
    } else if (assetType === "mission") {
      const routeKey = String(key || "").trim().toUpperCase();
      const entry = routeConfig.missionLibrary[routeKey] || createDefaultRouteMissionEntry(routeKey);
      if (variant === "rain") entry.rainImageUrl = url;
      else entry.imageUrl = url;
      routeConfig.missionLibrary[routeKey] = entry;
    } else if (assetType === "outdoor-code" || assetType === "outdoor-mission") {
      const missionNumber = Number(stepNumber);
      const routeKey = String(key || "").trim().toUpperCase();
      routeConfig.outdoorAssets = routeConfig.outdoorAssets || {};
      routeConfig.outdoorAssets[missionNumber] = routeConfig.outdoorAssets[missionNumber] || {};
      const entry = routeConfig.outdoorAssets[missionNumber][routeKey] || createDefaultOutdoorAssetEntry(missionNumber, routeKey);
      if (assetType === "outdoor-code") entry.codeImageUrl = url;
      else entry.missionImageUrl = url;
      routeConfig.outdoorAssets[missionNumber][routeKey] = entry;
    }
    renderRouteBuilder();
    markRouteBuilderDirty();
    showAdminToast("공통 라이브러리 이미지를 업로드했습니다.", "success", 2400);
  } catch (error) {
    console.error(error);
    showAdminToast("공통 라이브러리 이미지 업로드 중 오류가 발생했습니다.", "error", 3200);
  }
}

async function handleRouteLibraryDrop(file, zone) {
  if (!zone?.dataset?.routeUploadDrop) return;
  await applyRouteLibraryAssetUpload(
    file,
    zone.dataset.routeUploadDrop,
    zone.dataset.routeKey || "",
    zone.dataset.routeVariant || "base",
    zone.dataset.routeStep || "",
  );
}

async function uploadRouteLibraryAsset(file, assetType = "mission", key = "", stepNumber = "") {
  const projectId = resolveProjectId() || getDraftProjectId();
  if (!projectId) throw new Error("Missing project id");
  const safeKey = [stepNumber ? `step${stepNumber}` : "", String(key || "asset")]
    .filter(Boolean)
    .join("-")
    .replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeName = `${Date.now()}-${file.name}`;
  const path = `projects/${projectId}/route-library/${assetType}/${safeKey}-${safeName}`;
  const storageRef = sRef(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

async function handleApplyRouteMatrix() {
  if (actionLocks.routeApply) return;
  const routeConfig = ensureRouteBuilderConfig();
  const invalidTeams = [];
  Object.entries(routeConfig.routes).forEach(([teamId, route]) => {
    route.forEach((key, index) => {
      if (!hasRouteAssetKey(routeConfig, key, index + 2)) {
        invalidTeams.push(`${formatMissionTeamLabel(teamId)} ${index + 1}타임(${key || "-"})`);
      }
      const codeKey = normalizeCodeRouteToken(routeConfig.codeRoutes?.[teamId]?.[index] || getDefaultCodeKeyForMissionNumber(index + 2)).trim().toUpperCase();
      if (!hasRouteCodeKey(routeConfig, codeKey, index + 2)) {
        invalidTeams.push(`${formatMissionTeamLabel(teamId)} ${index + 1}타임 코드(${codeKey || "-"})`);
      }
    });
  });
  if (invalidTeams.length) {
    showAdminToast(`정의되지 않은 미션 키가 있습니다: ${invalidTeams.slice(0, 3).join(", ")}`, "warn", 3800);
    return;
  }
  const routeIssues = analyzeRouteBuilder();
  if (routeIssues.length) {
    showAdminToast(`배치표 검증이 끝나지 않았습니다. ${routeIssues.length}팀의 중복/누락/타임 수를 먼저 확인하세요.`, "warn", 4200);
    return;
  }
  setActionBusy("routeApply", true);
  try {
    const generatedConfigs = buildGeneratedMissionConfigs();
    missionConfigs = generatedConfigs;
    const projectId = resolveProjectId();
    if (projectId && projectsCache[projectId]) {
      const updates = {};
      updates[`projects/${projectId}/routing`] = routeConfig;
      updates[`projects/${projectId}/teamOverrides`] = null;
      updates[`projects/${projectId}/meta/updatedAt`] = Date.now();
      Object.entries(generatedConfigs).forEach(([teamId, config]) => {
        updates[`projects/${projectId}/teams/${teamId}/config/missions`] = normalizeMissionConfig(config);
      });
      await update(ref(db), updates);
      await recordAuditLog(projectId, "project_route_apply", {
        teamCount: Object.keys(generatedConfigs).length,
        missionTotal,
        keys: routeConfig.missionKeys,
      });
      projectsCache[projectId].routing = normalizeRouteBuilderConfig(routeConfig);
      projectsCache[projectId].teamOverrides = null;
      projectsCache[projectId].teams = projectsCache[projectId].teams || {};
      Object.entries(generatedConfigs).forEach(([teamId, config]) => {
        projectsCache[projectId].teams[teamId] = projectsCache[projectId].teams[teamId] || {};
        projectsCache[projectId].teams[teamId].config = projectsCache[projectId].teams[teamId].config || {};
        projectsCache[projectId].teams[teamId].config.missions = normalizeMissionConfig(config);
      });
    }
    renderMissionOverview();
    renderLaunchReadiness();
    renderStartGatePanel();
    renderSetupRoadmap();
    routeApplyNeeded = false;
    routeBuilderInferred = false;
    renderSaveState();
    renderCurrentProjectBar();
    syncActionAvailability();
    showAdminToast("배치표 기준으로 팀별 미션 설정을 생성했습니다. 예외는 각 팀의 개별 수정에서 처리하세요.", "success", 3800);
  } catch (error) {
    console.error(error);
    showAdminToast("배치표 적용 중 오류가 발생했습니다.", "error", 3600);
  } finally {
    setActionBusy("routeApply", false);
  }
}

async function handleSaveProject() {
  if (actionLocks.save) return;
  const projectName = elements.projectNameInput.value.trim();
  const masterPassword = elements.masterPasswordInput.value.trim();
  const validation = validateProjectForm();
  if (!validation.ok) {
    showAdminToast(validation.message, "warn", 3200);
    return;
  }
  const previousTab = activeAdminTab;
  const projectId = currentProjectId || generateProjectId(projectName);

  const now = Date.now();
  const previousMeta = projectsCache[projectId]?.meta || {};
  const resolvedStatus = elements.projectStatusInput?.value || projectsCache[projectId]?.meta?.status || "planned";
  const educationDate = parseDateInput(elements.startDateInput.value);
  const nextEndAt = parseDateTimeLocal(elements.endDateInput.value);
  const nextPhotoApprovalPasswordInput = elements.photoApprovalPasswordInput?.value.trim() || "";
  const nextPhotoApprovalPasswordHash = nextPhotoApprovalPasswordInput
    ? await hashSecret(nextPhotoApprovalPasswordInput)
    : previousMeta.photoApprovalPasswordHash || (
        previousMeta.photoApprovalPassword
          ? await hashSecret(previousMeta.photoApprovalPassword)
          : ""
      );
  const meta = {
    id: projectId,
    name: projectName || masterPassword,
    masterPassword,
    adminBypassCode: elements.adminBypassCodeInput?.value.trim() || "",
    photoApprovalPassword: "",
    photoApprovalPasswordHash: nextPhotoApprovalPasswordHash,
    educationDate,
    startAt: null,
    endAt: nextEndAt,
    organizer: elements.organizerInput.value.trim(),
    venue: elements.venueInput.value.trim(),
    participantCount: Number(elements.participantInput.value) || 0,
    loginTitle: elements.loginTitleInput?.value.trim() || "",
    loginSubtitle: elements.loginSubtitleInput?.value.trim() || "",
    loginNotice: elements.loginNoticeInput?.value.trim() || "",
    finishNotice: elements.finishNoticeInput?.value.trim() || "",
    loginUnlockLabel: elements.loginUnlockLabelInput?.value.trim() || "",
    loginTeamButtonLabel: elements.loginTeamButtonLabelInput?.value.trim() || "",
    loginTheme: elements.loginThemeInput?.value || "midnight",
    loginBackgroundUrl: metaLoginBackgroundUrl || "",
    teamCount: Number(elements.teamCountInput.value) || defaultTeamCount,
    missionTotal,
    rainMode: elements.rainModeInput?.checked === true,
    weatherMode: elements.rainModeInput?.checked === true ? "rain" : "normal",
    hideTeamChat: elements.hideTeamChatInput?.checked === true,
    hideTeamPhoto: elements.hideTeamPhotoInput?.checked === true,
    mode: getSelectedRouteMode(),
    status: resolvedStatus,
    logoUrl: metaLogoUrl || "",
    loginLogoUrl: metaLogoUrl || "",
    dashboardLogoUrl: metaLogoUrl || "",
    updatedAt: now,
    createdAt: projectsCache[projectId]?.meta?.createdAt || now,
  };

  const teams = collectTeamProfiles();
  teamProfiles = { ...teams };
  const teamOverrides = buildTeamOverrides();

  const updates = {
    [`projects/${projectId}/meta`]: meta,
    [`projects/${projectId}/routing`]: ensureRouteBuilderConfig(),
    [`projects/${projectId}/teamOverrides`]: Object.keys(teamOverrides).length ? teamOverrides : null,
  };
  const countdownPayload = buildCountdownPayload(meta);
  updates[`projects/${projectId}/countdown`] = countdownPayload || null;

  Object.entries(teams).forEach(([teamId, profile]) => {
    updates[`projects/${projectId}/teams/${teamId}/profile`] = profile;
    if (missionConfigs[teamId]) {
      updates[`projects/${projectId}/teams/${teamId}/config/missions`] = normalizeMissionConfig(missionConfigs[teamId]);
    }
    if (!projectsCache[projectId]?.teams?.[teamId]?.missions) {
      updates[`projects/${projectId}/teams/${teamId}/missions`] = createDefaultMissionState(missionTotal);
    }
  });

  const existingTeams = Object.keys(projectsCache[projectId]?.teams || {});
  const removedTeams = existingTeams.filter((teamId) => !teams[teamId]);
  if (removedTeams.length > 0) {
    const activeTeams = removedTeams.filter((teamId) => hasTeamActivity(projectsCache[projectId]?.teams?.[teamId]));
    const warningMessage = activeTeams.length > 0
      ? `${activeTeams.join(", ")}의 진행 데이터가 삭제됩니다. 계속할까요?`
      : `${removedTeams.join(", ")} 팀이 삭제됩니다. 계속할까요?`;
    const confirmed = await requestAdminConfirm("팀 삭제 확인", warningMessage, "계속");
    if (!confirmed) {
      return;
    }
  }
  existingTeams.forEach((teamId) => {
    if (!teams[teamId]) {
      updates[`projects/${projectId}/teams/${teamId}`] = null;
    }
  });

  try {
    setActionBusy("save", true);
    await update(ref(db), updates);
    await recordAuditLog(projectId, "project_save", {
      source: "admin",
      status: resolvedStatus,
      teamCount: meta.teamCount,
      missionTotal,
      removedTeams,
    });
    currentProjectId = projectId;
    persistLastProjectId(projectId);
    projectsCache[projectId] = projectsCache[projectId] || {};
    projectsCache[projectId].meta = meta;
    projectsCache[projectId].routing = ensureRouteBuilderConfig();
    projectsCache[projectId].teamOverrides = Object.keys(teamOverrides).length ? teamOverrides : null;
    projectsCache[projectId].teams = projectsCache[projectId].teams || {};
    Object.entries(teams).forEach(([teamId, profile]) => {
      projectsCache[projectId].teams[teamId] = projectsCache[projectId].teams[teamId] || {};
      projectsCache[projectId].teams[teamId].profile = profile;
      if (missionConfigs[teamId]) {
        projectsCache[projectId].teams[teamId].config = projectsCache[projectId].teams[teamId].config || {};
        projectsCache[projectId].teams[teamId].config.missions = normalizeMissionConfig(missionConfigs[teamId]);
      }
    });
    refreshProjectIdField();
    if (elements.photoApprovalPasswordInput) {
      elements.photoApprovalPasswordInput.value = "";
      elements.photoApprovalPasswordInput.placeholder = nextPhotoApprovalPasswordHash
        ? "설정됨 · 변경할 때만 새 비밀번호 입력"
        : "휴대폰 승인 전용 비밀번호";
    }
    markSaved("project", now);
    renderAnnouncementTargets();
    subscribeOpsTimeline(projectId);
    renderProjectChecklist();
    renderProjectSummary();
    renderRouteBuilder();
    renderMissionOverview();
    renderSetupRoadmap();
    renderLaunchReadiness();
    renderStartGatePanel();
    renderRehearsalPanel();
    const nextHint = getProjectNextActionHint();
    const nextTab = getProjectNextTab();
    showAdminToast(`프로젝트가 저장되었습니다. ${nextHint}`, "success", 3800);
    if (previousTab === "basic" && nextTab !== "basic") {
      focusEditorTop(nextTab);
    }
    renderCurrentProjectBar();
  } catch (error) {
    console.error(error);
    showAdminToast("프로젝트 저장 중 오류가 발생했습니다.", "error", 3600);
  } finally {
    setActionBusy("save", false);
  }
}

function collectTeamProfiles() {
  const teams = {};
  const routeRows = Array.from(elements.routeMatrixBody?.querySelectorAll("tr[data-route-team]") || []);
  const sourceRows = routeRows.length ? routeRows : Array.from(elements.teamTableBody?.querySelectorAll("tr[data-team-id]") || []);
  sourceRows.forEach((row, index) => {
    const teamId = row.dataset.routeTeam || row.dataset.teamId;
    const passwordInput = row.querySelector(".route-team-password-input, input");
    const number = Number(String(teamId || "").replace("Team", "")) || index + 1;
    if (!teamId) return;
    teams[teamId] = {
      name: "",
      password: resolveTeamPassword(passwordInput?.value, number),
      number,
    };
  });
  return teams;
}

async function handleResetResults() {
  if (actionLocks.reset) return;
  const projectId = getProjectIdOrAlert("먼저 프로젝트를 선택하거나 저장하세요.");
  if (!projectId || !projectsCache[projectId]) {
    showAdminToast("먼저 프로젝트를 선택하거나 저장하세요.", "warn", 2800);
    return;
  }
  const confirmed = await requestAdminConfirm(
    "진행 결과 초기화",
    "모든 팀의 미션 진행, 업로드, 채팅 기록을 초기화합니다. 참가팀은 처음부터 다시 진행해야 합니다.",
    "초기화"
  );
  if (!confirmed) {
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
    setActionBusy("reset", true);
    await recordAuditLog(projectId, "project_reset_results", {
      source: "admin",
      teamsAffected: teams,
    });
    await update(ref(db), updates);
    showAdminToast("진행 결과를 초기화했습니다. 참가팀 상태를 다시 확인하세요.", "warn", 3600);
  } catch (error) {
    console.error(error);
    showAdminToast("초기화 중 오류가 발생했습니다.", "error", 3600);
  } finally {
    setActionBusy("reset", false);
  }
}

function handleExportResults() {
  if (actionLocks.export) return;
  const projectId = currentProjectId || Array.from(selectedProjects)[0];
  if (!projectId || !projectsCache[projectId]) {
    showAdminToast("결과를 내보낼 프로젝트를 먼저 선택하세요.", "warn", 2800);
    return;
  }

  try {
    setActionBusy("export", true);
    const project = projectsCache[projectId];
    const rows = buildResultsRows(projectId, project);
    const csv = toCsv(rows);
    const filename = `${projectId}_results_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCsv(filename, csv);
    showAdminToast(`결과 CSV를 내려받았습니다. ${Math.max(0, rows.length - 1)}개 팀 행이 포함되었습니다.`, "success", 3200);
    recordAuditLog(projectId, "project_export_results", {
      source: "admin",
      rowCount: Math.max(0, rows.length - 1),
      filename,
    });
  } finally {
    setActionBusy("export", false);
  }
}

async function handleExportOpsLogs() {
  if (actionLocks.exportOps) return;
  const projectId = currentProjectId || Array.from(selectedProjects)[0];
  if (!projectId) {
    showAdminToast("운영 로그를 내보낼 프로젝트를 먼저 선택하세요.", "warn", 2800);
    return;
  }

  try {
    setActionBusy("exportOps", true);
    const snapshot = await get(ref(db, `ops_logs/${projectId}`));
    const raw = snapshot.val() || {};
    const rows = [[
      "project_id",
      "log_id",
      "action",
      "action_label",
      "created_at",
      "created_at_local",
      "source",
      "team_id",
      "mission_id",
      "summary",
      "details_json",
    ]];
    Object.entries(raw)
      .sort(([, a], [, b]) => Number(a.createdAt || 0) - Number(b.createdAt || 0))
      .forEach(([logId, value]) => {
      const details = value.details || {};
      rows.push([
        projectId,
        logId,
        value.action || "",
        formatAuditActionLabel(value.action || ""),
        value.createdAt || "",
        value.createdAt ? formatAdminDateTime(value.createdAt) : "",
        details.source || "",
        details.teamId || "",
        details.missionId || "",
        summarizeAuditDetails(value.action || "", details),
        JSON.stringify(details),
      ]);
    });
    const filename = `${projectId}_ops_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCsv(filename, toCsv(rows));
    showAdminToast(`운영 로그 CSV를 내려받았습니다. ${Math.max(0, rows.length - 1)}개 로그가 포함되었습니다.`, "success", 3200);
    recordAuditLog(projectId, "project_export_ops_logs", {
      source: "admin",
      filename,
      rowCount: Math.max(0, rows.length - 1),
    });
  } catch (error) {
    console.error(error);
    showAdminToast("운영 로그 내보내기 중 오류가 발생했습니다.", "error", 3600);
  } finally {
    setActionBusy("exportOps", false);
  }
}

function handleExportOpsBundle() {
  const projectId = currentProjectId || Array.from(selectedProjects)[0];
  if (!projectId || !projectsCache[projectId]) {
    showAdminToast("종료 패키지를 만들 프로젝트를 먼저 선택하세요.", "warn", 2800);
    return;
  }
  handleExportResults();
  void handleExportOpsLogs();
  const nextParams = new URLSearchParams();
  nextParams.set("project", projectId);
  const hqUrl = buildPageUrl("hq.html", nextParams);
  showAdminToast("결과/운영 로그를 저장했습니다. HQ에서 사진 CSV와 다운로드 스크립트를 이어서 저장하세요.", "success", 4200);
  window.open(hqUrl, "_blank");
}

async function handleFinishProject() {
  if (actionLocks.finish) return;
  const projectId = currentProjectId || Array.from(selectedProjects)[0];
  if (!projectId || !projectsCache[projectId]) {
    showAdminToast("종료할 프로젝트를 먼저 선택하세요.", "warn", 2800);
    return;
  }
  const project = projectsCache[projectId];
  const projectName = project.meta?.name || projectId;
  const confirmed = await requestAdminConfirm(
    "프로젝트 종료",
    `${projectName} 프로젝트를 종료 상태로 전환합니다. 참가팀은 새로 입장할 수 없고 종료 시각도 현재 시점으로 정리될 수 있습니다.`,
    "종료"
  );
  if (!confirmed) {
    return;
  }

  const updates = {
    [`projects/${projectId}/meta/status`]: "finished",
  };
  if (!project.meta?.endAt || project.meta.endAt > Date.now()) {
    updates[`projects/${projectId}/meta/endAt`] = Date.now();
    updates[`projects/${projectId}/countdown`] = null;
  }

  try {
    setActionBusy("finish", true);
    await update(ref(db), updates);
    await recordAuditLog(projectId, "project_finish", {
      source: "admin",
      projectName,
    });
    showAdminToast("프로젝트를 종료 상태로 전환했습니다. 참가팀 재입장 여부와 결과 export를 확인하세요.", "warn", 4200);
  } catch (error) {
    console.error(error);
    showAdminToast("프로젝트 종료 중 오류가 발생했습니다.", "error", 3600);
  } finally {
    setActionBusy("finish", false);
  }
}

function toDateTimeInputValue(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

function toDateInputValue(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
}

function parseDateInput(value) {
  const text = String(value || "").trim();
  return text || "";
}

function parseDateTimeLocal(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getTime();
}

function validateProjectForm() {
  return { ok: true, message: "" };
}

function renderProjectChecklist() {
  if (!elements.projectChecklist) return;
  const teams = collectTeamProfiles();
  const educationDate = parseDateInput(elements.startDateInput.value);
  const endAt = parseDateTimeLocal(elements.endDateInput.value);
  const duplicatePasswords = findDuplicateTeamPasswords(teams);
  const missionHealth = analyzeMissionConfiguration(Object.keys(teams));
  const checks = [
    {
      type: elements.projectNameInput.value.trim() ? "ok" : "error",
      text: elements.projectNameInput.value.trim()
        ? `프로젝트 이름이 설정되었습니다: ${elements.projectNameInput.value.trim()}`
        : "프로젝트 이름이 비어 있습니다.",
    },
    {
      type: currentProjectId ? "ok" : getDraftProjectId() ? "warn" : "warn",
      text: currentProjectId
        ? `고정 프로젝트 ID: ${currentProjectId}`
        : getDraftProjectId()
        ? `첫 저장 시 생성될 프로젝트 ID: ${getDraftProjectId()}`
        : "프로젝트 이름을 입력하면 저장 시 사용할 ID가 생성됩니다.",
    },
    {
      type: educationDate ? "ok" : "warn",
      text: educationDate
        ? `교육일이 기록되었습니다: ${formatAdminDate(educationDate)}`
        : "교육일은 메모용입니다. 필요하면 날짜만 기록하세요.",
    },
    {
      type: endAt && endAt > Date.now() ? "ok" : endAt ? "error" : "warn",
      text: endAt && endAt > Date.now()
        ? `운영 종료 시간이 설정되었습니다: ${formatAdminDateTime(endAt)}`
        : endAt
        ? "종료 일시를 다시 확인하세요."
        : "운영 종료 시간이 아직 설정되지 않았습니다.",
    },
    {
      type: duplicatePasswords.length === 0 ? "ok" : "error",
      text: duplicatePasswords.length === 0
        ? "팀 비밀번호 중복이 없습니다."
        : `중복 팀 비밀번호: ${duplicatePasswords.join(", ")}`,
    },
    {
      type: metaLogoUrl ? "ok" : "warn",
      text: metaLogoUrl ? "프로젝트 로고가 설정되었습니다." : "프로젝트 로고가 아직 없습니다.",
    },
    {
      type: missionHealth.placeholderCount === 0 ? "ok" : "warn",
      text: missionHealth.placeholderCount === 0
        ? "완전히 비어 있는 기본 미션이 없습니다."
        : `기본 상태 그대로인 미션 ${missionHealth.placeholderCount}개가 남아 있습니다.`,
    },
    {
      type: missionHealth.missingStepAnswers === 0 ? "ok" : "warn",
      text: missionHealth.missingStepAnswers === 0
        ? "정답/QR 입력이 필요한 단계 값이 모두 설정되었습니다."
        : `정답 또는 QR 값이 비어 있는 단계 ${missionHealth.missingStepAnswers}개`,
    },
    {
      type: missionHealth.missingPhotoSlots === 0 ? "ok" : "warn",
      text: missionHealth.missingPhotoSlots === 0
        ? "사진 승인 단계의 슬롯 수가 모두 설정되었습니다."
        : `사진 승인 단계인데 슬롯 수가 0인 미션 ${missionHealth.missingPhotoSlots}개`,
    },
    {
      type: missionHealth.missingCodeImages === 0 ? "ok" : "warn",
      text: missionHealth.missingCodeImages === 0
        ? "모든 코드 이미지가 설정되었습니다."
        : `코드 이미지 미설정 미션 ${missionHealth.missingCodeImages}개`,
    },
    {
      type: missionHealth.missingMissionImages === 0 ? "ok" : "warn",
      text: missionHealth.missingMissionImages === 0
        ? "모든 미션 이미지가 설정되었습니다."
        : `미션 이미지 미설정 미션 ${missionHealth.missingMissionImages}개`,
    },
  ];

  elements.projectChecklist.innerHTML = checks
    .map((item) => `<div class="admin-check-item admin-check-item--${item.type}">${item.text}</div>`)
    .join("");
}

function renderLaunchReadiness() {
  if (!elements.launchReadinessBadge || !elements.launchReadinessList) return;
  const teams = collectTeamProfiles();
  const duplicatePasswords = findDuplicateTeamPasswords(teams);
  const missionHealth = analyzeMissionConfiguration(Object.keys(teams));
  const endAt = parseDateTimeLocal(elements.endDateInput.value);
  const status = elements.projectStatusInput?.value || "planned";

  const items = [
    {
      type: elements.projectNameInput.value.trim() ? "ready" : "risk",
      text: elements.projectNameInput.value.trim() ? "프로젝트 이름이 설정되었습니다." : "프로젝트 이름이 비어 있습니다.",
    },
    {
      type: endAt && endAt > Date.now() ? "ready" : "risk",
      text: endAt && endAt > Date.now() ? "운영 종료 시간이 정상 설정되었습니다." : "종료 시간을 다시 확인해야 합니다.",
    },
    {
      type: duplicatePasswords.length === 0 ? "ready" : "risk",
      text: duplicatePasswords.length === 0 ? "팀 비밀번호 중복이 없습니다." : `팀 비밀번호 중복이 있습니다: ${duplicatePasswords.join(", ")}`,
    },
    {
      type: missionHealth.placeholderCount === 0 ? "ready" : "warn",
      text: missionHealth.placeholderCount === 0 ? "기본값 상태 미션이 남아 있지 않습니다." : `기본 상태 그대로인 미션 ${missionHealth.placeholderCount}개가 남아 있습니다.`,
    },
    {
      type: missionHealth.missingStepAnswers === 0 && missionHealth.missingPhotoSlots === 0 ? "ready" : "warn",
      text: missionHealth.missingStepAnswers === 0 && missionHealth.missingPhotoSlots === 0
        ? `단계별 입력값이 준비되었습니다. QR ${missionHealth.qrStepCount}개 · HQ ${missionHealth.hqStepCount}개 · 사진 ${missionHealth.photoStepCount}개`
        : `정답/QR 누락 ${missionHealth.missingStepAnswers}개 · 사진 슬롯 누락 ${missionHealth.missingPhotoSlots}개`,
    },
    {
      type: missionHealth.legacyMissionCount === 0 ? "ready" : "warn",
      text: missionHealth.legacyMissionCount === 0
        ? "미션 설정이 최신 단계형 구조로 저장되어 있습니다."
        : `기존 형식 미션 ${missionHealth.legacyMissionCount}개가 남아 있습니다. 관리자에서 프로젝트를 다시 저장해 최신 구조로 맞추는 것을 권장합니다.`,
    },
    {
      type: missionHealth.missingCodeImages === 0 && missionHealth.missingMissionImages === 0 ? "ready" : "warn",
      text: missionHealth.missingCodeImages === 0 && missionHealth.missingMissionImages === 0
        ? "미션 이미지가 모두 설정되었습니다."
        : `코드 이미지 ${missionHealth.missingCodeImages}개, 미션 이미지 ${missionHealth.missingMissionImages}개가 비어 있습니다.`,
    },
    {
      type: hasPhotoApproveSecret() ? "ready" : "warn",
      text: hasPhotoApproveSecret()
        ? "모바일 사진 승인 비밀번호가 설정되었습니다."
        : "모바일 사진 승인 비밀번호가 비어 있습니다. 현장 휴대폰 승인용이면 설정을 권장합니다.",
    },
    {
      type: routeApplyNeeded ? "warn" : "ready",
      text: routeApplyNeeded
        ? "공통 코드/공통 미션/팀 배치표 변경이 아직 팀별 미션 설정에 반영되지 않았습니다. 배치표 적용이 필요합니다."
        : "공통 코드/공통 미션/팀 배치표가 팀별 미션 설정에 반영되어 있습니다.",
    },
    {
      type: routeBuilderInferred ? "warn" : "ready",
      text: routeBuilderInferred
        ? "이 프로젝트는 기존 팀별 미션에서 배치표를 추정해 표시 중입니다. 저장 후 배치표 적용으로 새 구조를 확정하세요."
        : "배치표 구조가 확정 저장되어 있습니다.",
    },
    {
      type: status === "running" ? "ready" : "warn",
      text: status === "running"
        ? "현재 상태는 진행중입니다."
        : status === "planned"
          ? "현재 상태는 준비중입니다. 시작 직전에 진행중으로 전환하세요."
          : "현재 상태는 종료입니다. 재사용 전 상태를 다시 조정하세요.",
    },
  ];

  const hasRisk = items.some((item) => item.type === "risk");
  const hasWarn = items.some((item) => item.type === "warn");
  const state = hasRisk ? "risk" : hasWarn ? "warn" : "ready";
  elements.launchReadinessBadge.dataset.state = state;
  elements.launchReadinessBadge.textContent =
    state === "ready" ? "시작 가능" : state === "warn" ? "주의 필요" : "보완 필요";
  elements.launchReadinessList.innerHTML = items
    .map((item) => `<div class="readiness-item readiness-item--${item.type}">${item.text}</div>`)
    .join("");
}

function getStartGateReport() {
  const teams = collectTeamProfiles();
  const duplicatePasswords = findDuplicateTeamPasswords(teams);
  const missionHealth = analyzeMissionConfiguration(Object.keys(teams));
  const endAt = parseDateTimeLocal(elements.endDateInput.value);
  const hasSavedProject = !!resolveProjectId();
  const hasPhotoMission = missionHealth.photoStepCount > 0;
  const fatalItems = [];
  const warnItems = [];

  if (!hasSavedProject) fatalItems.push("프로젝트를 먼저 저장해야 합니다.");
  if (!elements.projectNameInput?.value.trim()) fatalItems.push("프로젝트 이름이 비어 있습니다.");
  if (!endAt || endAt <= Date.now()) fatalItems.push("종료 시간이 올바르지 않습니다.");
  if (duplicatePasswords.length) fatalItems.push(`팀 비밀번호 중복: ${duplicatePasswords.join(", ")}`);
  if (routeApplyNeeded) fatalItems.push("배치표 변경 사항이 팀별 미션에 아직 적용되지 않았습니다.");
  if (routeBuilderInferred) fatalItems.push("배치표가 아직 추정 상태입니다. 저장 후 배치표 적용이 필요합니다.");
  if (missionHealth.missingStepAnswers > 0) fatalItems.push(`정답 또는 QR 값 누락 ${missionHealth.missingStepAnswers}개`);
  if (missionHealth.missingPhotoSlots > 0) fatalItems.push(`사진 슬롯 누락 ${missionHealth.missingPhotoSlots}개`);

  if (!metaLogoUrl) warnItems.push("프로젝트 로고가 비어 있습니다.");
  if (missionHealth.placeholderCount > 0) warnItems.push(`기본값 상태 미션 ${missionHealth.placeholderCount}개`);
  if (missionHealth.missingCodeImages > 0) warnItems.push(`코드 이미지 누락 ${missionHealth.missingCodeImages}개`);
  if (missionHealth.missingMissionImages > 0) warnItems.push(`미션 이미지 누락 ${missionHealth.missingMissionImages}개`);
  if (hasPhotoMission && !hasPhotoApproveSecret()) warnItems.push("사진 승인 비밀번호가 비어 있습니다.");
  if (hasPhotoMission && !currentProjectId) warnItems.push("프로젝트 저장 후 사진 업로드 예시 링크를 다시 확인하세요.");

  return {
    ok: fatalItems.length === 0,
    fatalItems,
    warnItems,
  };
}

function renderStartGatePanel() {
  if (!elements.startGateBadge || !elements.startGateList) return;
  const report = getStartGateReport();
  const state = report.fatalItems.length ? "risk" : report.warnItems.length ? "warn" : "ready";
  elements.startGateBadge.dataset.state = state;
  elements.startGateBadge.textContent =
    state === "ready" ? "통과" : state === "warn" ? "주의" : "차단";
  const rows = [];
  if (!report.fatalItems.length && !report.warnItems.length) {
    rows.push(`<div class="readiness-item readiness-item--ready">운영 시작 게이트를 통과했습니다. ` +
      `프로젝트 상태를 \`진행중\`으로 바꿔도 됩니다.</div>`);
  }
  report.fatalItems.forEach((text) => {
    rows.push(`<div class="readiness-item readiness-item--risk">${text}</div>`);
  });
  report.warnItems.forEach((text) => {
    rows.push(`<div class="readiness-item readiness-item--warn">${text}</div>`);
  });
  elements.startGateList.innerHTML = rows.join("");
}

function handleRunStartGate() {
  renderStartGatePanel();
  const report = getStartGateReport();
  if (report.ok) {
    showAdminToast("운영 시작 게이트를 통과했습니다.", "success", 2800);
  } else {
    showAdminToast("운영 시작 전에 먼저 막힌 항목을 해결하세요.", "warn", 3200);
  }
}

function renderRehearsalPanel() {
  if (!elements.rehearsalBadge || !elements.rehearsalInfo) return;
  const projectId = resolveProjectId();
  const teamCount = Number(elements.teamCountInput?.value) || defaultTeamCount;
  const missionCount = Number(elements.missionCountInput?.value) || missionTotal;
  let samplePhotoMission = null;
  for (let teamNumber = 1; teamNumber <= teamCount && !samplePhotoMission; teamNumber++) {
    const teamId = `Team${teamNumber}`;
    const config = ensureMissionConfig(teamId);
    for (let missionNumber = 1; missionNumber <= missionCount; missionNumber++) {
      const mission = config[missionNumber] || {};
      if ((Number(mission.photoSlots) || 0) > 0 || (Number(mission.specialSlots) || 0) > 0) {
        samplePhotoMission = `${teamId} · M${missionNumber}`;
        break;
      }
    }
  }

  const items = [
    {
      type: projectId ? "ready" : "warn",
      text: projectId ? `현재 프로젝트 ID: ${projectId}` : "프로젝트를 먼저 저장해야 리허설 링크를 만들 수 있습니다.",
    },
    {
      type: "ready",
      text: "팀 로그인 테스트는 별도 세션 없이 새 창에서 바로 확인할 수 있습니다.",
    },
    {
      type: projectId ? "ready" : "warn",
      text: projectId
        ? "모바일 사진 승인 링크는 복사 버튼으로 현장 휴대폰에 바로 전달할 수 있습니다."
        : "모바일 사진 승인 링크는 프로젝트 저장 후 만들 수 있습니다.",
    },
    {
      type: samplePhotoMission ? "ready" : "warn",
      text: samplePhotoMission
        ? `사진 업로드 예시 링크 대상: ${samplePhotoMission}`
        : "현재 설정된 사진 미션이 없어 업로드 예시 링크를 만들 수 없습니다.",
    },
  ];
  const state = !projectId ? "warn" : samplePhotoMission ? "ready" : "warn";
  elements.rehearsalBadge.dataset.state = state;
  elements.rehearsalBadge.textContent = state === "ready" ? "준비됨" : "확인 필요";
  elements.rehearsalInfo.innerHTML = items
    .map((item) => `<div class="readiness-item readiness-item--${item.type}">${item.text}</div>`)
    .join("");
  if (elements.copyPhotoUploadLinkBtn) {
    elements.copyPhotoUploadLinkBtn.disabled = !projectId || !samplePhotoMission;
  }
  if (elements.teamLoginQrPanel && !projectId) {
    elements.teamLoginQrPanel.hidden = true;
  }
  if (elements.photoApproveQrPanel && !projectId) {
    elements.photoApproveQrPanel.hidden = true;
  }
}

function renderTeamLoginQr(projectId) {
  if (!elements.teamLoginQrPanel || !elements.teamLoginQrImage || !elements.teamLoginQrMeta) return;
  const teamLoginUrl = buildPageUrl(
    "team_login.html",
    new URLSearchParams({ project: projectId })
  );
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(teamLoginUrl)}`;
  elements.teamLoginQrPanel.hidden = false;
  elements.teamLoginQrImage.src = qrUrl;
  elements.teamLoginQrImage.classList.remove("hidden");
  elements.teamLoginQrMeta.textContent = "휴대폰 카메라로 스캔하면 프로젝트를 거치지 않고 바로 팀 로그인 화면으로 들어갑니다.";
}

function renderPhotoApproveQr(projectId) {
  if (!elements.photoApproveQrPanel || !elements.photoApproveQrImage || !elements.photoApproveQrMeta) return;
  const mobileApproveUrl = buildPageUrl(
    "photo_approve.html",
    new URLSearchParams({ project: projectId })
  );
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(mobileApproveUrl)}`;
  elements.photoApproveQrPanel.hidden = false;
  elements.photoApproveQrImage.src = qrUrl;
  elements.photoApproveQrImage.classList.remove("hidden");
  elements.photoApproveQrMeta.textContent = "휴대폰 카메라로 스캔해 모바일 승인 화면을 바로 열 수 있습니다.";
}

function findDuplicateTeamPasswords(teams = {}) {
  const seen = new Map();
  const duplicates = new Set();
  Object.entries(teams).forEach(([teamId, team]) => {
    const password = team.password || "";
    if (!password) return;
    if (seen.has(password)) {
      duplicates.add(teamId);
      duplicates.add(seen.get(password));
      return;
    }
    seen.set(password, teamId);
  });
  return Array.from(duplicates);
}

function analyzeMissionConfiguration(teamIds = []) {
  let placeholderCount = 0;
  let missingCodeImages = 0;
  let missingMissionImages = 0;
  let missingStepAnswers = 0;
  let missingPhotoSlots = 0;
  let qrStepCount = 0;
  let hqStepCount = 0;
  let photoStepCount = 0;
  let legacyMissionCount = 0;

  teamIds.forEach((teamId) => {
    const config = ensureMissionConfig(teamId);
    for (let i = 1; i <= missionTotal; i++) {
      const sourceMission = config[i] || {};
      const mission = normalizeMissionEntry(config[i] || {});
      const codeStep = getStepConfig(mission, "codeStep");
      const missionStep = getStepConfig(mission, "missionStep");
      if (!sourceMission.codeStep || !sourceMission.missionStep) {
        legacyMissionCount += 1;
      }
      const hasDefaultAnswers =
        (mission.codeAnswer || "1") === "1" &&
        (mission.missionAnswer || "1") === "1";
      const hasNoImages = !mission.codeImageUrl && !mission.missionImageUrl;
      if (hasDefaultAnswers && hasNoImages) {
        placeholderCount += 1;
      }
      if ((codeStep.mode === STEP_MODES.ANSWER || codeStep.mode === STEP_MODES.QR) && String(codeStep.answer || "1").trim() === "1") {
        missingStepAnswers += 1;
      }
      if ((missionStep.mode === STEP_MODES.ANSWER || missionStep.mode === STEP_MODES.QR) && String(missionStep.answer || "1").trim() === "1") {
        missingStepAnswers += 1;
      }
      if (codeStep.mode === STEP_MODES.QR) qrStepCount += 1;
      if (missionStep.mode === STEP_MODES.QR) qrStepCount += 1;
      if (codeStep.mode === STEP_MODES.HQ) hqStepCount += 1;
      if (missionStep.mode === STEP_MODES.HQ) hqStepCount += 1;
      if (missionStep.mode === STEP_MODES.PHOTO_HQ) {
        photoStepCount += 1;
        const photoConfig = getPhotoConfigFromMission(mission);
        if ((photoConfig.photoSlots || 0) + (photoConfig.specialSlots || 0) <= 0) {
          missingPhotoSlots += 1;
        }
      }
      if (!mission.codeImageUrl) {
        missingCodeImages += 1;
      }
      if (!mission.missionImageUrl) {
        missingMissionImages += 1;
      }
    }
  });

  return {
    placeholderCount,
    missingCodeImages,
    missingMissionImages,
    missingStepAnswers,
    missingPhotoSlots,
    qrStepCount,
    hqStepCount,
    photoStepCount,
    legacyMissionCount,
  };
}

function hasTeamActivity(team = {}) {
  const missions = team?.missions || {};
  return Object.values(missions).some((entry) => entry?.stage && entry.stage !== "locked" && entry.stage !== "code");
}

function renderProjectSummary() {
  if (!elements.projectSummary) return;
  if (!currentProjectId || !projectsCache[currentProjectId]) {
    elements.projectSummary.innerHTML = `<div class="admin-summary__empty">프로젝트를 선택하면 운영 요약이 표시됩니다.</div>`;
    return;
  }

  const project = projectsCache[currentProjectId];
  const teams = Object.values(project.teams || {});
  const totalTeams = teams.length || Number(project.meta?.teamCount) || 0;
  const missionCount = Number(project.meta?.missionTotal) || missionTotal || 0;
  let startedTeams = 0;
  let completedTeams = 0;
  let progressSum = 0;
  let hqPendingTeams = 0;
  let delayPendingTeams = 0;

  teams.forEach((team) => {
    const missions = team.missions || {};
    const completed = Object.values(missions).filter((entry) => entry?.stage === "done").length;
    const hasHQPending = Object.values(missions).some((entry) => entry?.stepStatus === "awaiting_hq");
    const hasDelayPending = Object.values(missions).some((entry) => entry?.stepStatus === "delay");
    if (completed > 0) startedTeams += 1;
    if (missionCount > 0 && completed >= missionCount) completedTeams += 1;
    if (hasHQPending) hqPendingTeams += 1;
    if (hasDelayPending) delayPendingTeams += 1;
    progressSum += missionCount > 0 ? completed / missionCount : 0;
  });

  const projectUploads = uploadsMetaCache[currentProjectId] || {};
  let photoPendingTeams = 0;
  Object.entries(projectUploads).forEach(([, missions]) => {
    const hasPending = Object.values(missions || {}).some((slots) =>
      Object.values(slots || {}).some((item) => item?.status === "pending" || item?.status === "retry")
    );
    if (hasPending) photoPendingTeams += 1;
  });

  const averageProgress = totalTeams > 0 ? Math.round((progressSum / totalTeams) * 100) : 0;
  const cards = [
    {
      label: "참가 팀",
      value: totalTeams,
      meta: `설정 미션 ${missionCount}개`,
    },
    {
      label: "진행 시작 팀",
      value: startedTeams,
      meta: `${totalTeams > 0 ? Math.round((startedTeams / totalTeams) * 100) : 0}% 진행 시작`,
    },
    {
      label: "완료 팀",
      value: completedTeams,
      meta: `${totalTeams > 0 ? Math.round((completedTeams / totalTeams) * 100) : 0}% 완주`,
    },
    {
      label: "사진 대기 팀",
      value: photoPendingTeams,
      meta: `평균 진행률 ${averageProgress}%`,
    },
    {
      label: "HQ 대기 팀",
      value: hqPendingTeams,
      meta: "일반 HQ 승인 또는 검수 대기",
    },
    {
      label: "자동 이동 대기",
      value: delayPendingTeams,
      meta: "승인 후 시간 경과 대기 중",
    },
  ];

  elements.projectSummary.innerHTML = cards
    .map(
      (card) => `
        <div class="admin-summary__card">
          <div class="admin-summary__label">${card.label}</div>
          <div class="admin-summary__value">${card.value}</div>
          <div class="admin-summary__meta">${card.meta}</div>
        </div>
      `
    )
    .join("");
}

function buildCountdownPayload(meta = {}) {
  if (!meta.endAt) return null;
  const now = Date.now();
  const duration = Math.max(1, Math.floor((meta.endAt - now) / 1000));
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return {
    startAt: now,
    duration,
  };
}

function formatAdminDate(value) {
  if (!value) return "-";
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split("-");
    return `${month}. ${day}.`;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  });
}

function formatAdminDateTime(timestamp) {
  return new Date(timestamp).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function buildResultsRows(projectId, project = {}) {
  const meta = project.meta || {};
  const teams = Object.entries(project.teams || {});
  const ranked = teams
    .map(([teamId, teamData], index) => {
      const missions = teamData.missions || {};
      const total = Number(meta.missionTotal) || Object.keys(missions).length || missionTotal;
      const completed = Object.values(missions).filter((entry) => entry?.stage === "done").length;
      return {
        teamId,
        teamData,
        index,
        total,
        completed,
      };
    })
    .sort((a, b) => {
      if (b.completed !== a.completed) return b.completed - a.completed;
      const numberA = a.teamData.profile?.number || a.index + 1;
      const numberB = b.teamData.profile?.number || b.index + 1;
      return numberA - numberB;
    });
  const rows = [[
    "rank",
    "project_id",
    "project_name",
    "team_id",
    "team_number",
    "team_name",
    "completed_missions",
    "total_missions",
    "progress_percent",
    "status",
    "current_mission",
    "photo_pending",
  ]];

  ranked.forEach(({ teamId, teamData, index, total, completed }, rankIndex) => {
    const missions = teamData.missions || {};
    const status = completed >= total ? "finished" : completed > 0 ? "running" : "not_started";
    const currentMission = Object.entries(missions).find(([, entry]) => entry?.stage === "code" || entry?.stage === "mission");
    const photoPending = Object.values(uploadsMetaCache[projectId]?.[teamId] || {}).some((slots) =>
      Object.values(slots || {}).some((item) => item?.status === "pending" || item?.status === "retry")
    );
    rows.push([
      rankIndex + 1,
      projectId,
      meta.name || projectId,
      teamId,
      teamData.profile?.number || index + 1,
      teamData.profile?.name || "",
      completed,
      total,
      total ? Math.round((completed / total) * 100) : 0,
      status,
      currentMission ? Number(currentMission[0]) : "",
      photoPending ? "yes" : "no",
    ]);
  });

  return rows;
}

function formatAuditActionLabel(action = "") {
  const labels = {
    project_save: "프로젝트 저장",
    project_normalize_mission_schema: "미션 구조 최신화",
    project_clone: "프로젝트 복제",
    project_delete: "프로젝트 삭제",
    project_reset_results: "결과 초기화",
    project_export_results: "결과 CSV",
    project_export_ops_logs: "운영 로그 CSV",
    project_export_route_matrix: "배치표 CSV",
    project_export_route_assignment_report: "팀배치표 리포트 CSV",
    project_export_route_issues_report: "문제팀 CSV",
    project_finish: "프로젝트 종료",
    announcement_broadcast: "전체 공지",
    announcement_team: "팀 공지",
    mission_bypass: "특별 코드 통과",
    hq_team_reset: "팀 리셋",
    hq_step_approve: "HQ 단계 승인",
    hq_photo_approve: "사진 승인",
    hq_photo_retry: "재도전 요청",
  };
  return labels[action] || action;
}

function summarizeAuditDetails(action = "", details = {}) {
  switch (action) {
    case "project_save":
      return `팀 ${details.teamCount || 0} · 미션 ${details.missionTotal || 0}`;
    case "project_clone":
      return `${details.fromProjectName || details.fromProjectId || ""}에서 복제`;
    case "project_delete":
      return details.projectName || "";
    case "project_reset_results":
      return `${Array.isArray(details.teamsAffected) ? details.teamsAffected.length : 0}팀 초기화`;
    case "project_finish":
      return details.projectName || "";
    case "project_export_route_assignment_report":
      return details.filename || "";
    case "project_export_route_issues_report":
      return details.filename || "";
    case "announcement_broadcast":
      return details.text || "";
    case "announcement_team":
      return `${details.teamId || ""} · ${details.text || ""}`;
    case "mission_bypass":
      return `${details.teamId || ""} · M${details.missionId || ""} · ${details.step === "codeStep" ? "코드" : "미션"}`;
    case "hq_team_reset":
      return `${details.teamLabel || details.teamId || ""}`;
    case "hq_step_approve":
      return `${details.teamLabel || details.teamId || ""} · M${details.missionId || ""} · ${details.step === "codeStep" ? "코드" : "미션"}`;
    case "hq_photo_approve":
      return `${details.teamLabel || details.teamId || ""} · M${details.missionId || ""}${details.delaySeconds ? ` · ${details.delaySeconds}초 후 이동` : ""}`;
    case "hq_photo_retry":
      return `${details.teamLabel || details.teamId || ""} · M${details.missionId || ""} · ${details.reason || ""}`;
    default:
      return "";
  }
}

function toCsv(rows = []) {
  return rows
    .map((row) =>
      row
        .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");
}

function downloadCsv(filename, contents) {
  const blob = new Blob(["\uFEFF", contents], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function appendAuditLog(projectId, action, details = {}) {
  if (!projectId) return;
  await push(ref(db, `ops_logs/${projectId}`), {
    action,
    details,
    createdAt: serverTimestamp(),
  });
}

async function recordAuditLog(projectId, action, details = {}) {
  try {
    await appendAuditLog(projectId, action, details);
  } catch (error) {
    console.warn(`Audit log skipped: ${action}`, error);
  }
}

function subscribeOpsTimeline(projectId) {
  if (typeof opsTimelineUnsubscribe === "function") {
    opsTimelineUnsubscribe();
    opsTimelineUnsubscribe = null;
  }
  if (opsTimelinePermissionDenied) {
    latestOpsTimelineItems = [];
    renderOpsTimelineEntries([]);
    return;
  }
  if (!projectId || !elements.opsTimeline || !elements.opsTimelineBadge) {
    latestOpsTimelineItems = [];
    renderOpsTimelineEntries([]);
    return;
  }
  opsTimelineUnsubscribe = onValue(
    ref(db, `ops_logs/${projectId}`),
    (snapshot) => {
      const raw = snapshot.val() || {};
      latestOpsTimelineItems = Object.entries(raw)
        .map(([id, value]) => ({ id, ...value }))
        .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
        .slice(0, 12);
      renderOpsTimelineEntries(latestOpsTimelineItems);
    },
    (error) => {
      latestOpsTimelineItems = [];
      renderOpsTimelineEntries([]);
      if (String(error?.code || "").includes("permission_denied")) {
        opsTimelinePermissionDenied = true;
        return;
      }
      console.warn("Ops timeline disabled", error);
    }
  );
}

function renderOpsTimelineEntries(items = []) {
  if (!elements.opsTimeline || !elements.opsTimelineBadge) return;
  const filteredItems = filterOpsTimelineItems(items, opsTimelineFilter);
  elements.opsTimelineBadge.textContent = items.length
    ? opsTimelineFilter === "all"
      ? `최근 ${items.length}건`
      : `${filteredItems.length}/${items.length}건`
    : "대기";
  elements.opsTimelineBadge.dataset.state = filteredItems.length ? "ready" : "warn";
  elements.opsTimeline.innerHTML = filteredItems.length
    ? filteredItems
        .map((item) => {
          const details = item.details || {};
          return `
            <article class="ops-timeline__item">
              <div class="ops-timeline__meta">
                <span>${formatAuditActionLabel(item.action || "")}</span>
                <span>${item.createdAt ? formatAdminDateTime(item.createdAt) : "-"}</span>
              </div>
              <div class="ops-timeline__title">${details.teamLabel || details.teamId || details.target || "운영 이벤트"}</div>
              <div class="ops-timeline__summary">${summarizeAuditDetails(item.action || "", details) || JSON.stringify(details)}</div>
            </article>
          `;
        })
        .join("")
    : `<div class="ops-timeline__empty">${
        items.length ? "현재 필터에 맞는 운영 로그가 없습니다." : "운영 로그가 아직 없습니다."
      }</div>`;
}
