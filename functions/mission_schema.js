export function normalizeCount(value, max = 10) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(max, Math.floor(parsed)));
}

export function normalizeAdvanceSeconds(value, max = 3600) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(max, Math.floor(parsed)));
}

export function normalizeMissionConfig(mission = {}) {
  const codeStep = mission.codeStep || {};
  const missionStep = mission.missionStep || {};
  const photoPlan = Array.isArray(mission.photoPlan) ? mission.photoPlan.filter((item) => item?.slotId) : [];
  const resolvedPhotoSlots = photoPlan.length || (mission.photoSlots ?? missionStep.photoSlots);
  const resolvedSpecialSlots = mission.specialSlots ?? missionStep.specialSlots;
  const activeStep = codeStep.mode === "photo_hq" ? codeStep : missionStep;
  return {
    photoSlots: normalizeCount(resolvedPhotoSlots, 10),
    specialSlots: photoPlan.length ? 0 : normalizeCount(resolvedSpecialSlots, 10),
    autoAdvanceSeconds: normalizeAdvanceSeconds(activeStep.autoAdvanceSeconds ?? mission.autoAdvanceSeconds, 3600),
  };
}

function defaultRouteKeys(middleCount = 1) {
  return Array.from({ length: Math.max(1, middleCount) }, (_, index) => {
    if (index < 26) return String.fromCharCode(65 + index);
    return `K${index + 1}`;
  });
}

function normalizeMissionRouteToken(value = "") {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "START") return "S";
  if (normalized === "LAST") return "L";
  return normalized;
}

function normalizeMissionKeys(rawKeys, middleCount) {
  const keys = Array.isArray(rawKeys)
    ? rawKeys.map((value) => normalizeMissionRouteToken(value)).filter(Boolean)
    : [];
  const next = keys.length ? keys.slice(0, middleCount) : defaultRouteKeys(middleCount);
  while (next.length < middleCount) {
    next.push(defaultRouteKeys(middleCount)[next.length]);
  }
  return next;
}

function resolveRouteMissionKey(routing = {}, teamId = "", missionNumber = 1, missionTotal = 9) {
  if (missionNumber === 1) return normalizeMissionRouteToken(routing.startRoutes?.[teamId] || "S");
  if (missionNumber === missionTotal) return normalizeMissionRouteToken(routing.endRoutes?.[teamId] || "L");
  const middleCount = Math.max(1, missionTotal - 2);
  const missionKeys = normalizeMissionKeys(routing.missionKeys, middleCount);
  const routeIndex = missionNumber - 2;
  const teamRoute = Array.isArray(routing.routes?.[teamId]) ? routing.routes[teamId] : [];
  const explicitKey = normalizeMissionRouteToken(teamRoute[routeIndex] || "");
  if (explicitKey) return explicitKey;
  return normalizeMissionRouteToken(missionKeys[routeIndex] || missionKeys[0] || "A");
}

function extractCodeVariantBase(codeKey = "") {
  const normalized = normalizeCodeRouteToken(codeKey);
  return normalized.includes("-") ? normalized.split("-")[0] : normalized;
}

function normalizeCodeRouteToken(value = "") {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return "";
  const match = normalized.match(/^C(\d+(?:-\d+)?)$/);
  return match ? match[1] : normalized;
}

function resolveRouteCodeKey(routing = {}, teamId = "", missionNumber = 1) {
  const missionNo = Number(missionNumber) > 0 ? Number(missionNumber) : 1;
  const total = Array.isArray(routing.missionKeys) ? routing.missionKeys.length + 2 : 9;
  if (missionNo <= 1) {
    return normalizeCodeRouteToken(routing.startCodeRoutes?.[teamId] || "1").trim().toUpperCase() || "1";
  }
  if (missionNo >= total) {
    return normalizeCodeRouteToken(routing.endCodeRoutes?.[teamId] || String(missionNo)).trim().toUpperCase() || String(missionNo);
  }
  const routeIndex = missionNo - 2;
  const teamCodeRoute = Array.isArray(routing.codeRoutes?.[teamId]) ? routing.codeRoutes[teamId] : [];
  const explicitKey = normalizeCodeRouteToken(teamCodeRoute[routeIndex] || "").trim().toUpperCase();
  return explicitKey || String(missionNo).trim().toUpperCase();
}

