import { db, ref, onValue, update } from "./firebase_config.js";
import {
  storage,
  sRef,
  uploadBytes,
  getDownloadURL,
} from "./firebase_config.js";
import { storeProjectContext } from "./project_context.js";

const defaultTeamCount = 10;
const DEFAULT_MISSION_TOTAL = 9;
let missionTotal = DEFAULT_MISSION_TOTAL;

const elements = {
  projectTableBody: document.querySelector("#projectTable tbody"),
  newProjectBtn: document.getElementById("newProjectBtn"),
  deleteProjectBtn: document.getElementById("deleteProjectBtn"),
  refreshBtn: document.getElementById("refreshProjectsBtn"),
  projectForm: document.getElementById("projectForm"),
  selectAllProjects: document.getElementById("selectAllProjects"),
  projectNameInput: document.getElementById("projectNameInput"),
  masterPasswordInput: document.getElementById("masterPasswordInput"),
  startDateInput: document.getElementById("startDateInput"),
  endDateInput: document.getElementById("endDateInput"),
  organizerInput: document.getElementById("organizerInput"),
  venueInput: document.getElementById("venueInput"),
  participantInput: document.getElementById("participantInput"),
  teamCountInput: document.getElementById("teamCountInput"),
  sharedLogoInput: document.getElementById("sharedLogoInput"),
  sharedLogoPreview: document.getElementById("sharedLogoPreview"),
  teamTableBody: document.querySelector("#teamTable tbody"),
  missionCountInput: document.getElementById("missionCountInput"),
  saveBtn: document.getElementById("saveProjectBtn"),
  resetBtn: document.getElementById("resetResultsBtn"),
  openHQBtn: document.getElementById("openHQBtn"),
  missionModal: document.getElementById("missionModal"),
  missionModalBody: document.getElementById("missionModalBody"),
  missionModalTitle: document.getElementById("missionModalTitle"),
  missionModalSave: document.getElementById("missionModalSave"),
  missionModalClose: document.getElementById("missionModalClose"),
  missionModalCancel: document.getElementById("missionModalCancel"),
};

let projectsCache = {};
let currentProjectId = null;
let teamProfiles = {};
let missionConfigs = {};
let activeMissionTeam = null;
let metaLogoUrl = "";
const selectedProjects = new Set();

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
  renderTeamRows(Number(elements.teamCountInput.value) || defaultTeamCount);
  attachEventHandlers();
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
    elements.projectNameInput.focus();
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
        openMissionModal(activeMissionTeam);
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
      handleLogoUpload(event.target.files?.[0], elements.sharedLogoPreview);
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
      logoUrl: meta.logoUrl || meta.dashboardLogoUrl || meta.loginLogoUrl || "",
      teamCount: meta.teamCount || Number(elements.teamCountInput.value) || 0,
    });
    window.open(`/hq.html?project=${encodeURIComponent(projectId)}`, "_blank");
  });
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
  const rows = Object.entries(projectsCache).map(([id, project]) => {
    const meta = project.meta || {};
    const status = meta.status || "planned";
    const start = meta.startAt ? new Date(meta.startAt).toLocaleDateString() : "-";
    const end = meta.endAt ? new Date(meta.endAt).toLocaleDateString() : "-";
    return `
      <tr data-project="${id}">
        <td><input type="checkbox" class="project-select" data-project="${id}" ${selectedProjects.has(id) ? "checked" : ""}></td>
        <td>${meta.name || id}</td>
        <td>${meta.masterPassword || "-"}</td>
        <td>${start} ~ ${end}</td>
        <td>${renderStatusTag(status)}</td>
      </tr>
    `;
  });
  elements.projectTableBody.innerHTML = rows.join("") || "<tr><td colspan='5'>등록된 프로젝트가 없습니다.</td></tr>";
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
  updateSelectionUI();
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
  document.getElementById("projectForm").reset();
  elements.teamCountInput.value = defaultTeamCount;
  missionTotal = DEFAULT_MISSION_TOTAL;
  if (elements.missionCountInput) elements.missionCountInput.value = missionTotal;
  renderTeamRows(defaultTeamCount);
  if (elements.masterPasswordInput) elements.masterPasswordInput.value = "";
  if (elements.sharedLogoPreview) elements.sharedLogoPreview.src = "";
}

