import { db, ref, get, update } from "./firebase_config.js";
import { storeTeamSession, clearTeamSession, loadTeamSession } from "./session_module.js";

const masterStep = document.getElementById("masterStep");
const teamStep = document.getElementById("teamStep");
const masterInput = document.getElementById("masterInput");
const masterButton = document.getElementById("masterButton");
const teamNameInput = document.getElementById("teamNameInput");
const teamPasswordInput = document.getElementById("teamPasswordInput");
const teamButton = document.getElementById("teamButton");
const statusEl = document.getElementById("loginStatus");
const projectProgram = document.getElementById("projectProgram");
const projectSubtitle = document.getElementById("projectSubtitle");
const projectDates = document.getElementById("projectDates");
const projectNotice = document.getElementById("projectNotice");
const loginMethodGuide = document.getElementById("loginMethodGuide");
const loginEntryNote = document.getElementById("loginEntryNote");
const loginAnnouncements = document.getElementById("loginAnnouncements");
const projectLogo = document.getElementById("projectLogo");
const resumePanel = document.getElementById("resumePanel");
const resumeCopy = document.getElementById("resumeCopy");
const resumeButton = document.getElementById("resumeButton");
const clearResumeButton = document.getElementById("clearResumeButton");

const PROJECTS_PATH = "projects";
const DASHBOARD_PAGE_URL = new URL("./dashboard.html", window.location.href).toString();
const loginParams = new URLSearchParams(window.location.search);
const requestedProjectId = loginParams.get("project");
const requestedEntryMode = loginParams.get("entry");

let projectsCache = null;
let activeProjectId = null;
let activeProject = null;
let teamNameTouched = false;
let accessLocked = false;
let announcementRequestToken = 0;

function getProjectMissionTotal(project = {}, teamId = "") {
  const metaMissionTotal = Number(project?.meta?.missionTotal);
  if (Number.isFinite(metaMissionTotal) && metaMissionTotal > 0) return Math.floor(metaMissionTotal);
  const routeMissionKeys = Array.isArray(project?.routing?.missionKeys) ? project.routing.missionKeys.filter(Boolean).length : 0;
  if (routeMissionKeys) return routeMissionKeys + 2;
  const numericKeys = Object.keys(project?.teams?.[teamId]?.config?.missions || {})
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (numericKeys.length) return Math.max(...numericKeys);
  return 9;
}

const LOGIN_THEME_MAP = {
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

renderResumePanel();
bootstrapLogin();

masterButton.addEventListener("click", handleMasterUnlock);
masterInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    handleMasterUnlock();
  }
});

teamButton.addEventListener("click", handleTeamLogin);
teamPasswordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    handleTeamLogin();
  }
});

teamNameInput.addEventListener("input", () => {
  teamNameTouched = true;
});

teamPasswordInput.addEventListener("input", handleTeamPasswordPreview);
resumeButton?.addEventListener("click", handleResumeSession);
clearResumeButton?.addEventListener("click", () => {
  clearTeamSession();
  renderResumePanel();
    setStatus("최근 접속 기록을 삭제했습니다.");
});

async function loadProjects() {
  if (projectsCache) return projectsCache;
  try {
    const snapshot = await get(ref(db, PROJECTS_PATH));
    projectsCache = snapshot.val() || {};
    return projectsCache;
  } catch (_error) {
    setStatus("프로젝트 정보를 불러오지 못했습니다. 네트워크를 확인하세요.", "error");
    return {};
  }
}

async function bootstrapLogin() {
  if (!requestedProjectId) {
    showMasterStep();
    return;
  }
  const projects = await loadProjects();
  const project = projects?.[requestedProjectId];
  if (!project) {
    showMasterStep();
    setStatus("QR 또는 링크의 프로젝트 정보를 찾을 수 없습니다. 패스워드로 다시 입장하세요.", "warn");
    return;
  }
  if (requestedEntryMode === "project") {
    activeProjectId = requestedProjectId;
    activeProject = project;
    updateProjectDisplay(project);
    loadProjectAnnouncements(requestedProjectId);
    showMasterStep(true);
    return;
  }
  activateProject(requestedProjectId, project, "운영진 QR 또는 링크로 접속했습니다. 팀 비밀번호만 입력하면 됩니다.");
}

