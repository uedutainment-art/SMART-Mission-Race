import { db, ref, get, update, onValue } from "./firebase_config.js";
import { storeTeamSession, clearTeamSession } from "./session_module.js";
import { resolveOfficialTeamName, normalizePasswordValue } from "./utils.js";

const masterStep = document.getElementById("masterStep");
const teamStep = document.getElementById("teamStep");
const masterInput = document.getElementById("masterInput");
const masterButton = document.getElementById("masterButton");
const teamNameInput = document.getElementById("teamNameInput");
const teamPasswordInput = document.getElementById("teamPasswordInput");
const teamButton = document.getElementById("teamButton");
const statusEl = document.getElementById("loginStatus");
const projectProgram = document.getElementById("projectProgram");
const projectSubtitleEl = document.getElementById("projectSubtitle");
const projectLogo = document.getElementById("projectLogo");
const searchParams = new URLSearchParams(window.location.search);
const presetProjectId = (searchParams.get("project") || "").trim();
let presetHandled = false;
const bodyEl = document.body;

const PROJECTS_PATH = "projects";

let projectsCache = null;
let activeProjectId = null;
let activeProject = null;
let teamNameTouched = false;
let projectsWatcherCleanup = null;
let reloadScheduled = false;



clearTeamSession();
initializeProjectWatcher();
showMasterStep();
loadProjects().then(() => {
  if (presetProjectId && !presetHandled) {
    autoSelectProjectById(presetProjectId);
  }
});

function setBodyBackground(url = "") {
  if (url) {
    const safeUrl = url.replace(/"/g, '\\"');
    bodyEl.style.backgroundImage = `url("${safeUrl}")`;
  } else {
    bodyEl.style.backgroundImage = "";
  }
}

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

async function loadProjects() {
  initializeProjectWatcher();
  if (projectsCache) return projectsCache;
  const snapshot = await get(ref(db, PROJECTS_PATH));
  projectsCache = snapshot.val() || {};
  return projectsCache;
}

function showMasterStep() {
  masterStep.classList.add("active");
  teamStep.classList.remove("active");
  setStatus("");
  updateProjectDisplay(null);
  masterInput.focus();
}

function showTeamStep() {
  masterStep.classList.remove("active");
  teamStep.classList.add("active");
  teamNameInput.value = "";
  teamPasswordInput.value = "";
  teamNameTouched = false;
  teamNameInput.focus();
}

async function handleMasterUnlock() {
  const value = masterInput.value.trim();
  if (!value) {
    setStatus("마스터 패스워드를 입력하세요.");
    return;
  }
  await loadProjects();
  const match = Object.entries(projectsCache).find(
    ([_id, project]) => (project.meta?.masterPassword || "").toLowerCase() === value.toLowerCase()
  );
  if (!match) {
    setStatus("일치하는 프로젝트가 없습니다.");
    return;
  }
  const [projectId, project] = match;
  activeProjectId = projectId;
  activeProject = project;
  updateProjectDisplay(project);
  setStatus("");
  showTeamStep();
}

async function handleTeamLogin() {
  if (!activeProjectId || !activeProject) {
    setStatus("먼저 마스터 패스워드를 입력하세요.");
    return;
  }
  const password = teamPasswordInput.value.trim();
  if (!password) {
    setStatus("팀 비밀번호를 입력하세요.");
    return;
  }
  const match = findActiveTeamByPassword(password);
  if (!match) {
    setStatus("일치하는 팀 정보가 없습니다.");
    return;
  }
  const { teamId, teamProfile } = match;
  const aliasInput = teamNameInput.value.trim();
  const teamNumber = teamProfile.number || Number(teamId.replace("Team", "")) || 0;
  const officialName = resolveOfficialTeamName(teamProfile, teamId, teamNumber);
  const alias = aliasInput || teamProfile.nickname || "";

  await update(ref(db, `${PROJECTS_PATH}/${activeProjectId}/teams/${teamId}/profile`), {
    nickname: alias,
    number: teamNumber,
  });

  const educationAt = activeProject.meta?.educationAt || activeProject.meta?.startAt || null;
  const countdownStart = educationAt ? Date.now() : activeProject.meta?.startAt || null;
  const countdownEnd = educationAt || activeProject.meta?.endAt || null;

  storeTeamSession({
    projectId: activeProjectId,
    projectName: activeProject.meta?.name || activeProjectId,
    projectSubtitle: activeProject.meta?.subtitle || "",
    projectBackground: activeProject.meta?.backgroundUrl || "",
    projectEducationAt: educationAt,
    projectTitle: activeProject.meta?.name || activeProjectId,
    projectLogo: activeProject.meta?.logoUrl || activeProject.meta?.dashboardLogoUrl || activeProject.meta?.loginLogoUrl || "",
    projectStartAt: countdownStart,
    projectEndAt: countdownEnd,
    missionTotal: Number(activeProject.meta?.missionTotal) || 9,
    teamId,
    teamName: officialName,
    teamOfficialName: officialName,
    teamNickname: alias,
    teamNumber,
    teamTotal: Number(activeProject.meta?.teamCount) || Object.keys(activeProject.teams || {}).length || 10,
  });

  setStatus("로그인 성공! 대시보드로 이동합니다.");
  setTimeout(() => {
    window.location.href = "/dashboard.html";
  }, 300);
}

function setStatus(message) {
  statusEl.textContent = message || "";
}

function updateProjectDisplay(project) {
  if (!project) {
    if (projectLogo) {
      projectLogo.classList.add("hidden");
      projectLogo.src = "";
    }
    if (projectProgram) {
      projectProgram.textContent = "프로젝트 정보를 입력하세요.";
    }
    if (projectSubtitleEl) {
      projectSubtitleEl.textContent = "";
      projectSubtitleEl.classList.add("hidden");
    }
    setBodyBackground("");
    return;
  }
  const meta = project.meta || {};
  if (projectLogo) {
    projectLogo.src = meta.logoUrl || meta.dashboardLogoUrl || meta.loginLogoUrl || "";
    projectLogo.classList.toggle("hidden", !projectLogo.src);
  }
  if (projectProgram) {
    projectProgram.textContent = meta.name || "SMART Mission Race";
  }
  if (projectSubtitleEl) {
    const subtitle = meta.subtitle || "";
    projectSubtitleEl.textContent = subtitle;
    projectSubtitleEl.classList.toggle("hidden", !subtitle);
  }
  setBodyBackground(meta.backgroundUrl || "");
}

function initializeProjectWatcher() {
  if (projectsWatcherCleanup) return;
  const projectsRef = ref(db, PROJECTS_PATH);
  projectsWatcherCleanup = onValue(projectsRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      scheduleTeamLoginReload();
      return;
    }
    projectsCache = data;
    if (!activeProjectId) return;
    if (data[activeProjectId]) {
      activeProject = data[activeProjectId];
    } else {
      scheduleTeamLoginReload();
    }
  });
}

