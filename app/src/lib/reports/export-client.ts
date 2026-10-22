"use client";

/**
 * Client-side utility to trigger file downloads safely for CSV, Excel, and PDF.
 * Handles UTF-8 text (CSV/Excel) and base64 encoded binary data (PDF).
 */
export function triggerDownload(content: string, contentType: string, filename: string): void {
  let blob: Blob;

  if (contentType === "application/pdf") {
    // Decode base64 to binary
    const binaryString = atob(content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    blob = new Blob([bytes], { type: contentType });
  } else {
    // For CSV and Excel, content is already a UTF-8 string
    blob = new Blob([content], { type: contentType });
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
