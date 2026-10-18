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

    // Block loopback, cloud metadata, and local addresses
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host === "[::1]" ||
      host === "::" ||
      host === "[::]" ||
      host === "169.254.169.254" || // AWS/OpenStack metadata
      host === "metadata.google.internal" || // GCP metadata
      host === "instance-data" ||
      host === "metadata"
    ) {
      return false;
    }

    // Block private RFC 1918 IPv4 and carrier-grade NAT / link-local
    if (
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host.startsWith("169.254.") ||
      host.startsWith("127.") ||
      host.startsWith("0.") ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
      /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./.test(host)
    ) {
      return false;
    }

    // Block IPv6 link-local / ULA / loopback
    const cleanHost = host.replace(/^\[|\]$/g, "");
    if (
      cleanHost === "::1" ||
      cleanHost === "::" ||
      cleanHost.startsWith("fe80:") ||
      cleanHost.startsWith("fc00:") ||
      cleanHost.startsWith("fd00:") ||
      cleanHost.startsWith("::ffff:")
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

  // Normalize forward slashes before path.normalize to avoid POSIX bypass with backslashes
  const forwardSlashes = entryPath.replace(/\\/g, "/");
  const normalized = normalize(forwardSlashes).replace(/\\/g, "/");
  if (
    normalized.startsWith("../") ||
    normalized === ".." ||
    normalized.includes("/../") ||
    normalized.startsWith("/")
  ) {
    return false;
  }

  return true;
}