function fillForm(projectId) {
  const project = projectsCache[projectId];
  if (!project) return;
  currentProjectId = projectId;
  const meta = project.meta || {};
  elements.projectNameInput.value = meta.name || "";
  elements.masterPasswordInput.value = meta.masterPassword || "";
  elements.startDateInput.value = meta.startAt ? toDateInputValue(meta.startAt) : "";
  elements.endDateInput.value = meta.endAt ? toDateInputValue(meta.endAt) : "";
  elements.organizerInput.value = meta.organizer || "";
  elements.venueInput.value = meta.venue || "";
  elements.participantInput.value = meta.participantCount || "";
  elements.teamCountInput.value = meta.teamCount || Object.keys(project.teams || {}).length || defaultTeamCount;
  missionTotal = clampMissionCount(meta.missionTotal || DEFAULT_MISSION_TOTAL);
  if (elements.missionCountInput) elements.missionCountInput.value = missionTotal;
  metaLogoUrl = meta.logoUrl || meta.loginLogoUrl || meta.dashboardLogoUrl || "";
  if (elements.sharedLogoPreview) elements.sharedLogoPreview.src = metaLogoUrl || "";

  teamProfiles = {};
  Object.entries(project.teams || {}).forEach(([teamId, teamData]) => {
    teamProfiles[teamId] = {
      name: teamData.profile?.name || "",
      password: teamData.profile?.password || "",
    };
  });
  renderTeamRows(Number(elements.teamCountInput.value) || defaultTeamCount);

  loadMissionConfigs(project);
}

