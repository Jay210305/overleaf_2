import { createHash } from "node:crypto";
import dns from "node:dns/promises";
import { isIP } from "node:net";

export type RemoteResourceErrorCode =
  | "SSRF_DISALLOWED_SCHEME"
  | "SSRF_DISALLOWED_IP"
  | "SSRF_DISALLOWED_HOST"
  | "SSRF_DNS_RESOLUTION_FAILED"
  | "SSRF_REDIRECT_LIMIT_EXCEEDED"
  | "RESOURCE_SIZE_LIMIT_EXCEEDED"
  | "DISALLOWED_CONTENT_TYPE"
  | "FETCH_TIMEOUT"
  | "FETCH_FAILED";

export class RemoteResourceError extends Error {
  constructor(
    readonly code: RemoteResourceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RemoteResourceError";
  }
}

export interface RemoteResourceOptions {
  allowedDomains?: string[] | undefined;
  allowedSchemes?: string[] | undefined;
  allowedContentTypes?: string[] | undefined;
  maxSizeBytes?: number | undefined;
  maxRedirects?: number | undefined;
  timeoutMs?: number | undefined;
  dnsResolver?: ((hostname: string) => Promise<string[]>) | undefined;
  fetchImpl?: typeof fetch | undefined;
}

export interface RemoteResourceResult {
  url: string;
  bytes: Buffer;
  contentType: string;
  contentLength: number;
  sha256: string;
}

const DEFAULT_MAX_SIZE = 25 * 1024 * 1024; // 25 MB
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_SCHEMES = ["https:", "http:"];

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "instance-data",
  "169.254.169.254",
  "metadata",
  "loopback",
]);

/**
 * Checks whether an IPv4 or IPv6 address belongs to private, loopback,
 * link-local, documentation, or multicast ranges.
 */
export function isPrivateIp(ip: string): boolean {
  // Check for IPv4-mapped IPv6 address, e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1
  if (ip.startsWith("::ffff:") || ip.startsWith("::FFFF:")) {
    const rest = ip.slice(7);
    if (isIP(rest) === 4) {
      return isPrivateIp(rest);
    }
  }

  const version = isIP(ip);
  if (version === 4) {
    const parts = ip.split(".").map((n) => parseInt(n, 10));
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true;
    }
    const [a, b, c] = parts as [number, number, number, number];

    // 0.0.0.0/8 (Current network)
    if (a === 0) return true;
    // 10.0.0.0/8 (Private)
    if (a === 10) return true;
    // 100.64.0.0/10 (Carrier-grade NAT)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;
    // 169.254.0.0/16 (Link-local / Cloud metadata!)
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12 (Private)
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (a === 192 && b === 0 && c === 0) return true;
    // 192.0.2.0/24 (TEST-NET-1)
    if (a === 192 && b === 0 && c === 2) return true;
    // 192.168.0.0/16 (Private)
    if (a === 192 && b === 168) return true;
    // 198.18.0.0/15 (Benchmarking)
    if (a === 198 && (b === 18 || b === 19)) return true;
    // 198.51.100.0/24 (TEST-NET-2)
    if (a === 198 && b === 51 && c === 100) return true;
    // 203.0.113.0/24 (TEST-NET-3)
    if (a === 203 && b === 0 && c === 113) return true;
    // 224.0.0.0/4 (Multicast)
    if (a >= 224 && a <= 239) return true;
    // 240.0.0.0/4 (Reserved / Future use)
    if (a >= 240) return true;

    return false;
  }

  if (version === 6) {
    const clean = ip.toLowerCase();
    // ::1 (Loopback)
    if (clean === "::1" || clean === "0:0:0:0:0:0:0:1") return true;
    // :: (Unspecified)
    if (clean === "::" || clean === "0:0:0:0:0:0:0:0") return true;
    // fc00::/7 (Unique Local)
    if (/^[fF][cCdD]/.test(clean)) return true;
    // fe80::/10 (Link-Local)
    if (/^[fF][eE][89aAbB]/.test(clean)) return true;
    // ff00::/8 (Multicast)
    if (/^[fF][fF]/.test(clean)) return true;

    return false;
  }

  // Not a valid IP
  return true;
}

export async function defaultDnsResolver(hostname: string): Promise<string[]> {
  try {
    const results = await dns.lookup(hostname, { all: true });
    return results.map((r) => r.address);
  } catch (error) {
    throw new RemoteResourceError(
      "SSRF_DNS_RESOLUTION_FAILED",
      `Failed to resolve DNS for ${hostname}: ${(error as Error).message}`,
    );
  }
}

/**
 * Validates a URL against SSRF policy and resolves destination IPs.
 */
