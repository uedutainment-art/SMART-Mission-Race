// Firebase SDK v11.0.1 (esm) - NFC TEST ENVIRONMENT
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  update,
  onValue,
  push,
  onChildAdded,
  get,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";
import { getStorage, ref as sRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";

// ⚠️ NFC 테스트 전용 Firebase 프로젝트
// 실제 운영 데이터와 완전히 분리됨
const firebaseConfig = {
  // TODO: Firebase Console에서 새 프로젝트 생성 후 설정값 입력
  // 1. https://console.firebase.google.com 접속
  // 2. "프로젝트 추가" → 이름: "smart-mission-race-nfc-test"
  // 3. 프로젝트 설정 → 웹 앱 추가 → 아래 값 복사
  apiKey: "YOUR_NFC_TEST_API_KEY",
  authDomain: "smart-mission-race-nfc-test.firebaseapp.com",
  databaseURL: "https://smart-mission-race-nfc-test-default-rtdb.YOUR_REGION.firebasedatabase.app",
  projectId: "smart-mission-race-nfc-test",
  storageBucket: "smart-mission-race-nfc-test.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const storage = getStorage(app);

export {
  db,
  ref,
  set,
  update,
  onValue,
  push,
  onChildAdded,
  get,
  serverTimestamp,
  storage,
  sRef,
  uploadBytes,
  getDownloadURL,
};
