import { db, ref, onValue } from "./firebase_config.js";

const DEFAULT_TEAMS = [
  { id: "Team1", label: "Team 1", completed: 5, total: 9, order: 1 },
  { id: "Team2", label: "Team 2", completed: 4, total: 9, order: 2 },
  { id: "Team3", label: "Team 3", completed: 3, total: 9, order: 3 },
  { id: "Team4", label: "Team 4", completed: 2, total: 9, order: 4 },
  { id: "Team5", label: "Team 5", completed: 1, total: 9, order: 5 },
];

const DEFAULT_TOTAL_MISSIONS = 9;

function getNumericMissionKeyCount(source = {}) {
  const numericKeys = Object.keys(source || {})
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
  return numericKeys.length ? Math.max(...numericKeys) : 0;
}

function getMostCommonValue(values = []) {
  const counts = new Map();
  values.forEach((value) => {
    if (!Number.isFinite(value) || value <= 0) return;
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  let bestValue = 0;
  let bestCount = -1;
  counts.forEach((count, value) => {
    if (count > bestCount || (count === bestCount && value < bestValue)) {
      bestValue = value;
      bestCount = count;
    }
  });
  return bestValue;
}

export function initRankModule({
  listId = "rankList",
  simulateButtonId = "simulateBtn",
  teams = DEFAULT_TEAMS,
  highlightTeam = "",
  projectId = null,
  missionTotal = DEFAULT_TOTAL_MISSIONS,
  onChange = null,
} = {}) {
  const listEl = document.getElementById(listId);
  if (!listEl) {
    return { update: () => {} };
  }

  const button = simulateButtonId ? document.getElementById(simulateButtonId) : null;
  let state = Array.isArray(teams) ? [...teams] : [...DEFAULT_TEAMS];
  let latestRawTeams = {};
  let effectiveMissionTotal = Math.max(1, Number(missionTotal) || DEFAULT_TOTAL_MISSIONS);
  if (projectId) {
    state = [];
  }
  const previousPositions = new Map();

  function resolveProjectMissionTotal(project = {}) {
    const teamConfigTotals = Object.values(project?.teams || {})
      .map((team) => getNumericMissionKeyCount(team?.config?.missions || {}))
      .filter((value) => value > 0);
    const consensusTeamConfigTotal = getMostCommonValue(teamConfigTotals);
    const metaMissionTotal = Number(project?.meta?.missionTotal);
    const routeMissionKeys = Array.isArray(project?.routing?.missionKeys)
      ? project.routing.missionKeys.filter(Boolean).length
      : 0;
    const candidates = [
      consensusTeamConfigTotal,
      Number.isFinite(metaMissionTotal) && metaMissionTotal > 0 ? Math.floor(metaMissionTotal) : 0,
      routeMissionKeys > 0 ? routeMissionKeys + 2 : 0,
      effectiveMissionTotal,
    ].filter((value) => Number.isFinite(value) && value > 0);
    return candidates.length ? Math.min(...candidates) : effectiveMissionTotal;
  }

  function rebuildProjectState() {
    state = Object.entries(latestRawTeams || {}).map(([teamId, teamData]) =>
      formatTeamEntry(teamId, teamData, effectiveMissionTotal)
    );
    render();
  }

  function render() {
    listEl.innerHTML = "";
    const sorted = [...state].sort((a, b) => {
      if (b.completed !== a.completed) return b.completed - a.completed;
      const aFinishedAt = Number(a.finishedAt) || 0;
      const bFinishedAt = Number(b.finishedAt) || 0;
      if (aFinishedAt && bFinishedAt && aFinishedAt !== bFinishedAt) return aFinishedAt - bFinishedAt;
      if (aFinishedAt && !bFinishedAt) return -1;
      if (!aFinishedAt && bFinishedAt) return 1;
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

      row.innerHTML = `
        <div class="rank-info">
          <span class="rank-order">${index + 1}</span>
          <span class="rank-name">${team.label}</span>
        </div>
        <span class="rank-progress">${team.completed}/${team.total}</span>
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
    state = Array.isArray(next) ? next : [];
    render();
  }

  if (projectId) {
    render();
    const projectRef = ref(db, `projects/${projectId}`);
    const teamsRef = ref(db, `projects/${projectId}/teams`);
    onValue(projectRef, (snapshot) => {
      const project = snapshot.val() || {};
      effectiveMissionTotal = resolveProjectMissionTotal(project);
      rebuildProjectState();
    });
    onValue(teamsRef, (snapshot) => {
      latestRawTeams = snapshot.val() || {};
      rebuildProjectState();
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
      const formatted = nextList.map((entry, index) => ({
        id: entry.id || entry.name || `Team${index + 1}`,
        label: entry.name || entry.label || `Team ${index + 1}`,
        completed: entry.progress ?? entry.completed ?? 0,
        total: entry.total || missionTotal,
        order: entry.order ?? index + 1,
      }));
      setTeams(formatted);
    },
  };
}

function formatTeamEntry(teamId, teamData = {}, missionTotal = DEFAULT_TOTAL_MISSIONS) {
  const profile = teamData.profile || {};
  const missions = teamData.missions || {};
  const configMissionTotal = getNumericMissionKeyCount(teamData?.config?.missions || {});
  const totalCandidates = [configMissionTotal, Number(missionTotal) || 0].filter((value) => Number.isFinite(value) && value > 0);
  const total = totalCandidates.length ? Math.min(...totalCandidates) : DEFAULT_TOTAL_MISSIONS;
  const completed = Object.entries(missions).reduce(
    (count, [key, value]) => count + ((Number(key) >= 1 && Number(key) <= total && value?.stage === "done") ? 1 : 0),
    0
  );
  const finishedAt = Object.entries(missions).reduce((latest, [key, value]) => {
    const missionNumber = Number(key);
    if (!(missionNumber >= 1 && missionNumber <= total) || value?.stage !== "done") return latest;
    const completedAt = Number(value?.completedAt) || 0;
    return completedAt > latest ? completedAt : latest;
  }, 0);
  const order =
    typeof profile.number === "number"
      ? profile.number
      : parseInt(String(teamId).replace(/\D+/g, ""), 10) || Number.MAX_SAFE_INTEGER;
  const alias = (profile.name || "").trim();
  const base = Number.isFinite(order) && order !== Number.MAX_SAFE_INTEGER ? `${order}팀` : teamId;
  const label = alias ? `${base} ${alias}` : base;
  return {
    id: teamId,
    label,
    completed,
    total,
    order,
    finishedAt,
  };
}
