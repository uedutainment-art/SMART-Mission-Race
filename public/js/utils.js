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
