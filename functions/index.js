import { onObjectFinalized } from "firebase-functions/v2/storage";
import { onRequest } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { getDatabase, ServerValue } from "firebase-admin/database";
import { google } from "googleapis";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import {
  normalizeMissionConfig,
  buildRequiredSlots,
  resolveMissionConfigForTeam,
} from "./mission_schema.js";

// Firebase 초기화
initializeApp();

// 🔹 업로드할 Google Drive 폴더 ID
const DEFAULT_DRIVE_FOLDER_ID = "1a-VdwTaLMop3EaXHlZIvMbMZpHhbicLA";
const FOLDER_ID = process.env.DRIVE_FOLDER_ID || DEFAULT_DRIVE_FOLDER_ID;
const serviceAccountPath = fileURLToPath(new URL("./service-account.json", import.meta.url));
let cachedDrive = null;
let cachedDriveAuthOptions = null;
const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

function getDriveClient() {
  if (cachedDrive) return cachedDrive;

  const authOptions = getDriveAuthOptions();
  if (!authOptions) {
    console.warn("Google Drive backup skipped: missing Drive service account credentials");
    return null;
  }

  const auth = new google.auth.GoogleAuth(authOptions);

  cachedDrive = google.drive({ version: "v3", auth });
  return cachedDrive;
}

function getDriveAuthOptions() {
  if (cachedDriveAuthOptions) return cachedDriveAuthOptions;
  const fromEnv = process.env.DRIVE_SERVICE_ACCOUNT_JSON_BASE64 || process.env.DRIVE_SERVICE_ACCOUNT_JSON || "";
  if (fromEnv) {
    try {
      const raw = process.env.DRIVE_SERVICE_ACCOUNT_JSON_BASE64
        ? Buffer.from(fromEnv, "base64").toString("utf8")
        : fromEnv;
      const credentials = JSON.parse(raw);
      cachedDriveAuthOptions = {
        credentials,
        scopes: ["https://www.googleapis.com/auth/drive.file"],
      };
      return cachedDriveAuthOptions;
    } catch (error) {
      console.error("Invalid DRIVE_SERVICE_ACCOUNT_JSON payload", error);
      return null;
    }
  }
  if (fs.existsSync(serviceAccountPath)) {
    cachedDriveAuthOptions = {
      keyFile: serviceAccountPath,
      scopes: ["https://www.googleapis.com/auth/drive.file"],
    };
    return cachedDriveAuthOptions;
  }
  return null;
}

function sha256Hex(value = "") {
  return crypto.createHash("sha256").update(String(value || "").trim()).digest("hex");
}

