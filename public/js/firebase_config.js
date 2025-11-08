// Firebase SDK v11.0.1 (esm)
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

const firebaseConfig = {
  apiKey: "AIzaSyA82DnkKujrTiFSTwdAYEBJGvWM5nwqb94",
  authDomain: "smart-mission-race-57839.firebaseapp.com",
  databaseURL: "https://smart-mission-race-57839-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "smart-mission-race-57839",
  storageBucket: "smart-mission-race-57839.firebasestorage.app",
  messagingSenderId: "718673690027",
  appId: "1:718673690027:web:12d78ea156465ff92666ee"
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
