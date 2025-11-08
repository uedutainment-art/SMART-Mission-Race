const PROJECT_KEY = "smrProjectContext";

export function storeProjectContext(payload = {}) {
  if (!payload?.projectId) return;
  const data = { ...payload, ts: Date.now() };
  localStorage.setItem(PROJECT_KEY, JSON.stringify(data));
}

export function loadProjectContext() {
  try {
    const raw = localStorage.getItem(PROJECT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

export function clearProjectContext() {
  localStorage.removeItem(PROJECT_KEY);
}

export function requireProjectContext(options = {}) {
  const ctx = loadProjectContext();
  if (!ctx) {
    if (options.redirect !== false) {
      window.location.href = options.fallbackUrl || "/admin.html";
    }
    return null;
  }
  return ctx;
}
