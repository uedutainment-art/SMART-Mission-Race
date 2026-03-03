export const DEFAULT_MASTER_PASS = "0313";
export const DEFAULT_MISSION_TOTAL = 9;
export const DEFAULT_PHOTO_MISSION_COUNT = 1;

export const ALLOWED_STAGES = new Set(["locked", "code", "mission", "done"]);

export const STAGE_ALIASES = {
  finish: "done",
  finished: "done",
  complete: "done",
  completed: "done",
  challenge: "code",
  start: "code",
  active: "mission",
};

export function downloadFile(url, fileName) {
  const finalUrl = appendDisposition(url, fileName);
  const link = document.createElement("a");
  link.href = finalUrl;
  if (fileName) link.download = fileName;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => link.remove(), 0);
}

function appendDisposition(url, fileName) {
  const sep = url.includes("?") ? "&" : "?";
  const safe = encodeURIComponent(fileName || "photo");
  return `${url}${sep}response-content-disposition=attachment%3B%20filename%3D${safe}`;
}

export function resolveOfficialTeamName(profile = {}, teamId = "Team1", teamNumber = 1) {
  return (
    profile.teamDisplayName ||
    profile.officialTeamName ||
    profile.displayName ||
    profile.name ||
    (Number.isFinite(teamNumber) && teamNumber > 0 ? `${teamNumber}팀` : teamId || "TEAM")
  );
}

export function createDefaultMissionState(totalMissions) {
  const initial = {};
  for (let i = 1; i <= totalMissions; i++) {
    initial[i] = {
      stage: i === 1 ? "code" : "locked",
      panel: null,
    };
  }
  return initial;
}

export function sanitizeMasterPass(value = "") {
  const trimmed = (value || "").trim();
  return trimmed || DEFAULT_MASTER_PASS;
}

export function normalizePasswordValue(value = "") {
  if (value == null) return "";
  return String(value).trim();
}

export function clampMissionCount(value) {
  const num = Number.isFinite(value) ? value : DEFAULT_MISSION_TOTAL;
  return Math.max(1, Math.min(20, num));
}

export function clampPhotoMissionCount(value) {
  const num = Number.isFinite(value) ? value : DEFAULT_PHOTO_MISSION_COUNT;
  return Math.max(1, Math.min(10, num));
}

export function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return ch;
    }
  });
}

