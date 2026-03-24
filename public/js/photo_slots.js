import { getPhotoConfigFromMission, normalizeMissionEntry, normalizePhotoPlan } from "./mission_rules.js";

export function buildRequiredSlots(photoSlots = 0, specialSlots = 0, options = {}) {
  const slots = [];
  const photoCount = Number(photoSlots) || 0;
  const specialCount = Number(specialSlots) || 0;
  for (let i = 1; i <= photoCount; i += 1) slots.push(`Photo${i}`);
  for (let i = 1; i <= specialCount; i += 1) slots.push(`S${i}`);
  if (slots.length) return slots;
  return Array.isArray(options.fallbackSlots) ? [...options.fallbackSlots] : [];
}

export function getSlotDefinitionsFromMission(mission = {}, options = {}) {
  const normalizedMission = normalizeMissionEntry(mission);
  const photoPlan = normalizePhotoPlan(normalizedMission.photoPlan, {
    photoSlots: normalizedMission.photoSlots,
    specialSlots: normalizedMission.specialSlots,
  });
  if (photoPlan.length) {
    return photoPlan.map((item, index) => ({
      id: item.slotId,
      slotId: item.slotId,
      label: item.label,
      accept: item.accept || "mixed",
      required: item.required !== false,
      order: index + 1,
    }));
  }
  const photoConfig = getPhotoConfigFromMission(normalizedMission);
  return buildRequiredSlots(photoConfig.photoSlots, photoConfig.specialSlots, options)
    .map((slotId, index) => ({
      id: slotId,
      slotId,
      label: slotId.startsWith("S") ? `추가 슬롯 ${slotId.replace("S", "")}` : `사진 ${index + 1}`,
      accept: "mixed",
      required: true,
      order: index + 1,
    }));
}

export function getRequiredSlotsFromMission(mission = {}, options = {}) {
  return getSlotDefinitionsFromMission(mission, options).map((slot) => slot.slotId);
}

export function getSlotDefinitionMapFromMission(mission = {}, options = {}) {
  return getSlotDefinitionsFromMission(mission, options).reduce((acc, slot) => {
    acc[slot.slotId] = slot;
    return acc;
  }, {});
}

export function formatSlotLabelFromMission(mission = {}, slotId = "", options = {}) {
  const slotMap = getSlotDefinitionMapFromMission(mission, options);
  return slotMap[slotId]?.label || formatFallbackSlotLabel(slotId);
}

export function formatFallbackSlotLabel(slotId = "") {
  if (slotId.startsWith("Photo")) {
    return `사진 ${slotId.replace("Photo", "")}`;
  }
  if (slotId.startsWith("S")) {
    return `추가 슬롯 ${slotId.replace("S", "")}`;
  }
  return slotId;
}
