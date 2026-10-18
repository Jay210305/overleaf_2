import { describe, expect, it } from "vitest";
import {
  fetchRemoteResource,
  validateRemoteUrl,
  isPrivateIp,
} from "../../apps/jobs/src/imports/remote-resource.js";

describe("S14-T10: SSRF-safe permitted remote resource import integration", () => {
  it("rejects non-HTTP/HTTPS schemes", async () => {
    await expect(validateRemoteUrl("file:///etc/passwd")).rejects.toThrowError(
      expect.objectContaining({ code: "SSRF_DISALLOWED_SCHEME" }),
    );
    await expect(validateRemoteUrl("ftp://example.test/file.zip")).rejects.toThrowError(
      expect.objectContaining({ code: "SSRF_DISALLOWED_SCHEME" }),
    );
    await expect(validateRemoteUrl("gopher://127.0.0.1:70")).rejects.toThrowError(
      expect.objectContaining({ code: "SSRF_DISALLOWED_SCHEME" }),
    );
  });

  it("identifies and rejects all private, loopback, and link-local IP addresses", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("10.0.0.1")).toBe(true);
    expect(isPrivateIp("172.16.0.5")).toBe(true);
    expect(isPrivateIp("172.31.255.255")).toBe(true);
    expect(isPrivateIp("192.168.1.100")).toBe(true);
    expect(isPrivateIp("169.254.169.254")).toBe(true);
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("fe80::1")).toBe(true);
    expect(isPrivateIp("fc00::1")).toBe(true);
    expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIp("::ffff:169.254.169.254")).toBe(true);

    // Public IPs return false
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("1.1.1.1")).toBe(false);
    expect(isPrivateIp("93.184.216.34")).toBe(false);
  });

  it("rejects hostnames resolving to internal/private IPs via DNS revalidation", async () => {
    const mockDns = async (_hostname: string) => ["127.0.0.1"];
    await expect(
      validateRemoteUrl("https://evil-dns-rebind.test/resource.zip", { dnsResolver: mockDns }),
    ).rejects.toThrowError(expect.objectContaining({ code: "SSRF_DISALLOWED_IP" }));

    const mockMetadataDns = async (_hostname: string) => ["169.254.169.254"];
    await expect(
      validateRemoteUrl("https://cloud-metadata.test/credentials", {
        dnsResolver: mockMetadataDns,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "SSRF_DISALLOWED_IP" }));
  });

  it("rejects cloud metadata hostnames directly", async () => {
    await expect(
      validateRemoteUrl("http://metadata.google.internal/computeMetadata/v1/"),
    ).rejects.toThrowError(expect.objectContaining({ code: "SSRF_DISALLOWED_HOST" }));
    await expect(
      validateRemoteUrl("http://169.254.169.254/latest/meta-data/"),
    ).rejects.toThrowError(expect.objectContaining({ code: "SSRF_DISALLOWED_HOST" }));
  });

  it("rejects redirects targeting private/internal network addresses", async () => {
    const mockFetch: typeof fetch = async (url) => {
      if (url === "https://public-resource.test/download") {
        return new Response(null, {
          status: 302,
          headers: { Location: "http://169.254.169.254/latest/meta-data/" },
        });
      }
      return new Response("OK");
    };

    const mockDns = async () => ["93.184.216.34"];

    await expect(
      fetchRemoteResource("https://public-resource.test/download", {
        dnsResolver: mockDns,
        fetchImpl: mockFetch,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "SSRF_DISALLOWED_HOST" }));
  });

  it("enforces size limits and content-type allowlists", async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response("Too large content buffer".repeat(100), {
        status: 200,
        headers: { "Content-Type": "application/x-msdownload", "Content-Length": "5000" },
      });
    };
    const mockDns = async () => ["93.184.216.34"];

    // Size limit
    await expect(
      fetchRemoteResource("https://example.test/large.zip", {
        dnsResolver: mockDns,
        fetchImpl: mockFetch,
        maxSizeBytes: 50,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "RESOURCE_SIZE_LIMIT_EXCEEDED" }));

    // Content type allowlist
    await expect(
      fetchRemoteResource("https://example.test/file.exe", {
        dnsResolver: mockDns,
        fetchImpl: mockFetch,
        allowedContentTypes: ["application/zip", "text/x-tex"],
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "DISALLOWED_CONTENT_TYPE" }));
  });

  it("successfully downloads authorized remote resource", async () => {
    const content = "\\documentclass{article}\\begin{document}Remote content\\end{document}";
    const mockFetch: typeof fetch = async () => {
      return new Response(content, {
        status: 200,
        headers: { "Content-Type": "text/x-tex", "Content-Length": String(content.length) },
      });
    };
    const mockDns = async () => ["93.184.216.34"];

    const result = await fetchRemoteResource("https://example.test/paper.tex", {
      dnsResolver: mockDns,
      fetchImpl: mockFetch,
      allowedContentTypes: ["text/x-tex"],
    });

    expect(result.contentLength).toBe(content.length);
    expect(result.contentType).toBe("text/x-tex");
    expect(result.bytes.toString("utf8")).toBe(content);
    expect(result.sha256).toBeDefined();
  });
});