function renderTeamRows(count) {
  const rows = [];
  for (let i = 1; i <= count; i++) {
    const teamId = `Team${i}`;
    if (!teamProfiles[teamId]) {
      teamProfiles[teamId] = { name: "", password: "" };
    }
    const profile = teamProfiles[teamId];
    ensureMissionConfig(teamId);
    rows.push(`
      <tr data-team-id="${teamId}">
        <td>${i}팀</td>
        <td><input value="${profile.name || ""}" placeholder="팀 닉네임" /></td>
        <td><input value="${profile.password || ""}" placeholder="비밀번호" /></td>
        <td><button type="button" class="mission-config-btn" data-team-id="${teamId}">입력</button></td>
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
  attachMissionButtons();
}

function attachMissionButtons() {
  elements.teamTableBody.querySelectorAll(".mission-config-btn").forEach((button) => {
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

function createDefaultMissionEntry() {
  return {
    codeAnswer: "1",
    missionAnswer: "1",
    codeImageUrl: "",
    missionImageUrl: "",
    photoSlots: 0,
    specialSlots: 0,
  };
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

function openMissionModal(teamId = null) {
  const targetTeamId =
    teamId || Object.keys(teamProfiles).find(Boolean) || "Team1";
  activeMissionTeam = targetTeamId;
  const labelInput = elements.teamTableBody.querySelector(
    `tr[data-team-id="${targetTeamId}"] input`
  );
  const nickname = labelInput?.value.trim() || teamProfiles[targetTeamId]?.name || "";
  const teamNumber = Number(targetTeamId.replace("Team", "")) || 0;
  const labelBase = teamNumber ? `${teamNumber}팀` : targetTeamId;
  const label = nickname ? `${labelBase} ${nickname}` : labelBase;
  if (elements.missionModalTitle) {
    elements.missionModalTitle.textContent = `문제 입력 (${label})`;
  }
  renderMissionModalRows(targetTeamId);
  elements.missionModal?.classList.add("active");
  if (elements.missionModal) elements.missionModal.hidden = false;
}

function closeMissionModal() {
  if (elements.missionModal) {
    elements.missionModal.classList.remove("active");
    elements.missionModal.hidden = true;
  }
  activeMissionTeam = null;
}

function renderMissionModalRows(teamId) {
  if (!elements.missionModalBody) return;
  const config = ensureMissionConfig(teamId);
  const rows = [];
  for (let i = 1; i <= missionTotal; i++) {
    const mission = config[i] || {};
    rows.push(`
      <tr data-mission="${i}">
        <td>${i}</td>
        <td><input class="mission-code" value="${mission.codeAnswer || ""}" placeholder="코드 정답" /></td>
        <td><input class="mission-answer" value="${mission.missionAnswer || ""}" placeholder="미션 정답" /></td>
        <td>
          <label class="file-pill">
            업로드
            <input type="file" class="mission-code-file" data-type="code" accept="image/*" hidden />
          </label>
          <span class="code-status">${mission.codeImageUrl ? "업로드 완료" : "미입력"}</span>
          <div class="mission-thumb">${mission.codeImageUrl ? `<img src="${mission.codeImageUrl}" alt="CODE ${i}" />` : ""}</div>
        </td>
        <td>
          <label class="file-pill">
            업로드
            <input type="file" class="mission-answer-file" data-type="mission" accept="image/*" hidden />
          </label>
          <span class="mission-status">${mission.missionImageUrl ? "업로드 완료" : "미입력"}</span>
          <div class="mission-thumb">${mission.missionImageUrl ? `<img src="${mission.missionImageUrl}" alt="MISSION ${i}" />` : ""}</div>
        </td>
      </tr>
    `);
  }
  elements.missionModalBody.innerHTML = rows.join("");
  attachMissionModalHandlers(teamId);
}

function attachMissionModalHandlers(teamId) {
  if (!elements.missionModalBody) return;
  const config = ensureMissionConfig(teamId);
  elements.missionModalBody.querySelectorAll("tr[data-mission]").forEach((row) => {
    const missionNumber = row.dataset.mission;
    const codeInput = row.querySelector(".mission-code");
    const answerInput = row.querySelector(".mission-answer");
    const fileInputs = row.querySelectorAll('input[type="file"]');

    codeInput.addEventListener("input", () => {
      config[missionNumber].codeAnswer = codeInput.value.trim() || "1";
    });
    answerInput.addEventListener("input", () => {
      config[missionNumber].missionAnswer = answerInput.value.trim() || "1";
    });

    fileInputs.forEach((input) => {
      input.addEventListener("change", async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const type = event.target.dataset.type;
          const statusEl = row.querySelector(type === "code" ? ".code-status" : ".mission-status");
          const thumbEl = row.querySelectorAll(".mission-thumb")[type === "code" ? 0 : 1];
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
            thumbEl.innerHTML = `<img src="${url}" alt="${type === "code" ? "CODE" : "MISSION"} ${missionNumber}" />`;
          }
        } catch (error) {
          console.error(error);
          statusEl.textContent = "업로드 실패";
        } finally {
          event.target.value = "";
        }
      });
    });
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

async function handleLogoUpload(file, previewEl) {
  if (!file) return;
  const projectId = getProjectIdOrAlert();
  if (!projectId) return;
  const path = `projects/${projectId}/logos/shared-${Date.now()}-${file.name}`;
  const storageRef = sRef(storage, path);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  metaLogoUrl = url;
  if (previewEl) previewEl.src = url;
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

  const now = Date.now();
  const resolvedStatus = projectsCache[projectId]?.meta?.status || "running";
  const meta = {
    id: projectId,
    name: elements.projectNameInput.value.trim() || masterPassword,
    masterPassword,
    startAt: elements.startDateInput.value ? Date.parse(elements.startDateInput.value) : null,
    endAt: elements.endDateInput.value ? Date.parse(elements.endDateInput.value) : null,
    organizer: elements.organizerInput.value.trim(),
    venue: elements.venueInput.value.trim(),
    participantCount: Number(elements.participantInput.value) || 0,
    teamCount: Number(elements.teamCountInput.value) || defaultTeamCount,
    missionTotal,
    status: resolvedStatus,
    logoUrl: metaLogoUrl || "",
    loginLogoUrl: metaLogoUrl || "",
    dashboardLogoUrl: metaLogoUrl || "",
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
    teams[teamId] = {
      name: inputs[0].value.trim(),
      password: inputs[1].value.trim() || "1",
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

function toDateInputValue(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return date.toISOString().slice(0, 10);
}

function buildCountdownPayload(meta = {}) {
  if (!meta.startAt || !meta.endAt) return null;
  const duration = Math.max(1, Math.floor((meta.endAt - meta.startAt) / 1000));
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return {
    startAt: meta.startAt,
    duration,
  };
}
