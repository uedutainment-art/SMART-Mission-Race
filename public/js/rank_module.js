import { db, ref, onValue } from "./firebase_config.js";

const DEFAULT_TEAMS = [
  { id: "Team1", label: "Team 1", completed: 5, total: 9, order: 1 },
  { id: "Team2", label: "Team 2", completed: 4, total: 9, order: 2 },
  { id: "Team3", label: "Team 3", completed: 3, total: 9, order: 3 },
  { id: "Team4", label: "Team 4", completed: 2, total: 9, order: 4 },
  { id: "Team5", label: "Team 5", completed: 1, total: 9, order: 5 },
];

const DEFAULT_TOTAL_MISSIONS = 9;
const MIN_MISSIONS = 1;
const MAX_MISSIONS = 50;

function resolveOfficialTeamName(profile = {}, teamId = "", fallbackNumber = null) {
  return (
    profile.teamDisplayName ||
    profile.officialTeamName ||
    profile.displayName ||
    profile.name ||
    (Number.isFinite(fallbackNumber) && fallbackNumber > 0 ? `${fallbackNumber}팀` : teamId || "TEAM")
  );
}

export function initRankModule({
  listId = "rankList",
  simulateButtonId = "simulateBtn",
  teams = DEFAULT_TEAMS,
  highlightTeam = "",
  projectId = null,
  missionTotal = DEFAULT_TOTAL_MISSIONS,
  onChange = null,
  includeNickname = false,
  showFinishTime = false,
  finishTimeFormatter = null,
} = {}) {
  const listEl = document.getElementById(listId);
  if (!listEl) {
    return { update: () => {} };
  }
  const normalizedMissionTotal = clampMissionTotal(missionTotal);

  const button = simulateButtonId ? document.getElementById(simulateButtonId) : null;
  const formatFinishTime =
    typeof finishTimeFormatter === "function" ? finishTimeFormatter : defaultFinishTimeFormatter;
  function normalizeTeamList(list = []) {
    return Array.isArray(list)
      ? list.map((entry) => ({
          ...entry,
          finishedAt: normalizeFinishTimestamp(entry.finishedAt),
        }))
      : [];
  }

  let state = Array.isArray(teams) ? [...teams] : [...DEFAULT_TEAMS];
  if (projectId) {
    state = [];
  } else {
    state = normalizeTeamList(state);
  }
  const previousPositions = new Map();

  function render() {
    listEl.innerHTML = "";
    const isTeamFinished = (team) =>
      showFinishTime &&
      team &&
      team.completed >= (team.total || normalizedMissionTotal) &&
      Number.isFinite(team.finishedAt);
    const sorted = [...state].sort((a, b) => {
      const aFinished = isTeamFinished(a);
      const bFinished = isTeamFinished(b);
      if (aFinished && bFinished) {
        const timeA = Number.isFinite(a.finishedAt) ? a.finishedAt : Infinity;
        const timeB = Number.isFinite(b.finishedAt) ? b.finishedAt : Infinity;
        if (timeA !== timeB) return timeA - timeB;
      } else if (aFinished !== bFinished) {
        return aFinished ? -1 : 1;
      }
      if (b.completed !== a.completed) {
        return b.completed - a.completed;
      }
      if (a.order !== b.order) return a.order - b.order;
      return a.label.localeCompare(b.label, "ko");
    });

    if (!sorted.length) {
      listEl.innerHTML = `<div class="rank-empty">참여 팀 데이터를 불러오는 중...</div>`;
      previousPositions.clear();
      if (typeof onChange === "function") {
        onChange([]);
      }
      return;
    }

    sorted.forEach((team, index) => {
      const row = document.createElement("div");
      row.className = "rank-item";
      row.dataset.teamId = team.id || team.label;
      if (index < 3) row.classList.add(`rank-top-${index + 1}`);
      if (team.id === highlightTeam) row.classList.add("my-team");
      const previousIndex = previousPositions.has(team.id)
        ? previousPositions.get(team.id)
        : previousPositions.get(team.label);
      if (typeof previousIndex === "number" && previousIndex !== index) {
        const direction = previousIndex > index ? "moving-up" : "moving-down";
        requestAnimationFrame(() => {
          row.classList.add(direction, "rank-item-animated");
          setTimeout(() => {
            row.classList.remove("moving-up", "moving-down", "rank-item-animated");
          }, 900);
        });
      }

      const myTeamTag = team.id === highlightTeam ? '<span class="my-team-tag">내 팀</span>' : "";
      const displayLabel = buildDisplayLabel(team, includeNickname);
      const safeLabel = escapeHtml(displayLabel);
      const isFinished =
        showFinishTime &&
        Number.isFinite(team.finishedAt) &&
        team.completed >= (team.total || normalizedMissionTotal);
      const finishLabel = isFinished ? formatFinishTime(team.finishedAt) : "";
      const finishTimeHtml = finishLabel ? `<span class="rank-finish-time">${finishLabel}</span>` : "";
      row.innerHTML = `
        <div class="rank-info">
          <span class="rank-order">${index + 1}</span>
          <span class="rank-name">${safeLabel} ${myTeamTag}</span>
        </div>
        <div class="rank-stats">
          <span class="rank-progress">${team.completed}/${team.total}</span>
          ${finishTimeHtml}
        </div>
      `;
      listEl.appendChild(row);
    });
    sorted.forEach((team, index) => {
      previousPositions.set(team.id || team.label, index);
    });
    if (typeof onChange === "function") {
      onChange(sorted);
    }
  }

  function setTeams(next = []) {
    state = normalizeTeamList(next);
    render();
  }

  if (projectId) {
    render();
    const teamsRef = ref(db, `projects/${projectId}/teams`);
    onValue(teamsRef, (snapshot) => {
      const raw = snapshot.val() || {};
      const compiled = Object.entries(raw).map(([teamId, teamData]) =>
        formatTeamEntry(teamId, teamData, normalizedMissionTotal)
      );
      setTeams(compiled);
    });
    if (button) {
      button.style.display = "none";
    }
  } else {
    render();
    if (button) {
      button.addEventListener("click", () => {
        state = state.map((team) => ({
          ...team,
          completed: Math.max(0, Math.min(team.total, Math.floor(Math.random() * (team.total + 1)))),
        }));
        render();
      });
    }
  }

  return {
    update(nextList = []) {
      const formatted = nextList.map((entry, index) => {
        const order = entry.order ?? index + 1;
        const number = entry.number ?? order;
        return {
          id: entry.id || entry.name || `Team${index + 1}`,
          label: ensureTeamLabel(entry.name || entry.label || `Team ${index + 1}`, number),
          nickname: entry.nickname || "",
          completed: entry.progress ?? entry.completed ?? 0,
          total: entry.total || normalizedMissionTotal,
          order,
          number,
          finishedAt: entry.finishedAt ?? null,
        };
      });
      setTeams(formatted);
    },
  };
}