function getResolvedCodeLibraryEntry(routing = {}, codeKey = "", missionNumber = 1, meta = {}) {
  const normalizedKey = normalizeCodeRouteToken(codeKey).trim().toUpperCase();
  const baseKey = extractCodeVariantBase(normalizedKey);
  const codeNumber = Number(baseKey) || (Number(missionNumber) > 0 ? Number(missionNumber) : 1);
  const rainMode = isRainModeEnabled(meta);
  const baseEntry = normalizedKey && normalizedKey !== baseKey
    ? (routing.codeVariants?.[codeNumber]?.[normalizedKey] || {})
    : (routing.codeLibrary?.[codeNumber] || routing.codeLibrary?.[String(codeNumber)] || {});
  const baseImageUrl = String(baseEntry.imageUrl || "").trim();
  return {
    ...baseEntry,
    displayName: String(baseEntry.displayName || `코드 ${normalizedKey || codeNumber}`).trim(),
    answer: String(baseEntry.answer || normalizedKey || codeNumber || "1").trim() || "1",
    imageUrl: rainMode ? String(baseEntry.rainImageUrl || baseImageUrl).trim() || baseImageUrl : baseImageUrl,
  };
}

function isRainModeEnabled(meta = {}) {
  return meta?.rainMode === true || meta?.weatherMode === "rain";
}

function renderAnswerTemplate(template = "", context = {}) {
  const map = {
    teamNo: context.teamNumber ?? "",
    teamId: context.teamId ?? "",
    key: context.key ?? "",
    missionKey: context.key ?? "",
    missionNo: context.missionNumber ?? "",
  };
  return String(template || "").replace(/\{(teamNo|teamId|key|missionKey|missionNo)\}/g, (_match, token) => String(map[token] ?? ""));
}

function renderStoredAnswers(mission = {}, { teamId = "", missionNumber = 1, routeKey = "" } = {}) {
  const teamNumber = Number(String(teamId || "").replace("Team", "")) || 0;
  const context = {
    teamId,
    teamNumber,
    key: routeKey || mission.routeKey || "",
    missionNumber,
  };
  const next = {
    ...mission,
    codeStep: { ...(mission.codeStep || {}) },
    missionStep: { ...(mission.missionStep || {}) },
  };
  if (String(next.codeAnswer || "").includes("{")) {
    next.codeAnswer = renderAnswerTemplate(next.codeAnswer, context) || next.codeAnswer;
  }
  if (String(next.missionAnswer || "").includes("{")) {
    next.missionAnswer = renderAnswerTemplate(next.missionAnswer, context) || next.missionAnswer;
  }
  if (String(next.codeStep?.answer || "").includes("{")) {
    next.codeStep.answer = renderAnswerTemplate(next.codeStep.answer, context) || next.codeStep.answer;
  }
  if (String(next.missionStep?.answer || "").includes("{")) {
    next.missionStep.answer = renderAnswerTemplate(next.missionStep.answer, context) || next.missionStep.answer;
  }
  return next;
}

function getEffectiveMissionLibraryEntry(entry = {}, routeKey = "", meta = {}) {
  const source = entry && typeof entry === "object" ? entry : {};
  const rainMode = isRainModeEnabled(meta);
  const baseName = String(source.displayName || routeKey).trim();
  return {
    ...source,
    displayName: baseName,
    photoSlots: normalizeCount(source.photoSlots || 0),
    specialSlots: normalizeCount(source.specialSlots || 0),
    autoAdvanceSeconds: normalizeAdvanceSeconds(source.autoAdvanceSeconds || 0),
  };
}