export async function validateRemoteUrl(
  urlStr: string,
  options: RemoteResourceOptions = {},
): Promise<{ url: URL; resolvedIps: string[] }> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new RemoteResourceError("SSRF_DISALLOWED_SCHEME", `Invalid URL format: ${urlStr}`);
  }

  const allowedSchemes = options.allowedSchemes ?? DEFAULT_SCHEMES;
  if (!allowedSchemes.includes(parsed.protocol)) {
    throw new RemoteResourceError(
      "SSRF_DISALLOWED_SCHEME",
      `URL scheme ${parsed.protocol} is not permitted. Permitted: ${allowedSchemes.join(", ")}`,
    );
  }

  // Reject embedded credentials in URL
  if (parsed.username || parsed.password) {
    throw new RemoteResourceError(
      "SSRF_DISALLOWED_HOST",
      "Embedded authentication credentials in URL are prohibited",
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local")
  ) {
    throw new RemoteResourceError(
      "SSRF_DISALLOWED_HOST",
      `Target host ${hostname} is blocked by SSRF policy`,
    );
  }

  if (options.allowedDomains && options.allowedDomains.length > 0) {
    const match = options.allowedDomains.some(
      (domain) =>
        hostname === domain.toLowerCase() || hostname.endsWith(`.${domain.toLowerCase()}`),
    );
    if (!match) {
      throw new RemoteResourceError(
        "SSRF_DISALLOWED_HOST",
        `Host ${hostname} is not in the allowed domains list`,
      );
    }
  }

  // If host is a literal IP address
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new RemoteResourceError(
        "SSRF_DISALLOWED_IP",
        `Access to private/local IP ${hostname} is rejected`,
      );
    }
    return { url: parsed, resolvedIps: [hostname] };
  }

  // DNS resolution and validation
  const resolveDns = options.dnsResolver ?? defaultDnsResolver;
  const ips = await resolveDns(hostname);
  if (!ips || ips.length === 0) {
    throw new RemoteResourceError(
      "SSRF_DNS_RESOLUTION_FAILED",
      `No IP addresses found for host ${hostname}`,
    );
  }

  for (const ip of ips) {
    if (isPrivateIp(ip)) {
      throw new RemoteResourceError(
        "SSRF_DISALLOWED_IP",
        `Resolved host ${hostname} to private/internal IP ${ip}, connection rejected`,
      );
    }
  }

  return { url: parsed, resolvedIps: ips };
}

/**
 * Performs SSRF-safe remote resource import with DNS revalidation,
 * redirect limits, private range rejection, content size, and type controls.
 */
export async function fetchRemoteResource(
  urlStr: string,
  options: RemoteResourceOptions = {},
): Promise<RemoteResourceResult> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxSizeBytes = options.maxSizeBytes ?? DEFAULT_MAX_SIZE;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const customFetch = options.fetchImpl ?? fetch;

  let currentUrl = urlStr;
  let redirectsCount = 0;

  while (true) {
    const { url } = await validateRemoteUrl(currentUrl, options);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await customFetch(url.toString(), {
        method: "GET",
        redirect: "manual", // Handle redirects manually to revalidate each hop!
        signal: controller.signal,
        headers: {
          "User-Agent": "LaTeXCollab-ResourceImporter/1.0",
          Accept: "*/*",
        },
      });
    } catch (error) {
      if ((error as Error).name === "AbortError" || controller.signal.aborted) {
        throw new RemoteResourceError("FETCH_TIMEOUT", `Fetch timed out after ${timeoutMs}ms`);
      }
      throw new RemoteResourceError(
        "FETCH_FAILED",
        `Remote resource request failed: ${(error as Error).message}`,
      );
    } finally {
      clearTimeout(timeoutId);
    }

    // Handle redirects
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      redirectsCount++;
      if (redirectsCount > maxRedirects) {
        throw new RemoteResourceError(
          "SSRF_REDIRECT_LIMIT_EXCEEDED",
          `Exceeded maximum redirect limit of ${maxRedirects}`,
        );
      }

      const location = response.headers.get("location");
      if (!location) {
        throw new RemoteResourceError(
          "FETCH_FAILED",
          `Redirect response status ${response.status} missing Location header`,
        );
      }

      // Resolve relative redirect against current URL
      const redirectTarget = new URL(location, url).toString();
      currentUrl = redirectTarget;
      continue;
    }

    if (!response.ok) {
      throw new RemoteResourceError(
        "FETCH_FAILED",
        `Remote server returned error status ${response.status} ${response.statusText}`,
      );
    }

    const contentType = (response.headers.get("content-type") || "application/octet-stream")
      .split(";")[0]!
      .trim();
    if (options.allowedContentTypes && options.allowedContentTypes.length > 0) {
      const allowed = options.allowedContentTypes.some(
        (ct) => ct.toLowerCase() === contentType.toLowerCase(),
      );
      if (!allowed) {
        throw new RemoteResourceError(
          "DISALLOWED_CONTENT_TYPE",
          `Content-Type ${contentType} is not permitted`,
        );
      }
    }

    const declaredLength = response.headers.get("content-length");
    if (declaredLength) {
      const parsedLength = parseInt(declaredLength, 10);
      if (!isNaN(parsedLength) && parsedLength > maxSizeBytes) {
        throw new RemoteResourceError(
          "RESOURCE_SIZE_LIMIT_EXCEEDED",
          `Resource declared size ${parsedLength} exceeds limit of ${maxSizeBytes} bytes`,
        );
      }
    }

    const arrayBuffer = await response.arrayBuffer();
    const bytes = Buffer.from(arrayBuffer);

    if (bytes.length > maxSizeBytes) {
      throw new RemoteResourceError(
        "RESOURCE_SIZE_LIMIT_EXCEEDED",
        `Resource downloaded size ${bytes.length} exceeds limit of ${maxSizeBytes} bytes`,
      );
    }

    const sha256 = createHash("sha256").update(bytes).digest("hex");

    return {
      url: url.toString(),
      bytes,
      contentType,
      contentLength: bytes.length,
      sha256,
    };
  }
}
