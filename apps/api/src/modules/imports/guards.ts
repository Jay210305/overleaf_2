import { normalize } from "node:path";

/**
 * Validates external URL to prevent SSRF against loopback, link-local, and private networks.
 */
export function isAllowedImportUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    const host = parsed.hostname.toLowerCase();

    // Block loopback and local addresses
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host === "[::1]" ||
      host === "169.254.169.254" // AWS/GCP metadata
    ) {
      return false;
    }

    // Block private RFC 1918 IPv4
    if (
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Validates zip entry relative paths to prevent Zip Slip directory traversal attacks.
 */
export function validateZipEntryPath(entryPath: string): boolean {
  if (!entryPath || typeof entryPath !== "string") {
    return false;
  }

  // Reject absolute paths
  if (entryPath.startsWith("/") || entryPath.startsWith("\\") || /^[a-zA-Z]:/.test(entryPath)) {
    return false;
  }

  // Check for directory traversal sequences
  const normalized = normalize(entryPath).replace(/\\/g, "/");
  if (normalized.startsWith("../") || normalized === ".." || normalized.includes("/../")) {
    return false;
  }

  return true;
}
