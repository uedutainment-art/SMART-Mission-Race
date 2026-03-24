import {
  STEP_MODES,
  createDefaultMissionEntry,
  normalizeAdvanceSeconds,
  normalizeCount,
  normalizeMissionEntry,
  normalizePhotoPlan,
} from "./mission_rules.js";

function toMissionNumber(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
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
  if (String(next.codeStep.answer || "").includes("{")) {
    next.codeStep.answer = renderAnswerTemplate(next.codeStep.answer, context) || next.codeStep.answer;
  }
  if (String(next.missionStep.answer || "").includes("{")) {
    next.missionStep.answer = renderAnswerTemplate(next.missionStep.answer, context) || next.missionStep.answer;
  }
  return next;
}

function isRainModeEnabled(meta = {}) {
  return meta?.rainMode === true || meta?.weatherMode === "rain";
}

function getEffectiveCodeLibraryEntry(entry = {}, missionNumber = 1, meta = {}) {
  const rainMode = isRainModeEnabled(meta);
  const baseName = String(entry.displayName || `코드 ${missionNumber}`).trim();
  const baseAnswer = String(entry.answer || missionNumber || "1").trim() || "1";
  const baseImageUrl = String(entry.imageUrl || "").trim();
  return {
    ...entry,
    displayName: baseName,
    answer: baseAnswer,
    imageUrl: rainMode ? String(entry.rainImageUrl || baseImageUrl).trim() || baseImageUrl : baseImageUrl,
  };
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
  const missionNo = toMissionNumber(missionNumber, 1);
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
  const codeNumber = Number(baseKey) || toMissionNumber(missionNumber, 1);
  if (normalizedKey && normalizedKey !== baseKey) {
    return getEffectiveCodeLibraryEntry(
      routing.codeVariants?.[codeNumber]?.[normalizedKey] || {},
      codeNumber,
      meta,
    );
  }
  return getEffectiveCodeLibraryEntry(
    routing.codeLibrary?.[codeNumber] || routing.codeLibrary?.[String(codeNumber)] || {},
    codeNumber,
    meta,
  );
}

function getEffectiveMissionLibraryEntry(entry = {}, routeKey = "", meta = {}) {
  const rainMode = isRainModeEnabled(meta);
  const baseName = String(entry.displayName || routeKey).trim();
  const baseTemplate = String(entry.answerTemplate || "").trim();
  const baseImageUrl = String(entry.imageUrl || "").trim();
  return {
    ...entry,
    displayName: baseName,
    answerTemplate: baseTemplate,
    imageUrl: rainMode ? String(entry.rainImageUrl || baseImageUrl).trim() || baseImageUrl : baseImageUrl,
  };
}

function buildMissionFromRouting({
  routing = {},
  teamId = "",
  missionNumber = 1,
  missionTotal = 9,
  meta = {},
}) {
  const routeKey = resolveRouteMissionKey(routing, teamId, missionNumber, missionTotal);
  const teamNumber = Number(String(teamId || "").replace("Team", "")) || 0;
  const codeKey = resolveRouteCodeKey(routing, teamId, missionNumber);
  const codeLibraryEntry = getResolvedCodeLibraryEntry(routing, codeKey, missionNumber, meta);
  const missionLibraryEntry = getEffectiveMissionLibraryEntry(routing.missionLibrary?.[routeKey] || {}, routeKey, meta);
  const missionAnswer = renderAnswerTemplate(missionLibraryEntry.answerTemplate, {
    teamId,
    teamNumber,
    key: routeKey,
    missionNumber,
  }) || "1";
  return normalizeMissionEntry({
    codeAnswer: String(codeLibraryEntry.answer || missionNumber || "1").trim() || "1",
    codeImageUrl: String(codeLibraryEntry.imageUrl || "").trim(),
    missionAnswer,
    missionImageUrl: String(missionLibraryEntry.imageUrl || "").trim(),
    photoSlots: normalizeCount(missionLibraryEntry.photoSlots || 0),
    specialSlots: normalizeCount(missionLibraryEntry.specialSlots || 0),
    photoPlan: normalizePhotoPlan(missionLibraryEntry.photoPlan, {
      photoSlots: missionLibraryEntry.photoSlots || 0,
      specialSlots: missionLibraryEntry.specialSlots || 0,
    }),
    codeLabel: String(codeLibraryEntry.displayName || `코드 ${missionNumber}`).trim(),
    routeLabel: String(missionLibraryEntry.displayName || routeKey).trim(),
    routeKey,
    codeKey,
    codeStep: {
      mode: codeLibraryEntry.mode || STEP_MODES.ANSWER,
      answer: String(codeLibraryEntry.answer || missionNumber || "1").trim() || "1",
      autoAdvanceSeconds: normalizeAdvanceSeconds(codeLibraryEntry.autoAdvanceSeconds || 0),
      allowBypass: codeLibraryEntry.allowBypass !== false,
    },
    missionStep: {
      mode: missionLibraryEntry.mode || STEP_MODES.ANSWER,
      answer: missionAnswer,
      autoAdvanceSeconds: normalizeAdvanceSeconds(missionLibraryEntry.autoAdvanceSeconds || 0),
      allowBypass: missionLibraryEntry.allowBypass !== false,
      photoSlots: normalizeCount(missionLibraryEntry.photoSlots || 0),
      specialSlots: normalizeCount(missionLibraryEntry.specialSlots || 0),
    },
  });
}