function formatTeamEntry(teamId, teamData = {}, missionTotal = DEFAULT_TOTAL_MISSIONS) {
  const profile = teamData.profile || {};
  const missions = teamData.missions || {};
  const total = deriveTeamMissionTotal(teamData, missionTotal);
  let completed = 0;
  Object.keys(missions).forEach((key) => {
    if (missions[key]?.stage === "done") completed += 1;
  });
  completed = Math.min(completed, total);
  const order =
    typeof profile.number === "number"
      ? profile.number
      : parseInt(String(teamId).replace(/\D+/g, ""), 10) || Number.MAX_SAFE_INTEGER;
  const official = resolveOfficialTeamName(
    profile,
    teamId,
    Number.isFinite(order) && order !== Number.MAX_SAFE_INTEGER ? order : null
  );
  const labelValue = ensureTeamLabel(official || teamId || "", order);
  const nickname = profile.nickname || "";
  const finishedAt = normalizeFinishTimestamp(profile.finishedAt);
  return {
    id: teamId,
    label: labelValue,
    completed,
    total: total || missionTotal,
    order,
    profile,
    nickname,
    number: Number.isFinite(order) ? order : null,
    displayLabel: buildDisplayLabel(
      { label: labelValue, nickname, number: Number.isFinite(order) ? order : null },
      true
    ),
    finishedAt,
  };
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildDisplayLabel(team = {}, includeNickname = false) {
  const baseLabel = ensureTeamLabel(team.label, team.number || team.order);
  const nickname = (team.nickname || "").trim();
  if (includeNickname && nickname) {
    return `${baseLabel} ${nickname}`.trim();
  }
  if (team.displayLabel && includeNickname) {
    return team.displayLabel;
  }
  return baseLabel;
}

function ensureTeamLabel(label = "", fallbackNumber = null) {
  let baseName = (label || "").trim();
  if (!baseName && Number.isFinite(fallbackNumber)) {
    baseName = `${fallbackNumber}팀`;
  }
  const compact = baseName.replace(/\s+/g, "");
  if (/^\d+$/.test(compact)) {
    return `${compact}팀`;
  }
  if (/^\d+팀$/.test(compact)) {
    return compact;
  }
  return baseName || (Number.isFinite(fallbackNumber) ? `${fallbackNumber}팀` : "TEAM");
}

function clampMissionTotal(value) {
  const num = Number.isFinite(value) ? value : DEFAULT_TOTAL_MISSIONS;
  return Math.max(MIN_MISSIONS, Math.min(MAX_MISSIONS, num));
}

function deriveTeamMissionTotal(teamData = {}, fallback = DEFAULT_TOTAL_MISSIONS) {
  const profile = teamData.profile || {};
  const configMissions = teamData.config?.missions || {};
  const missionsRaw = teamData.missions || {};
  const profileTotal = Number(profile.missionTotal);
  let maxMission = Number.isFinite(profileTotal) && profileTotal > 0 ? profileTotal : 0;
  Object.keys(configMissions).forEach((key) => {
    const n = Number(key);
    if (Number.isFinite(n)) maxMission = Math.max(maxMission, n);
  });
  Object.keys(missionsRaw).forEach((key) => {
    const n = Number(key);
    if (Number.isFinite(n)) maxMission = Math.max(maxMission, n);
  });
  if (maxMission > 0) return clampMissionTotal(maxMission);
  return clampMissionTotal(fallback);
}

function normalizeFinishTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
}

function defaultFinishTimeFormatter(timestamp) {
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
