import { describe, expect, it } from "vitest";
import {
  fetchRemoteResource,
  validateRemoteUrl,
} from "../../../apps/jobs/src/imports/remote-resource.js";

describe("PRO-14 S14-T10: External URL SSRF-safe fetch policy regression", () => {
  it("rejects URLs containing embedded authentication credentials", async () => {
    await expect(
      validateRemoteUrl("https://user:password@example.test/resource.tex"),
    ).rejects.toThrowError(expect.objectContaining({ code: "SSRF_DISALLOWED_HOST" }));
  });

  it("enforces allowed domain boundaries when specified", async () => {
    const mockDns = async () => ["93.184.216.34"];
    const options = {
      allowedDomains: ["ctan.org", "arxiv.org"],
      dnsResolver: mockDns,
    };

    // Permitted domain and subdomain
    await expect(validateRemoteUrl("https://ctan.org/pkg/amsmath", options)).resolves.toBeDefined();
    await expect(
      validateRemoteUrl("https://export.arxiv.org/abs/2101.00001", options),
    ).resolves.toBeDefined();

    // Disallowed domain
    await expect(
      validateRemoteUrl("https://malicious.test/resource", options),
    ).rejects.toThrowError(expect.objectContaining({ code: "SSRF_DISALLOWED_HOST" }));
  });

  it("rejects multi-hop redirect chains that lead to internal resources", async () => {
    let callCount = 0;
    const mockFetch: typeof fetch = async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(null, { status: 301, headers: { Location: "https://hop2.test/next" } });
      }
      return new Response(null, { status: 302, headers: { Location: "http://10.0.0.1/private" } });
    };

    const mockDns = async (host: string) => {
      if (host === "hop2.test" || host === "hop1.test") return ["93.184.216.34"];
      return ["10.0.0.1"];
    };

    await expect(
      fetchRemoteResource("https://hop1.test/start", {
        dnsResolver: mockDns,
        fetchImpl: mockFetch,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "SSRF_DISALLOWED_IP" }));
  });
});
