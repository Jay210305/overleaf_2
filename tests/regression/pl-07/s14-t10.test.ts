import { describe, expect, it } from "vitest";
import {
  fetchRemoteResource,
} from "../../../apps/jobs/src/imports/remote-resource.js";

describe("PL-07 S14-T10: Privacy and compiler boundary protection regression", () => {
  it("never includes local ambient credentials or cookies in remote requests", async () => {
    let capturedHeaders: HeadersInit | undefined;
    const mockFetch: typeof fetch = async (_url, init) => {
      capturedHeaders = init?.headers;
      return new Response("OK", { status: 200 });
    };

    const mockDns = async () => ["93.184.216.34"];

    await fetchRemoteResource("https://external.test/data.bib", {
      dnsResolver: mockDns,
      fetchImpl: mockFetch,
    });

    expect(capturedHeaders).toBeDefined();
    const headers = capturedHeaders as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
    expect(headers["Cookie"]).toBeUndefined();
    expect(headers["x-csrf-token"]).toBeUndefined();
  });

  it("prevents DNS rebinding to cloud metadata or internal services", async () => {
    // Rebinding returns public IP initially, then private IP on second lookup
    let lookupCount = 0;
    const rebindingDns = async () => {
      lookupCount++;
      return lookupCount === 1 ? ["93.184.216.34"] : ["169.254.169.254"];
    };

    const mockFetch: typeof fetch = async (url) => {
      if (url === "https://rebind.test/step1") {
        return new Response(null, { status: 302, headers: { Location: "https://rebind.test/step2" } });
      }
      return new Response("leak");
    };

    await expect(
      fetchRemoteResource("https://rebind.test/step1", {
        dnsResolver: rebindingDns,
        fetchImpl: mockFetch,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "SSRF_DISALLOWED_IP" }));
  });
});
