const STORAGE_KEY = "smrTeamSession";

export function storeTeamSession(payload = {}) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...payload, ts: Date.now() }));
}

export function loadTeamSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

export function clearTeamSession() {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function requireTeamSession() {
  const session = loadTeamSession();
  if (!session) {
    window.location.href = "/team_login.html";
    return null;
  }
  if (!session.teamId) {
    window.location.href = "/team_login.html";
    return null;
  }
  return session;
}