function showMasterStep(keepProjectDisplay = false) {
  masterStep.classList.add("active");
  teamStep.classList.remove("active");
  setStatus("", "info");
  renderEntryNote("");
  renderMethodGuide(true);
  if (!keepProjectDisplay) {
    updateProjectDisplay(null);
  }
  masterInput.focus();
}

function showTeamStep() {
  if (accessLocked) return;
  masterStep.classList.remove("active");
  teamStep.classList.add("active");
  renderMethodGuide(false);
  teamPasswordInput.value = "";
  teamNameInput.value = "";
  teamNameTouched = false;
  teamPasswordInput.focus();
}

async function handleMasterUnlock() {
  const value = masterInput.value.trim();
  if (!value) {
    setStatus("패스워드를 입력하세요.", "warn");
    return;
  }
  const projects = await loadProjects();
  const match = Object.entries(projects).find(
    ([_id, project]) => (project.meta?.masterPassword || "").toLowerCase() === value.toLowerCase()
  );
  if (!match) {
    setStatus("일치하는 프로젝트가 없습니다.", "error");
    return;
  }

  const [projectId, project] = match;
  activateProject(projectId, project, "프로젝트 확인 완료. 팀 비밀번호를 입력하세요.");
}

async function handleTeamLogin() {
  if (!activeProjectId || !activeProject) {
    setStatus("먼저 패스워드를 입력하세요.", "warn");
    return;
  }
  const password = teamPasswordInput.value.trim();
  if (!password) {
    setStatus("팀 비밀번호를 입력하세요.", "warn");
    return;
  }
  const match = findActiveTeamByPassword(password);
  if (!match) {
    setStatus("일치하는 팀 정보가 없습니다.", "error");
    return;
  }

  const { teamId, teamProfile } = match;
  const aliasInput = teamNameInput.value.trim();
  const teamNumber = teamProfile.number || Number(teamId.replace("Team", "")) || 0;
  const alias = aliasInput || teamProfile.name || "";

  try {
    await update(ref(db, `${PROJECTS_PATH}/${activeProjectId}/teams/${teamId}/profile`), {
      name: alias,
      number: teamNumber,
    });

    storeTeamSession({
      projectId: activeProjectId,
      projectName: activeProject.meta?.name || activeProjectId,
      projectTitle: activeProject.meta?.name || activeProjectId,
      projectLogo: activeProject.meta?.logoUrl || activeProject.meta?.dashboardLogoUrl || activeProject.meta?.loginLogoUrl || "",
      projectFinishNotice: activeProject.meta?.finishNotice || "",
      projectEndAt: activeProject.meta?.endAt || null,
      hideTeamChat: activeProject.meta?.hideTeamChat === true,
      hideTeamPhoto: activeProject.meta?.hideTeamPhoto === true,
      missionTotal: getProjectMissionTotal(activeProject, teamId),
      teamId,
      teamName: alias,
      teamNumber,
      teamTotal: Number(activeProject.meta?.teamCount) || Object.keys(activeProject.teams || {}).length || 10,
    });

    renderResumePanel();
    setStatus("로그인 성공! 대시보드로 이동합니다.", "success");
    setTimeout(() => {
      window.location.href = DASHBOARD_PAGE_URL;
    }, 300);
  } catch (_error) {
    setStatus("로그인 처리 중 오류가 발생했습니다. 다시 시도하세요.", "error");
  }
}

function setStatus(message, type = "info") {
  statusEl.textContent = message || "";
  statusEl.dataset.state = message ? type : "idle";
}