function slugifyLabel(value = "") {
  return String(value || "")
    .trim()
    .replace(/[^\w가-힣-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function escapeDriveQuery(value = "") {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function parseStorageUploadPath(objectName = "") {
  const parts = String(objectName || "").split("/").filter(Boolean);
  if (parts.length < 5 || parts[0] !== "uploads") return null;
  const [, projectId, teamId, missionKey, fileName] = parts;
  const missionMatch = String(missionKey || "").match(/^mission_(\d+)$/);
  if (!projectId || !teamId || !missionMatch || !fileName) return null;
  return {
    projectId,
    teamId,
    missionKey,
    missionId: missionMatch[1],
    fileName,
  };
}

function extractSlotSequence(slotId = "", slotLabel = "") {
  const slotMatch = String(slotId || "").match(/(\d+)/);
  if (slotMatch?.[1]) return Number(slotMatch[1]) || 1;
  const labelMatch = String(slotLabel || "").match(/(\d+)/);
  if (labelMatch?.[1]) return Number(labelMatch[1]) || 1;
  return 1;
}

function buildDriveFileName(teamNumber = 0, slotId = "", slotLabel = "", originalName = "", contentType = "") {
  const teamNo = String(Number(teamNumber) || 0).padStart(2, "0");
  const photoNo = String(extractSlotSequence(slotId, slotLabel)).padStart(2, "0");
  const extMatch = String(originalName || "").match(/\.([a-zA-Z0-9]+)$/);
  const typeExt = String(contentType || "").startsWith("image/")
    ? String(contentType).replace("image/", "")
    : String(contentType || "").startsWith("video/")
      ? String(contentType).replace("video/", "")
      : "";
  const extension = extMatch?.[1] || typeExt || "dat";
  return `T${teamNo}_P${photoNo}.${extension}`;
}

async function findOrCreateDriveFolder(drive, parentId, folderName) {
  const safeName = String(folderName || "").trim();
  const query = [
    `'${escapeDriveQuery(parentId)}' in parents`,
    `name = '${escapeDriveQuery(safeName)}'`,
    `mimeType = '${DRIVE_FOLDER_MIME}'`,
    "trashed = false",
  ].join(" and ");
  const listResponse = await drive.files.list({
    q: query,
    fields: "files(id, name)",
    pageSize: 10,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  const existing = listResponse.data.files?.[0];
  if (existing?.id) return existing.id;

  const createResponse = await drive.files.create({
    resource: {
      name: safeName,
      mimeType: DRIVE_FOLDER_MIME,
      parents: [parentId],
    },
    fields: "id, name",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  return createResponse.data.id;
}

async function resolveDriveUploadContext(db, object) {
  const pathInfo = parseStorageUploadPath(object?.name || "");
  if (!pathInfo) return null;

  const { projectId, teamId, missionId } = pathInfo;
  const [metaSnap, profileSnap, uploadsSnap, legacyMissionSnap, routingSnap, teamOverrideSnap] = await Promise.all([
    db.ref(`projects/${projectId}/meta`).get(),
    db.ref(`projects/${projectId}/teams/${teamId}/profile`).get(),
    db.ref(`uploads_meta/${projectId}/${teamId}/mission_${missionId}`).get(),
    db.ref(`projects/${projectId}/teams/${teamId}/config/missions/${missionId}`).get(),
    db.ref(`projects/${projectId}/routing`).get(),
    db.ref(`projects/${projectId}/teamOverrides/${teamId}`).get(),
  ]);

  const meta = metaSnap.val() || {};
  const profile = profileSnap.val() || {};
  const uploads = uploadsSnap.val() || {};
  const uploadEntry = Object.values(uploads).find((item) => item?.storagePath === object.name) || null;
  if (!uploadEntry) return null;

  const missionTotal = Number(meta.missionTotal) || 9;
  const missionConfig = resolveMissionConfigForTeam({
    routing: routingSnap.val() || null,
    teamOverride: teamOverrideSnap.val() || null,
    legacyMission: legacyMissionSnap.val() || null,
    meta,
    teamId,
    missionNumber: Number(missionId),
    missionTotal,
  });

  const teamNumber = Number(profile.number) || Number(String(teamId).replace("Team", "")) || 0;
  const teamLabelBase = teamNumber > 0 ? `${teamNumber}팀` : teamId;
  const teamAlias = String(profile.name || profile.alias || "").trim();
  const teamFolderName = slugifyLabel(teamAlias ? `${teamLabelBase}_${teamAlias}` : teamLabelBase) || teamId;
  const projectFolderName = slugifyLabel(meta.name || projectId) || projectId;
  const routeLabel = slugifyLabel(missionConfig?.routeLabel || missionConfig?.routeKey || `mission_${missionId}`) || `mission_${missionId}`;
  const missionFolderName = `M${missionId}_${routeLabel}`;
  const slotId = String(uploadEntry.slot || "").trim() || "Photo1";
  const slotLabel = String(uploadEntry.label || slotId).trim();
  const slotFolderName = `P${String(extractSlotSequence(slotId, slotLabel)).padStart(2, "0")}_${slugifyLabel(slotLabel) || slotId}`;

  return {
    projectId,
    teamId,
    missionId,
    slotId,
    slotLabel,
    teamNumber,
    projectFolderName,
    teamFolderName,
    missionFolderName,
    slotFolderName,
    driveFileName: buildDriveFileName(teamNumber, slotId, slotLabel, uploadEntry.originalName || object.name, object.contentType || ""),
  };
}

function setCors(response) {
  response.set("Access-Control-Allow-Origin", "*");
  response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.set("Access-Control-Allow-Headers", "Content-Type");
}

export const mobilePhotoAction = onRequest(
  { region: "asia-northeast3", memory: "256MiB" },
  async (request, response) => {
    setCors(response);
    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }
    if (request.method !== "POST") {
      response.status(405).json({ ok: false, error: "method-not-allowed" });
      return;
    }

    try {
      const body =
        typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {};
      const {
        projectId = "",
        teamId = "",
        missionId = "",
        action = "",
        reason = "",
        slotIds = [],
        password = "",
        passwordHash = "",
      } = body;

      if (!projectId || !teamId || !missionId || !action) {
        response.status(400).json({ ok: false, error: "missing-fields" });
        return;
      }

      const db = getDatabase();
      const metaSnap = await db.ref(`projects/${projectId}/meta`).get();
      const meta = metaSnap.val() || {};
      const expectedHash = String(meta.photoApprovalPasswordHash || "").trim()
        || (meta.photoApprovalPassword ? sha256Hex(meta.photoApprovalPassword) : "");
      const providedHash = String(passwordHash || "").trim() || sha256Hex(password);
      if (expectedHash && providedHash !== expectedHash) {
        response.status(403).json({ ok: false, error: "invalid-password" });
        return;
      }

      const missionNo = Number(missionId) || 1;
      const missionTotal = Number(meta.missionTotal) || 9;
      const [legacyMissionSnap, routingSnap, teamOverrideSnap] = await Promise.all([
        db.ref(`projects/${projectId}/teams/${teamId}/config/missions/${missionId}`).get(),
        db.ref(`projects/${projectId}/routing`).get(),
        db.ref(`projects/${projectId}/teamOverrides/${teamId}`).get(),
      ]);
      const missionConfig = resolveMissionConfigForTeam({
        routing: routingSnap.val() || null,
        teamOverride: teamOverrideSnap.val() || null,
        legacyMission: legacyMissionSnap.val() || null,
        meta,
        teamId,
        missionNumber: missionNo,
        missionTotal,
      });
      const uploadsSnap = await db.ref(`uploads_meta/${projectId}/${teamId}/mission_${missionId}`).get();
      const missionUploads = uploadsSnap.val() || {};
      const requiredSlots = buildRequiredSlots(missionConfig, { fallbackSlots: ["Photo1", "Photo2", "S1"] });
      const currentMissionStateSnap = await db.ref(`projects/${projectId}/teams/${teamId}/missions/${missionId}`).get();
      const currentMissionState = currentMissionStateSnap.val() || {};
      const currentStepKey = currentMissionState.stage === "code" ? "codeStep" : "missionStep";
      const updates = {};
      const requestedSlotIds = Array.isArray(slotIds)
        ? slotIds.map((value) => String(value || "").trim()).filter(Boolean)
        : [];
      const actionableSlotIds = (requestedSlotIds.length ? requestedSlotIds : Object.keys(missionUploads))
        .filter((slotId) => missionUploads[slotId]?.url);

      if (action === "approve") {
        const ready = actionableSlotIds.length > 0 && actionableSlotIds.every((slotId) => missionUploads[slotId]?.url);
        if (!ready || !actionableSlotIds.length) {
          response.status(400).json({ ok: false, error: "missing-uploads" });
          return;
        }
        actionableSlotIds.forEach((slotId) => {
          updates[`uploads_meta/${projectId}/${teamId}/mission_${missionId}/${slotId}/status`] = "approved";
        });
        const normalizedMission = normalizeMissionConfig({
          ...missionConfig,
          codeStep: {
            ...(missionConfig.codeStep || {}),
            autoAdvanceSeconds: currentStepKey === "codeStep"
              ? missionConfig.codeStep?.autoAdvanceSeconds
              : 0,
          },
          missionStep: {
            ...(missionConfig.missionStep || {}),
            autoAdvanceSeconds: currentStepKey === "missionStep"
              ? missionConfig.missionStep?.autoAdvanceSeconds
              : 0,
          },
        });
        const nextStatuses = { ...missionUploads };
        actionableSlotIds.forEach((slotId) => {
          nextStatuses[slotId] = {
            ...(nextStatuses[slotId] || {}),
            status: "approved",
          };
        });
        const allApproved = requiredSlots.length > 0
          && requiredSlots.every((slotId) => nextStatuses[slotId]?.url && nextStatuses[slotId]?.status === "approved");
        const delaySeconds = normalizedMission.autoAdvanceSeconds;
        if (allApproved && delaySeconds > 0) {
          updates[`projects/${projectId}/teams/${teamId}/missions/${missionId}/stepStatus`] = "delay";
          updates[`projects/${projectId}/teams/${teamId}/missions/${missionId}/unlockAt`] = Date.now() + delaySeconds * 1000;
        } else if (allApproved) {
          if (currentStepKey === "codeStep") {
            updates[`projects/${projectId}/teams/${teamId}/missions/${missionId}/stage`] = "mission";
            updates[`projects/${projectId}/teams/${teamId}/missions/${missionId}/panel`] = "mission";
            updates[`projects/${projectId}/teams/${teamId}/missions/${missionId}/stepStatus`] = null;
            updates[`projects/${projectId}/teams/${teamId}/missions/${missionId}/unlockAt`] = null;
            updates[`projects/${projectId}/teams/${teamId}/missions/${missionId}/completedAt`] = null;
          } else {
            updates[`projects/${projectId}/teams/${teamId}/missions/${missionId}/stage`] = "done";
            updates[`projects/${projectId}/teams/${teamId}/missions/${missionId}/panel`] = null;
            updates[`projects/${projectId}/teams/${teamId}/missions/${missionId}/stepStatus`] = null;
            updates[`projects/${projectId}/teams/${teamId}/missions/${missionId}/unlockAt`] = null;
            updates[`projects/${projectId}/teams/${teamId}/missions/${missionId}/completedAt`] = Date.now();
            const nextMissionId = String(Number(missionId) + 1);
            const nextMissionSnap = await db.ref(`projects/${projectId}/teams/${teamId}/missions/${nextMissionId}`).get();
            const nextMission = nextMissionSnap.val();
            if (Number(missionId) < Number(meta.missionTotal || 9) && (!nextMission || nextMission.stage === "locked")) {
              updates[`projects/${projectId}/teams/${teamId}/missions/${nextMissionId}/stage`] = "code";
              updates[`projects/${projectId}/teams/${teamId}/missions/${nextMissionId}/panel`] = null;
              updates[`projects/${projectId}/teams/${teamId}/missions/${nextMissionId}/stepStatus`] = null;
              updates[`projects/${projectId}/teams/${teamId}/missions/${nextMissionId}/unlockAt`] = null;
              updates[`projects/${projectId}/teams/${teamId}/missions/${nextMissionId}/completedAt`] = null;
            }
          }
        }

        await db.ref().update(updates);
        await db.ref(`chat/${projectId}/${teamId}`).push({
          sender: "HQ",
          text: `[본부] 사진 승인 완료 - Mission ${missionId}`,
          createdAt: ServerValue.TIMESTAMP,
        });
        await db.ref(`ops_logs/${projectId}`).push({
          action: "hq_photo_approve",
          details: {
            source: "mobile_approve_api",
            teamId,
            missionId,
            delaySeconds,
            slotIds: actionableSlotIds,
            allApproved,
          },
          createdAt: ServerValue.TIMESTAMP,
        });
        response.json({ ok: true, action: "approve", slotIds: actionableSlotIds, allApproved });
        return;
      }

      if (action === "retry") {
        if (!String(reason || "").trim()) {
          response.status(400).json({ ok: false, error: "missing-reason" });
          return;
        }
        if (!actionableSlotIds.length) {
          response.status(400).json({ ok: false, error: "missing-uploads" });
          return;
        }
        actionableSlotIds.forEach((slotId) => {
          updates[`uploads_meta/${projectId}/${teamId}/mission_${missionId}/${slotId}/status`] = "retry";
          updates[`uploads_meta/${projectId}/${teamId}/mission_${missionId}/${slotId}/retryReason`] = String(reason).trim();
        });
        updates[`projects/${projectId}/teams/${teamId}/missions/${missionId}/stepStatus`] = null;
        updates[`projects/${projectId}/teams/${teamId}/missions/${missionId}/unlockAt`] = null;
        await db.ref().update(updates);
        await db.ref(`chat/${projectId}/${teamId}`).push({
          sender: "HQ",
          text: `[본부] 사진 재도전 요청 - Mission ${missionId}\n${String(reason).trim()}`,
          createdAt: ServerValue.TIMESTAMP,
        });
        await db.ref(`ops_logs/${projectId}`).push({
          action: "hq_photo_retry",
          details: {
            source: "mobile_approve_api",
            teamId,
            missionId,
            reason: String(reason).trim(),
            slotIds: actionableSlotIds,
          },
          createdAt: ServerValue.TIMESTAMP,
        });
        response.json({ ok: true, action: "retry", slotIds: actionableSlotIds });
        return;
      }

      response.status(400).json({ ok: false, error: "invalid-action" });
    } catch (error) {
      console.error("mobilePhotoAction failed", error);
      response.status(500).json({ ok: false, error: "internal" });
    }
  }
);

export const hqChatSend = onRequest(
  { region: "asia-northeast3", memory: "256MiB" },
  async (request, response) => {
    setCors(response);
    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }
    if (request.method !== "POST") {
      response.status(405).json({ ok: false, error: "method-not-allowed" });
      return;
    }

    try {
      const body =
        typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {};
      const projectId = String(body.projectId || "").trim();
      const teamId = String(body.teamId || "").trim();
      const sender = String(body.sender || "HQ").trim() || "HQ";
      const text = String(body.text || "").trim();

      if (!projectId || !teamId || !text) {
        response.status(400).json({ ok: false, error: "missing-fields" });
        return;
      }

      const db = getDatabase();
      await db.ref(`chat/${projectId}/${teamId}`).push({
        sender,
        text,
        createdAt: ServerValue.TIMESTAMP,
      });

      response.json({ ok: true });
    } catch (error) {
      console.error("hqChatSend failed", error);
      response.status(500).json({ ok: false, error: "internal" });
    }
  }
);

// 🔹 Firebase Storage → Google Drive 업로드 트리거
export const backupToDrive = onObjectFinalized(
  { region: "asia-northeast3", memory: "256MiB" },
  async (event) => {
    const object = event.data;
    if (!object || !object.name) return;

    const bucket = getStorage().bucket(object.bucket);
    const tempFilePath = path.join(os.tmpdir(), path.basename(object.name));

    console.log(`📁 새 파일 감지됨: ${object.name}`);

    const drive = getDriveClient();
    if (!drive) {
      return;
    }

    const db = getDatabase();
    const uploadContext = await resolveDriveUploadContext(db, object);
    if (!uploadContext) {
      console.warn(`Google Drive backup skipped: unresolved upload context for ${object.name}`);
      return;
    }

    // 파일 다운로드
    await bucket.file(object.name).download({ destination: tempFilePath });
    console.log(`✅ 파일 다운로드 완료: ${tempFilePath}`);

    try {
      const projectFolderId = await findOrCreateDriveFolder(drive, FOLDER_ID, uploadContext.projectFolderName);
      const teamFolderId = await findOrCreateDriveFolder(drive, projectFolderId, uploadContext.teamFolderName);
      const missionFolderId = await findOrCreateDriveFolder(drive, teamFolderId, uploadContext.missionFolderName);
      const slotFolderId = await findOrCreateDriveFolder(drive, missionFolderId, uploadContext.slotFolderName);

      // Google Drive에 업로드
      const fileMetadata = {
        name: uploadContext.driveFileName,
        parents: [slotFolderId],
      };
      const media = {
        mimeType: object.contentType,
        body: fs.createReadStream(tempFilePath),
      };

      const res = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: "id, name, parents",
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
      });

      console.log(`🚀 Google Drive 업로드 완료: ${res.data.name}`);
      await db.ref(`drive_backups/${uploadContext.projectId}/${uploadContext.teamId}/mission_${uploadContext.missionId}/${uploadContext.slotId}`).set({
        driveFileId: res.data.id || "",
        driveFileName: res.data.name || uploadContext.driveFileName,
        storagePath: object.name,
        slotLabel: uploadContext.slotLabel,
        folderPath: [
          uploadContext.projectFolderName,
          uploadContext.teamFolderName,
          uploadContext.missionFolderName,
          uploadContext.slotFolderName,
        ].join("/"),
        createdAt: ServerValue.TIMESTAMP,
      });
    } catch (error) {
      console.error("❌ 업로드 실패:", error);
      await db.ref(`drive_backups_errors`).push({
        storagePath: object.name,
        error: String(error?.message || error || "unknown"),
        createdAt: ServerValue.TIMESTAMP,
      });
    } finally {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
        console.log("🧹 임시 파일 삭제 완료");
      }
    }
  }
);