function buildOutdoorMissionConfig({
  routing = null,
  teamId = "",
  missionNumber = 2,
  missionTotal = 9,
} = {}) {
  const missionNo = Number(missionNumber) > 0 ? Number(missionNumber) : 1;
  if (missionNo <= 1 || missionNo >= missionTotal) {
    const routeKey = resolveRouteMissionKey(routing || {}, teamId, missionNo, missionTotal);
    const missionLibraryEntry = getEffectiveMissionLibraryEntry(routing?.missionLibrary?.[routeKey] || {}, routeKey, {});
    return {
      routeKey,
      routeLabel: String(missionLibraryEntry.displayName || routeKey).trim(),
      photoSlots: normalizeCount(missionLibraryEntry.photoSlots || 0),
      specialSlots: normalizeCount(missionLibraryEntry.specialSlots || 0),
      photoPlan: Array.isArray(missionLibraryEntry.photoPlan) ? missionLibraryEntry.photoPlan.filter((item) => item?.slotId) : [],
      missionStep: {
        mode: missionLibraryEntry.mode || "answer",
        autoAdvanceSeconds: normalizeAdvanceSeconds(missionLibraryEntry.autoAdvanceSeconds || 0),
        photoSlots: normalizeCount((missionLibraryEntry.photoPlan || []).length || missionLibraryEntry.photoSlots || 0),
        specialSlots: Array.isArray(missionLibraryEntry.photoPlan) && missionLibraryEntry.photoPlan.length
          ? 0
          : normalizeCount(missionLibraryEntry.specialSlots || 0),
      },
    };
  }
  const assetKey = resolveRouteMissionKey(routing || {}, teamId, missionNo, missionTotal);
  const asset =
    routing?.outdoorAssets?.[missionNo]?.[assetKey]
    || routing?.outdoorAssets?.[String(missionNo)]?.[assetKey]
    || null;
  if (!asset) {
    const routeKey = resolveRouteMissionKey(routing || {}, teamId, missionNo, missionTotal);
    const missionLibraryEntry = getEffectiveMissionLibraryEntry(routing?.missionLibrary?.[routeKey] || {}, routeKey, {});
    return {
      routeKey,
      routeLabel: String(missionLibraryEntry.displayName || routeKey).trim(),
      photoSlots: normalizeCount(missionLibraryEntry.photoSlots || 0),
      specialSlots: normalizeCount(missionLibraryEntry.specialSlots || 0),
      photoPlan: Array.isArray(missionLibraryEntry.photoPlan) ? missionLibraryEntry.photoPlan.filter((item) => item?.slotId) : [],
      missionStep: {
        mode: missionLibraryEntry.mode || "answer",
        autoAdvanceSeconds: normalizeAdvanceSeconds(missionLibraryEntry.autoAdvanceSeconds || 0),
        photoSlots: normalizeCount((missionLibraryEntry.photoPlan || []).length || missionLibraryEntry.photoSlots || 0),
        specialSlots: Array.isArray(missionLibraryEntry.photoPlan) && missionLibraryEntry.photoPlan.length
          ? 0
          : normalizeCount(missionLibraryEntry.specialSlots || 0),
      },
    };
  }
  const photoPlan = Array.isArray(asset.photoPlan) ? asset.photoPlan.filter((item) => item?.slotId) : [];
  return {
    routeKey: assetKey,
    routeLabel: String(asset.label || assetKey).trim(),
    photoSlots: normalizeCount(photoPlan.length || asset.photoSlots || 0),
    specialSlots: 0,
    photoPlan,
    missionStep: {
      mode: asset.missionMode || "answer",
      autoAdvanceSeconds: normalizeAdvanceSeconds(asset.autoAdvanceSeconds || 0),
      photoSlots: normalizeCount(photoPlan.length || asset.photoSlots || 0),
      specialSlots: 0,
    },
  };
}