function updateProjectDisplay(project) {
  if (!project) {
    applyLoginTheme({});
    projectLogo.classList.add("hidden");
    projectLogo.src = "";
    projectProgram.textContent = "";
    if (projectSubtitle) {
      projectSubtitle.textContent = "";
      projectSubtitle.classList.add("hidden");
    }
    projectDates.textContent = "";
    if (projectNotice) {
      projectNotice.textContent = "";
      projectNotice.classList.add("hidden");
    }
    renderAnnouncements([]);
    if (masterButton) masterButton.textContent = "확인";
    if (teamButton) teamButton.textContent = "팀 입장";
    return;
  }
  const meta = project.meta || {};
  applyLoginTheme(meta);
  projectLogo.src = meta.logoUrl || meta.dashboardLogoUrl || meta.loginLogoUrl || "";
  projectLogo.classList.toggle("hidden", !projectLogo.src);
  projectProgram.textContent = meta.loginTitle || meta.name || "SMART Mission Race";
  if (projectSubtitle) {
    projectSubtitle.textContent = meta.loginSubtitle || "";
    projectSubtitle.classList.toggle("hidden", !meta.loginSubtitle);
  }
  projectDates.textContent = "";
  projectDates.classList.add("hidden");
  if (projectNotice) {
    projectNotice.textContent = meta.loginNotice || "";
    projectNotice.classList.toggle("hidden", !meta.loginNotice);
  }
  if (masterButton) masterButton.textContent = meta.loginUnlockLabel || "확인";
  if (teamButton) teamButton.textContent = meta.loginTeamButtonLabel || "팀 입장";
}

async function loadProjectAnnouncements(projectId) {
  const requestToken = ++announcementRequestToken;
  if (!projectId) {
    renderAnnouncements([]);
    return;
  }
  try {
    const snapshot = await get(ref(db, `chat/${projectId}/__broadcast`));
    if (requestToken !== announcementRequestToken) return;
    const raw = snapshot.val() || {};
    const items = Object.values(raw)
      .filter((item) => item?.text)
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
      .slice(0, 3);
    renderAnnouncements(items);
  } catch (_error) {
    if (requestToken !== announcementRequestToken) return;
    renderAnnouncements([]);
  }
}

function renderAnnouncements(items = []) {
  if (!loginAnnouncements) return;
  if (!items.length) {
    loginAnnouncements.innerHTML = "";
    loginAnnouncements.classList.add("hidden");
    return;
  }
  loginAnnouncements.innerHTML = `
    <div class="login-announcements__head">
      <strong>최근 전체 공지</strong>
      <span class="login-announcements__badge">${items.length}건</span>
    </div>
    ${items
      .map(
        (item) => `
          <div class="login-announcements__item">
            <div class="login-announcements__time">${item.createdAt ? formatDateTime(item.createdAt) : "방금 전"}</div>
            <div class="login-announcements__text">${item.text || ""}</div>
          </div>
        `
      )
      .join("")}
  `;
  loginAnnouncements.classList.remove("hidden");
}

function applyLoginTheme(meta = {}) {
  const theme = LOGIN_THEME_MAP[meta.loginTheme] || LOGIN_THEME_MAP.midnight;
  const backgroundLayers = [];
  if (meta.loginBackgroundUrl) {
    backgroundLayers.push(
      `linear-gradient(135deg, rgba(5, 10, 20, 0.72), rgba(5, 10, 20, 0.48))`,
      `url("${String(meta.loginBackgroundUrl).replace(/"/g, '\\"')}")`
    );
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundPosition = "center";
    document.body.style.backgroundRepeat = "no-repeat";
  } else {
    document.body.style.backgroundSize = "";
    document.body.style.backgroundPosition = "";
    document.body.style.backgroundRepeat = "";
  }
  backgroundLayers.push(theme.background);
  document.body.style.backgroundImage = backgroundLayers.join(", ");
  document.body.style.setProperty("--login-accent", theme.accent);
}

