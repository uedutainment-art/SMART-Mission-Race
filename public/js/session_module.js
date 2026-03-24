const STORAGE_KEY = "smrTeamSession";
const PERSISTED_STORAGE_KEY = "smrTeamSessionPersisted";

function buildLocalPageUrl(pageName) {
  return new URL(`./${pageName}`, window.location.href).toString();
}

export function storeTeamSession(payload = {}) {
  const value = JSON.stringify({ ...payload, ts: Date.now() });
  sessionStorage.setItem(STORAGE_KEY, value);
  localStorage.setItem(PERSISTED_STORAGE_KEY, value);
}

export function loadTeamSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(PERSISTED_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!sessionStorage.getItem(STORAGE_KEY)) {
      sessionStorage.setItem(STORAGE_KEY, raw);
    }
    return parsed;
  } catch (_error) {
    return null;
  }
}

export function clearTeamSession() {
  sessionStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PERSISTED_STORAGE_KEY);
}

export function requireTeamSession() {
  const session = loadTeamSession();
  if (!session) {
    window.location.href = buildLocalPageUrl("team_login.html");
    return null;
  }
  if (!session.teamId) {
    window.location.href = buildLocalPageUrl("team_login.html");
    return null;
  }
  const endAt = Number(session.projectEndAt) || 0;
  if (endAt && Date.now() > endAt) {
    clearTeamSession();
    window.location.href = buildLocalPageUrl("team_login.html");
    return null;
  }
  return session;
}
