import { storage, sRef, getBlob } from "./firebase_config.js";

export async function downloadFile(url, fileName, storagePath) {
  const finalUrl = appendDisposition(url, fileName);

  const tried = new Set();

  if (storagePath) {
    const ok = await downloadFromStorage(storagePath, fileName, tried);
    if (ok) return;
  }

  const derivedPath = deriveStoragePath(url);
  if (derivedPath && !tried.has(derivedPath)) {
    const ok = await downloadFromStorage(derivedPath, fileName, tried);
    if (ok) return;
  }

  const fetched = await downloadViaFetch(finalUrl, fileName);
  if (fetched) return;

  downloadViaLink(finalUrl, fileName);
}

async function downloadFromStorage(path, fileName, tried) {
  try {
    const ref = sRef(storage, path);
    const blob = await getBlob(ref);
    triggerBlobDownload(blob, fileName);
    tried?.add(path);
    return true;
  } catch (error) {
    console.warn("downloadFile storage path failed", path, error);
    tried?.add(path);
    return false;
  }
}

async function downloadViaFetch(url, fileName) {
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.status}`);
    }
    const blob = await response.blob();
    triggerBlobDownload(blob, fileName);
    return true;
  } catch (error) {
    console.warn("downloadFile fetch fallback failed", error);
    return false;
  }
}

function downloadViaLink(url, fileName) {
  const link = document.createElement("a");
  link.href = url;
  if (fileName) link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => link.remove(), 0);
}

function triggerBlobDownload(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  if (fileName) link.download = fileName;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }, 0);
}

function deriveStoragePath(url) {
  try {
    const parsed = new URL(url);
    let path = parsed.pathname;
    const oIndex = path.indexOf("/o/");
    if (oIndex !== -1) {
      path = path.substring(oIndex + 3);
    } else {
      const parts = path.split("/");
      const idx = parts.indexOf("o");
      if (idx !== -1 && idx + 1 < parts.length) {
        path = parts.slice(idx + 1).join("/");
      } else {
        path = parts.slice(2).join("/");
      }
    }
    path = decodeURIComponent(path);
    if (!path) return null;
    return path;
  } catch (error) {
    console.warn("Failed to derive storage path from url", url, error);
    return null;
  }
}

function appendDisposition(url, fileName) {
  const sep = url.includes("?") ? "&" : "?";
  const safe = encodeURIComponent(fileName || "photo");
  return `${url}${sep}response-content-disposition=attachment%3B%20filename%3D${safe}`;
}
