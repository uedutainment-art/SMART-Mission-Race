import { db, ref, get, update } from "./firebase_config.js";
import { storeTeamSession, clearTeamSession } from "./session_module.js";

const masterStep = document.getElementById("masterStep");
const teamStep = document.getElementById("teamStep");
const masterInput = document.getElementById("masterInput");
const masterButton = document.getElementById("masterButton");
const teamNameInput = document.getElementById("teamNameInput");
const teamPasswordInput = document.getElementById("teamPasswordInput");
const teamButton = document.getElementById("teamButton");
const statusEl = document.getElementById("loginStatus");
const projectProgram = document.getElementById("projectProgram");
const projectDates = document.getElementById("projectDates");
const projectLogo = document.getElementById("projectLogo");

const PROJECTS_PATH = "projects";

let projectsCache = null;
let activeProjectId = null;
let activeProject = null;
let teamNameTouched = false;

clearTeamSession();
showMasterStep();

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
  teamPasswordInput.value = "";
  teamNameInput.value = "";
  teamNameTouched = false;
  teamPasswordInput.focus();
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
  setStatus("프로젝트 확인 완료. 팀 비밀번호를 입력하세요.");
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
  const alias = aliasInput || teamProfile.name || "";

  await update(ref(db, `${PROJECTS_PATH}/${activeProjectId}/teams/${teamId}/profile`), {
    name: alias,
    number: teamNumber,
  });

  storeTeamSession({
    projectId: activeProjectId,
    projectName: activeProject.meta?.name || activeProjectId,
    projectTitle: activeProject.meta?.name || activeProjectId,
    projectLogo: activeProject.meta?.logoUrl || activeProject.meta?.dashboardLogoUrl || activeProject.meta?.loginLogoUrl || "",
    projectStartAt: activeProject.meta?.startAt || null,
    projectEndAt: activeProject.meta?.endAt || null,
    missionTotal: Number(activeProject.meta?.missionTotal) || 9,
    teamId,
    teamName: alias,
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
    projectLogo.classList.add("hidden");
    projectLogo.src = "";
    projectProgram.textContent = "프로젝트 정보를 입력하세요.";
    projectDates.textContent = "";
    return;
  }
  const meta = project.meta || {};
  projectLogo.src = meta.logoUrl || meta.dashboardLogoUrl || meta.loginLogoUrl || "";
  projectLogo.classList.toggle("hidden", !projectLogo.src);
  projectProgram.textContent = meta.name || "SMART Mission Race";
  const start = meta.startAt ? new Date(meta.startAt).toLocaleDateString() : "";
  const end = meta.endAt ? new Date(meta.endAt).toLocaleDateString() : "";
  projectDates.textContent = start && end ? `${start} ~ ${end}` : "";
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
    setStatus("먼저 마스터 패스워드를 입력하세요.");
    return;
  }
  const password = teamPasswordInput.value.trim();
  if (!password) {
    setStatus("");
    teamNameTouched = false;
    teamNameInput.value = "";
    return;
  }
  const match = findActiveTeamByPassword(password);
  if (match) {
    updateProjectDisplay(activeProject);
    if (!teamNameTouched || !teamNameInput.value.trim()) {
      teamNameInput.value = match.teamProfile.name || "";
      teamNameTouched = false;
    }
    setStatus("");
  } else {
    setStatus("일치하는 팀 정보가 없습니다.");
    if (!teamNameTouched) {
      teamNameInput.value = "";
    }
  }
}

loadProjects();