function buildMissionFromOutdoorRouting({
  routing = {},
  teamId = "",
  missionNumber = 2,
  missionTotal = 9,
} = {}) {
  const missionNo = toMissionNumber(missionNumber, 1);
  if (missionNo <= 1 || missionNo >= missionTotal) {
    return buildMissionFromRouting({
      routing,
      teamId,
      missionNumber: missionNo,
      missionTotal,
    });
  }
  const assetKey = resolveRouteMissionKey(routing, teamId, missionNo, missionTotal);
  const asset =
    routing.outdoorAssets?.[missionNo]?.[assetKey]
    || routing.outdoorAssets?.[String(missionNo)]?.[assetKey]
    || null;
  const teamNumber = Number(String(teamId || "").replace("Team", "")) || 0;
  if (!asset) {
    return buildMissionFromRouting({
      routing,
      teamId,
      missionNumber: missionNo,
      missionTotal,
      meta: {},
    });
  }
  const missionAnswer = renderAnswerTemplate(asset.missionAnswerTemplate, {
    teamId,
    teamNumber,
    key: assetKey,
    missionNumber: missionNo,
  }) || "1";
  return normalizeMissionEntry({
    codeAnswer: String(asset.codeAnswer || `${assetKey}${missionNo}`).trim() || "1",
    codeImageUrl: String(asset.codeImageUrl || "").trim(),
    missionAnswer,
    missionImageUrl: String(asset.missionImageUrl || "").trim(),
    photoSlots: normalizeCount(asset.photoPlan?.length || asset.photoSlots || 0),
    specialSlots: 0,
    photoPlan: normalizePhotoPlan(asset.photoPlan, {
      photoSlots: asset.photoPlan?.length || asset.photoSlots || 0,
      specialSlots: 0,
    }),
    codeLabel: String(asset.label || `${missionNo}-${assetKey}`).trim(),
    routeLabel: String(asset.label || assetKey).trim(),
    routeKey: assetKey,
    codeStep: {
      mode: STEP_MODES.ANSWER,
      answer: String(asset.codeAnswer || `${assetKey}${missionNo}`).trim() || "1",
      autoAdvanceSeconds: 0,
      allowBypass: true,
    },
    missionStep: {
      mode: asset.missionMode || STEP_MODES.ANSWER,
      answer: missionAnswer,
      autoAdvanceSeconds: normalizeAdvanceSeconds(asset.autoAdvanceSeconds || 0),
      allowBypass: true,
      photoSlots: normalizeCount(asset.photoPlan?.length || asset.photoSlots || 0),
      specialSlots: 0,
    },
  });
}

export function resolveMissionConfigFromProject({
  teamId = "",
  missionNumber = 1,
  missionTotal = 9,
  routing = null,
  teamOverride = null,
  legacyMission = null,
  meta = null,
} = {}) {
  const missionNo = toMissionNumber(missionNumber, 1);
  const overrideMission = teamOverride?.[missionNo] || teamOverride?.[String(missionNo)] || null;
  const hasLegacyMission = legacyMission && Object.keys(legacyMission).length > 0;
  const hasRouting = !!routing;
  if (!hasRouting) {
    return normalizeMissionEntry(renderStoredAnswers(
      overrideMission || legacyMission || createDefaultMissionEntry(),
      {
        teamId,
        missionNumber: missionNo,
        routeKey: overrideMission?.routeKey || legacyMission?.routeKey || "",
      },
    ));
  }
  const total = toMissionNumber(missionTotal, 9);
  const base = routing?.mode === "outdoor"
    ? buildMissionFromOutdoorRouting({
        routing,
        teamId,
        missionNumber: missionNo,
        missionTotal: total,
      })
    : buildMissionFromRouting({
        routing,
        teamId,
        missionNumber: missionNo,
        missionTotal: total,
        meta: meta || {},
      });
  if (hasLegacyMission) {
    return normalizeMissionEntry(renderStoredAnswers({
      ...base,
      ...legacyMission,
      codeStep: {
        ...base.codeStep,
        ...(legacyMission.codeStep || {}),
      },
      missionStep: {
        ...base.missionStep,
        ...(legacyMission.missionStep || {}),
      },
    }, {
      teamId,
      missionNumber: missionNo,
      routeKey: legacyMission.routeKey || base.routeKey,
    }));
  }
  if (!overrideMission) return base;
  return normalizeMissionEntry(renderStoredAnswers({
    ...base,
    ...overrideMission,
    codeStep: {
      ...base.codeStep,
      ...(overrideMission.codeStep || {}),
    },
    missionStep: {
      ...base.missionStep,
      ...(overrideMission.missionStep || {}),
    },
  }, {
    teamId,
    missionNumber: missionNo,
    routeKey: overrideMission.routeKey || base.routeKey,
  }));
}
