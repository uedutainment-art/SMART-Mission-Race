export const STEP_MODES = {
  ANSWER: "answer",
  QR: "qr",
  HQ: "hq",
  PHOTO_HQ: "photo_hq",
};

export function createDefaultStepConfig(overrides = {}) {
  return {
    mode: STEP_MODES.ANSWER,
    answer: "1",
    autoAdvanceSeconds: 0,
    allowBypass: true,
    photoSlots: 0,
    specialSlots: 0,
    ...overrides,
  };
}

export function createDefaultMissionEntry() {
  return {
    codeAnswer: "1",
    missionAnswer: "1",
    codeImageUrl: "",
    missionImageUrl: "",
    photoSlots: 0,
    specialSlots: 0,
    photoPlan: [],
    codeStep: createDefaultStepConfig({
      mode: STEP_MODES.ANSWER,
      answer: "1",
    }),
    missionStep: createDefaultStepConfig({
      mode: STEP_MODES.ANSWER,
      answer: "1",
    }),
  };
}

export function normalizePhotoPlan(rawPlan = [], options = {}) {
  const fallbackPhotoSlots = normalizeCount(options.photoSlots);
  const fallbackSpecialSlots = normalizeCount(options.specialSlots);
  const source = Array.isArray(rawPlan) ? rawPlan : [];
  const next = source
    .map((item, index) => {
      const label = typeof item === "string"
        ? String(item || "").trim()
        : String(item?.label || "").trim();
      const slotId = typeof item === "string"
        ? `Photo${index + 1}`
        : String(item?.slotId || item?.id || `Photo${index + 1}`).trim();
      if (!label || !slotId) return null;
      return {
        slotId,
        label,
        accept: item?.accept === "video" ? "video" : item?.accept === "image" ? "image" : "mixed",
        required: item?.required !== false,
      };
    })
    .filter(Boolean);
  if (next.length) return next;
  const fallback = [];
  for (let i = 1; i <= fallbackPhotoSlots; i += 1) {
    fallback.push({ slotId: `Photo${i}`, label: `사진 ${i}`, accept: "mixed", required: true });
  }
  for (let i = 1; i <= fallbackSpecialSlots; i += 1) {
    fallback.push({ slotId: `S${i}`, label: `추가 슬롯 ${i}`, accept: "mixed", required: true });
  }
  return fallback;
}

export function normalizeStepConfig(step = {}, fallback = {}) {
  const merged = createDefaultStepConfig({
    ...fallback,
    ...step,
  });
  merged.answer = String(merged.answer || "1").trim() || "1";
  merged.autoAdvanceSeconds = normalizeAdvanceSeconds(merged.autoAdvanceSeconds);
  merged.photoSlots = normalizeCount(merged.photoSlots);
  merged.specialSlots = normalizeCount(merged.specialSlots);
  merged.allowBypass = merged.allowBypass !== false;
  if (!Object.values(STEP_MODES).includes(merged.mode)) {
    merged.mode = STEP_MODES.ANSWER;
  }
  return merged;
}

export function normalizeMissionEntry(source = {}) {
  const base = createDefaultMissionEntry();
  const rawCodeAnswer = String(source.codeAnswer || "").trim();
  const rawMissionAnswer = String(source.missionAnswer || "").trim();
  const photoPlan = normalizePhotoPlan(source.photoPlan, {
    photoSlots: source.photoSlots,
    specialSlots: source.specialSlots,
  });
  const codeStep = normalizeStepConfig(source.codeStep, {
    mode: STEP_MODES.ANSWER,
    answer: source.codeAnswer || base.codeAnswer,
  });
  const missionStep = normalizeStepConfig(source.missionStep, {
    mode: photoPlan.length > 0 || Number(source.photoSlots) > 0 || Number(source.specialSlots) > 0 ? STEP_MODES.PHOTO_HQ : STEP_MODES.ANSWER,
    answer: source.missionAnswer || base.missionAnswer,
    photoSlots: photoPlan.length || source.photoSlots || 0,
    specialSlots: source.specialSlots || 0,
  });
  const resolvedCodeAnswer = rawCodeAnswer && !rawCodeAnswer.includes("{") ? rawCodeAnswer : String(codeStep.answer || "").trim();
  const resolvedMissionAnswer = rawMissionAnswer && !rawMissionAnswer.includes("{") ? rawMissionAnswer : String(missionStep.answer || "").trim();

  return {
    ...base,
    ...source,
    codeAnswer: resolvedCodeAnswer || base.codeAnswer,
    missionAnswer: resolvedMissionAnswer || base.missionAnswer,
    photoSlots: normalizeCount(photoPlan.length || (source.photoSlots ?? missionStep.photoSlots)),
    specialSlots: photoPlan.length ? 0 : normalizeCount(source.specialSlots ?? missionStep.specialSlots),
    photoPlan,
    codeStep: {
      ...codeStep,
      answer: resolvedCodeAnswer || base.codeAnswer,
    },
    missionStep: {
      ...missionStep,
      answer: resolvedMissionAnswer || base.missionAnswer,
      photoSlots: normalizeCount(photoPlan.length || (source.photoSlots ?? missionStep.photoSlots)),
      specialSlots: photoPlan.length ? 0 : normalizeCount(source.specialSlots ?? missionStep.specialSlots),
    },
  };
}

export function getStepConfig(mission = {}, stepKey = "codeStep") {
  const normalized = normalizeMissionEntry(mission);
  return stepKey === "missionStep" ? normalized.missionStep : normalized.codeStep;
}

export function getPhotoConfigFromMission(mission = {}) {
  const normalized = normalizeMissionEntry(mission);
  return {
    photoSlots: normalizeCount(normalized.photoPlan?.length || normalized.missionStep.photoSlots),
    specialSlots: normalized.photoPlan?.length ? 0 : normalizeCount(normalized.missionStep.specialSlots),
  };
}

export function isPhotoMissionConfig(mission = {}) {
  const config = getPhotoConfigFromMission(mission);
  return config.photoSlots > 0
    || config.specialSlots > 0
    || getStepConfig(mission, "missionStep").mode === STEP_MODES.PHOTO_HQ
    || getStepConfig(mission, "codeStep").mode === STEP_MODES.PHOTO_HQ;
}

export function normalizeCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(10, Math.floor(parsed)));
}

export function normalizeAdvanceSeconds(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(3600, Math.floor(parsed)));
}

export function isStepAnswerCorrect(inputValue = "", mission = {}, stepKey = "codeStep", bypassCode = "") {
  const step = getStepConfig(mission, stepKey);
  const submitted = String(inputValue || "").trim();
  if (!submitted) return false;
  if (bypassCode && step.allowBypass !== false && submitted === String(bypassCode).trim()) return true;
  return submitted === String(step.answer || "").trim();
}