export function resolveMissionConfigForTeam({
  routing = null,
  teamOverride = null,
  legacyMission = null,
  teamId = "",
  missionNumber = 1,
  missionTotal = 9,
  meta = null,
} = {}) {
  const missionNo = Number(missionNumber) > 0 ? Number(missionNumber) : 1;
  const overrideMission = teamOverride?.[missionNo] || teamOverride?.[String(missionNo)] || null;
  if (!routing) {
    return { ...(legacyMission || {}), ...(overrideMission || {}) };
  }

  const base = routing?.mode === "outdoor"
    ? buildOutdoorMissionConfig({
        routing,
        teamId,
        missionNumber: missionNo,
        missionTotal: Number(missionTotal) || 9,
      })
    : (() => {
        const routeKey = resolveRouteMissionKey(routing, teamId, missionNo, Number(missionTotal) || 9);
        const missionLibraryEntry = getEffectiveMissionLibraryEntry(routing.missionLibrary?.[routeKey] || {}, routeKey, meta || {});
        return {
          routeKey,
          routeLabel: String(missionLibraryEntry.displayName || routeKey).trim(),
          photoSlots: normalizeCount(missionLibraryEntry.photoSlots || 0),
          specialSlots: normalizeCount(missionLibraryEntry.specialSlots || 0),
          photoPlan: Array.isArray(missionLibraryEntry.photoPlan) ? missionLibraryEntry.photoPlan.filter((item) => item?.slotId) : [],
          missionStep: {
            mode: missionLibraryEntry.mode || "answer",
            autoAdvanceSeconds: normalizeAdvanceSeconds(missionLibraryEntry.autoAdvanceSeconds || 0),
            photoSlots: normalizeCount((missionLibraryEntry.photoPlan || []).length || missionLibraryEntry.photoSlots || 0),
            specialSlots: Array.isArray(missionLibraryEntry.photoPlan) && missionLibraryEntry.photoPlan.length
              ? 0
              : normalizeCount(missionLibraryEntry.specialSlots || 0),
          },
        };
      })();
  if (legacyMission && Object.keys(legacyMission).length) {
    const merged = {
      ...base,
      ...legacyMission,
      codeStep: {
        ...(base.codeStep || {}),
        ...(legacyMission.codeStep || {}),
      },
      missionStep: {
        ...(base.missionStep || {}),
        ...(legacyMission.missionStep || {}),
      },
    };
    if (routing?.mode !== "outdoor") {
      merged.codeKey = resolveRouteCodeKey(routing, teamId, missionNo);
    }
    return renderStoredAnswers(merged, {
      teamId,
      missionNumber: missionNo,
      routeKey: legacyMission.routeKey || base.routeKey,
    });
  }
  if (!overrideMission) {
    if (routing?.mode !== "outdoor") {
      const codeKey = resolveRouteCodeKey(routing, teamId, missionNo);
      base.codeKey = codeKey;
    }
    return base;
  }
  const merged = {
    ...base,
    ...overrideMission,
    missionStep: {
      ...(base.missionStep || {}),
      ...(overrideMission.missionStep || {}),
    },
  };
  if (routing?.mode !== "outdoor") {
    merged.codeKey = resolveRouteCodeKey(routing, teamId, missionNo);
  }
  return renderStoredAnswers(merged, {
    teamId,
    missionNumber: missionNo,
    routeKey: overrideMission.routeKey || base.routeKey,
  });
}

export function buildRequiredSlots(mission = {}, options = {}) {
  const config = normalizeMissionConfig(mission);
  if (Array.isArray(mission.photoPlan) && mission.photoPlan.length) {
    return mission.photoPlan
      .map((item) => String(item?.slotId || "").trim())
      .filter(Boolean);
  }
  const slots = [];
  for (let i = 1; i <= config.photoSlots; i += 1) slots.push(`Photo${i}`);
  for (let i = 1; i <= config.specialSlots; i += 1) slots.push(`S${i}`);
  if (slots.length) return slots;
  return Array.isArray(options.fallbackSlots) ? [...options.fallbackSlots] : [];
}