function scheduleTeamLoginReload() {
  if (reloadScheduled) return;
  reloadScheduled = true;
  setTimeout(() => {
    if (typeof location?.reload === "function") {
      location.reload();
    } else {
      window.location.href = window.location.href;
    }
  }, 150);
}


function findActiveTeamByPassword(password = "") {
  if (!activeProject) return null;
  const normalizedInput = normalizePasswordValue(password);
  if (!normalizedInput) return null;
  const teams = activeProject.teams || {};
  for (const [teamId, team] of Object.entries(teams)) {
    const profile = team.profile || {};
    if (normalizePasswordValue(profile.password) === normalizedInput) {
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
    setStatus("먼저 마스터 패스워드를 입력하세요.");
    return;
  }
  const password = teamPasswordInput.value;
  const normalizedInput = normalizePasswordValue(password);
  if (!normalizedInput) {
    setStatus("");
    return;
  }
  const match = findActiveTeamByPassword(password);
  if (match) {
    updateProjectDisplay(activeProject);
    setStatus("");
  } else {
    setStatus("일치하는 팀 정보가 없습니다.");
  }
}



async function autoSelectProjectById(projectId = "") {
  const projects = await loadProjects();
  const resolvedId = findProjectIdentifier(projects, projectId);
  if (!resolvedId) return;
  const project = projects?.[resolvedId];
  if (!project) return;
  activeProjectId = resolvedId;
  activeProject = project;
  updateProjectDisplay(project);
  setStatus("");
  presetHandled = true;
  showTeamStep();
}

function findProjectIdentifier(projects = {}, identifier = "") {
  const raw = (identifier || "").trim();
  if (!raw) return null;
  if (Object.prototype.hasOwnProperty.call(projects, raw)) {
    return raw;
  }
  const lower = raw.toLowerCase();
  const keyMatch = Object.keys(projects).find((id) => id.toLowerCase() === lower);
  if (keyMatch) return keyMatch;
  const codeMatch = Object.keys(projects).find((id) => {
    const code = (projects[id]?.meta?.projectCode || "").trim().toLowerCase();
    return code && code === lower;
  });
  return codeMatch || null;
}

loadProjects();
