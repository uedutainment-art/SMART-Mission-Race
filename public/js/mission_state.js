export function createDefaultMissionState(totalMissions = 9) {
  const state = {};
  const total = Number(totalMissions) > 0 ? Number(totalMissions) : 9;
  for (let i = 1; i <= total; i += 1) {
    state[i] = {
      stage: i === 1 ? "code" : "locked",
      panel: null,
      stepStatus: null,
      unlockAt: null,
      completedAt: null,
    };
  }
  return state;
}