function findActiveTeamByPassword(password = "") {
  if (!activeProject) return null;
  const teams = activeProject.teams || {};
  for (const [teamId, team] of Object.entries(teams)) {
    const profile = team.profile || {};
    if ((profile.password || "1") === password) {
      return {
        teamId,
        teamProfile: {
          ...profile,
          number: profile.number ?? parseInt(teamId.replace("Team", ""), 10),
        },
      };
    }
  }
  return null;
}

function handleTeamPasswordPreview() {
  if (!activeProject) {
    setStatus("먼저 패스워드를 입력하세요.", "warn");
    return;
  }
  const password = teamPasswordInput.value.trim();
  if (!password) {
    setStatus("", "info");
    teamNameTouched = false;
    teamNameInput.value = "";
    return;
  }
  const match = findActiveTeamByPassword(password);
  if (match) {
    updateProjectDisplay(activeProject);
    if (!teamNameTouched) {
      teamNameInput.value = match.teamProfile.name || "";
      teamNameTouched = false;
    }
    const teamNumber = match.teamProfile.number || Number(match.teamId.replace("Team", "")) || 0;
    setStatus(teamNumber ? `${teamNumber}팀 확인됨. 바로 입장할 수 있습니다.` : "팀 확인됨. 바로 입장할 수 있습니다.", "success");
  } else {
    setStatus("일치하는 팀 정보가 없습니다.", "error");
    if (!teamNameTouched) {
      teamNameInput.value = "";
    }
  }
}

function evaluateProjectAccess(project = {}) {
  const meta = project.meta || {};
  const now = Date.now();
  if (meta.status === "finished") {
    return { allowed: false, message: "이 프로젝트는 이미 종료되었습니다." };
  }
  if (meta.endAt && now > Number(meta.endAt)) {
    return { allowed: false, message: `${formatDateTime(meta.endAt)}에 프로젝트가 종료되었습니다.` };
  }
  return { allowed: true, message: "" };
}

function formatDateTime(value) {
  return new Date(Number(value)).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function renderResumePanel() {
  const session = loadTeamSession();
  if (!session?.projectId || !session?.teamId) {
    resumePanel?.classList.add("hidden");
    return;
  }
  const endAt = Number(session.projectEndAt) || 0;
  if (endAt && Date.now() > endAt) {
    clearTeamSession();
    resumePanel?.classList.add("hidden");
    return;
  }
  const label = session.teamNumber
    ? `${session.teamNumber}팀 ${session.teamName || ""}`.trim()
    : session.teamName || session.teamId;
  resumeCopy.textContent = `최근 접속: ${session.projectName || session.projectId} · ${label}`;
  resumePanel?.classList.remove("hidden");
}

function renderEntryNote(message = "") {
  if (!loginEntryNote) return;
  loginEntryNote.textContent = message || "";
  loginEntryNote.classList.toggle("hidden", !message);
}

function renderMethodGuide(visible = true) {
  if (!loginMethodGuide) return;
  loginMethodGuide.classList.toggle("hidden", !visible);
}

function activateProject(projectId, project, successMessage = "프로젝트 확인 완료. 팀 비밀번호를 입력하세요.") {
  const access = evaluateProjectAccess(project);
  activeProjectId = projectId;
  activeProject = project;
  updateProjectDisplay(project);
  loadProjectAnnouncements(projectId);

  if (!access.allowed) {
    accessLocked = true;
    renderEntryNote(requestedProjectId ? "QR 또는 링크로 들어왔지만 아직 입장 가능한 시간이 아닙니다." : "");
    teamStep.classList.remove("active");
    masterStep.classList.add("active");
    setStatus(access.message, "warn");
    return;
  }

  accessLocked = false;
  renderEntryNote("");
  setStatus(successMessage, "success");
  showTeamStep();
}

function handleResumeSession() {
  const session = loadTeamSession();
  if (!session?.projectId || !session?.teamId) {
    renderResumePanel();
    return;
  }
  window.location.href = DASHBOARD_PAGE_URL;
}
