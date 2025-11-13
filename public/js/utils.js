export async function downloadFile(url, fileName) {
  const finalUrl = appendDisposition(url, fileName);

  try {
    const response = await fetch(finalUrl, { mode: "cors" });
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.status}`);
    }
    const blob = await response.blob();
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
  } catch (error) {
    console.warn("downloadFile fallback to direct link", error);
    const link = document.createElement("a");
    link.href = finalUrl;
    if (fileName) link.download = fileName;
    link.target = "_blank";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    setTimeout(() => link.remove(), 0);
  }
}

function appendDisposition(url, fileName) {
  const sep = url.includes("?") ? "&" : "?";
  const safe = encodeURIComponent(fileName || "photo");
  return `${url}${sep}response-content-disposition=attachment%3B%20filename%3D${safe}`;
}
