// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Providers } from "../../apps/web/src/app/providers";
import { HealthPanel } from "../../apps/web/src/features/health/health-panel";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("rejects a malformed successful response then recovers on retry", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ status: "fake" }), { status: 200 }))
    .mockResolvedValue(
      new Response(JSON.stringify({ status: "ready", requestId: "request-1" }), { status: 200 }),
    );
  vi.stubGlobal("fetch", fetcher);
  render(
    <Providers>
      <HealthPanel />
    </Providers>,
  );
  await screen.findByText(/Service unavailable/);
  fireEvent.click(screen.getByRole("button", { name: "Check connection" }));
  expect(await screen.findByText("Service ready")).toBeTruthy();
});
it("does not label failed readiness as ready", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
  render(
    <Providers>
      <HealthPanel />
    </Providers>,
  );
  expect(await screen.findByText(/Service unavailable/)).toBeTruthy();
});
