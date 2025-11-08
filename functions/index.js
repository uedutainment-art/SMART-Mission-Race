import { onObjectFinalized } from "firebase-functions/v2/storage";
import { initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { google } from "googleapis";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

// Firebase 초기화
initializeApp();

// 🔹 서비스 계정 기반 Google Drive 인증
const serviceAccountPath = fileURLToPath(new URL("./service-account.json", import.meta.url));
const auth = new google.auth.GoogleAuth({
  keyFile: serviceAccountPath,
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});

const drive = google.drive({ version: "v3", auth });

// 🔹 업로드할 Google Drive 폴더 ID
const FOLDER_ID = "1ZESAq5xLGZVRiS0EA_f1AGkvjGLVyRjr";

// 🔹 Firebase Storage → Google Drive 업로드 트리거
export const backupToDrive = onObjectFinalized(
  { region: "asia-northeast3", memory: "256MiB" },
  async (event) => {
    const object = event.data;
    if (!object || !object.name) return;

    const bucket = getStorage().bucket(object.bucket);
    const tempFilePath = path.join(os.tmpdir(), path.basename(object.name));

    console.log(`📁 새 파일 감지됨: ${object.name}`);

    // 파일 다운로드
    await bucket.file(object.name).download({ destination: tempFilePath });
    console.log(`✅ 파일 다운로드 완료: ${tempFilePath}`);

    try {
      // Google Drive에 업로드
      const fileMetadata = {
        name: path.basename(object.name),
        parents: [FOLDER_ID],
      };
      const media = {
        mimeType: object.contentType,
        body: fs.createReadStream(tempFilePath),
      };

      const res = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: "id, name, parents",
      });

      console.log(`🚀 Google Drive 업로드 완료: ${res.data.name}`);
    } catch (error) {
      console.error("❌ 업로드 실패:", error);
    } finally {
      fs.unlinkSync(tempFilePath);
      console.log("🧹 임시 파일 삭제 완료");
    }
  }
);
