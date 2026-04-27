export function downloadFile({
  fileName,
  content,
  mimeType = "application/octet-stream",
  revokeDelayMs = 30000,
}) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), revokeDelayMs);
}
