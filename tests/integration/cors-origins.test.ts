import { describe, expect, it } from "vitest";
import { isOriginAllowed, parseAllowedOrigins } from "@latex-collab/config/server";
import { createServer } from "../../apps/api/src/server.js";
import { MemoryTicketStore, validateAndConsumeTicket } from "../../apps/collab/src/auth/ticket.js";

describe("CORS & Origin Validation", () => {
  describe("isOriginAllowed", () => {
    it("matches exact origins case-insensitively and ignores trailing slashes", () => {
      const allowed = "https://latex-editor.pages.dev";
      expect(isOriginAllowed("https://latex-editor.pages.dev", allowed)).toBe(true);
      expect(isOriginAllowed("https://latex-editor.pages.dev/", allowed)).toBe(true);
      expect(isOriginAllowed("HTTPS://LATEX-EDITOR.PAGES.DEV", allowed)).toBe(true);
      expect(isOriginAllowed("http://latex-editor.pages.dev", allowed)).toBe(false);
      expect(isOriginAllowed("https://evil.com", allowed)).toBe(false);
    });

    it("supports comma-separated string of origins", () => {
      const allowed =
        "https://latex-editor.pages.dev, https://latex-editor-do7.pages.dev, http://localhost:5173";
      expect(isOriginAllowed("https://latex-editor.pages.dev", allowed)).toBe(true);
      expect(isOriginAllowed("https://latex-editor-do7.pages.dev", allowed)).toBe(true);
      expect(isOriginAllowed("http://localhost:5173", allowed)).toBe(true);
      expect(isOriginAllowed("http://localhost:3000", allowed)).toBe(false);
      expect(isOriginAllowed("https://evil.example", allowed)).toBe(false);
    });

    it("supports array of allowed origins", () => {
      const allowed = [
        "https://latex-editor.pages.dev",
        "https://latex-editor-do7.pages.dev",
        "http://localhost:5173",
      ];
      expect(isOriginAllowed("https://latex-editor.pages.dev", allowed)).toBe(true);
      expect(isOriginAllowed("https://latex-editor-do7.pages.dev", allowed)).toBe(true);
      expect(isOriginAllowed("http://localhost:5173", allowed)).toBe(true);
      expect(isOriginAllowed("https://unauthorized.org", allowed)).toBe(false);
    });

    it("supports wildcard subdomains securely", () => {
      const allowed = "https://*.latex-editor.pages.dev, *.pages.dev";
      expect(isOriginAllowed("https://preview-123.latex-editor.pages.dev", allowed)).toBe(true);
      expect(isOriginAllowed("https://my-branch.pages.dev", allowed)).toBe(true);
      // Malicious attempts with similar names must fail
      expect(isOriginAllowed("https://evil-pages.dev", allowed)).toBe(false);
      expect(isOriginAllowed("https://notpages.dev", allowed)).toBe(false);
      expect(
        isOriginAllowed(
          "http://preview.latex-editor.pages.dev",
          "https://*.latex-editor.pages.dev",
        ),
      ).toBe(false);
    });

    it("supports localhost port wildcards", () => {
      const allowed = "http://localhost:*";
      expect(isOriginAllowed("http://localhost:5173", allowed)).toBe(true);
      expect(isOriginAllowed("http://localhost:3000", allowed)).toBe(true);
      expect(isOriginAllowed("http://localhost:4000", allowed)).toBe(true);
      expect(isOriginAllowed("http://127.0.0.1:5173", allowed)).toBe(false);
    });

    it("denies null, undefined, and invalid inputs", () => {
      expect(isOriginAllowed(undefined, "https://latex-editor.pages.dev")).toBe(false);
      expect(isOriginAllowed(null, "https://latex-editor.pages.dev")).toBe(false);
      expect(isOriginAllowed("null", "https://latex-editor.pages.dev")).toBe(false);
      expect(isOriginAllowed("invalid-url", "https://latex-editor.pages.dev")).toBe(false);
      expect(isOriginAllowed("https://latex-editor.pages.dev", undefined)).toBe(false);
      expect(isOriginAllowed("https://latex-editor.pages.dev", "")).toBe(false);
    });
  });

  describe("parseAllowedOrigins", () => {
    it("automatically derives Cloudflare Pages siblings for latex-editor", () => {
      const origins = parseAllowedOrigins("https://latex-editor-do7.pages.dev");
      expect(origins).toContain("https://latex-editor-do7.pages.dev");
      expect(origins).toContain("https://latex-editor.pages.dev");
      expect(origins).toContain("https://*.latex-editor.pages.dev");
      expect(origins).toContain("*.pages.dev");
    });

    it("parses custom CORS_ORIGIN comma-separated list", () => {
      const origins = parseAllowedOrigins(
        "https://app.example.com",
        "https://editor.example.com, http://localhost:5173",
      );
      expect(origins).toContain("https://app.example.com");
      expect(origins).toContain("https://editor.example.com");
      expect(origins).toContain("http://localhost:5173");
    });
  });

  describe("Fastify CORS and CSRF Integration", () => {
    const app = createServer({
      checkReadiness: async () => true,
      origin: "https://latex-editor.pages.dev",
      allowedOrigins: [
        "https://latex-editor-do7.pages.dev",
        "http://localhost:5173",
        "https://*.latex-editor.pages.dev",
      ],
      logger: false,
    });

    it("responds to OPTIONS preflight for allowed production origin", async () => {
      const res = await app.inject({
        method: "OPTIONS",
        url: "/api/v1/auth/session",
        headers: {
          origin: "https://latex-editor.pages.dev",
          "access-control-request-method": "GET",
        },
      });
      expect(res.statusCode).toBe(204);
      expect(res.headers["access-control-allow-origin"]).toBe("https://latex-editor.pages.dev");
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
    });

    it("responds to OPTIONS preflight for allowed preview origin", async () => {
      const res = await app.inject({
        method: "OPTIONS",
        url: "/api/v1/auth/session",
        headers: {
          origin: "https://latex-editor-do7.pages.dev",
          "access-control-request-method": "GET",
        },
      });
      expect(res.statusCode).toBe(204);
      expect(res.headers["access-control-allow-origin"]).toBe("https://latex-editor-do7.pages.dev");
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
    });

    it("responds to OPTIONS preflight for localhost", async () => {
      const res = await app.inject({
        method: "OPTIONS",
        url: "/api/v1/auth/session",
        headers: {
          origin: "http://localhost:5173",
          "access-control-request-method": "GET",
        },
      });
      expect(res.statusCode).toBe(204);
      expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
    });

    it("does not allow unauthorized origin on preflight", async () => {
      const res = await app.inject({
        method: "OPTIONS",
        url: "/api/v1/auth/session",
        headers: {
          origin: "https://evil.example",
          "access-control-request-method": "GET",
        },
      });
      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("allows GET /api/v1/auth/session from allowed origin (returns 401 when no session, not 403 CSRF)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/auth/session",
        headers: {
          origin: "https://latex-editor.pages.dev",
        },
      });
      // 503 or 401 is expected because no db is attached, but NOT 403 CSRF_DENIED!
      expect(res.statusCode).not.toBe(403);
      expect(res.headers["access-control-allow-origin"]).toBe("https://latex-editor.pages.dev");
    });

    it("rejects GET /api/v1/auth/session from evil origin with 403 CSRF_DENIED", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/auth/session",
        headers: {
          origin: "https://evil.example",
        },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("CSRF_DENIED");
      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    });
  });

  describe("Collab WebSocket Origin Validation", () => {
    it("validates tickets against allowed origins list", async () => {
      const store = new MemoryTicketStore();
      const ticketView = await store.createTicket({
        userId: "user-1",
        projectId: "proj-1",
        fileId: "file-1",
        action: "write",
        sessionId: "sess-1",
      });

      const allowedOrigin =
        "https://latex-editor.pages.dev, https://latex-editor-do7.pages.dev, http://localhost:5173";

      // Test allowed origin 1
      const res1 = await validateAndConsumeTicket({
        ticket: ticketView.ticket,
        origin: "https://latex-editor.pages.dev",
        allowedOrigin,
        ticketStore: store,
      });
      expect(res1.ok).toBe(true);

      // Create new ticket for test 2
      const ticketView2 = await store.createTicket({
        userId: "user-1",
        projectId: "proj-1",
        fileId: "file-1",
        action: "write",
        sessionId: "sess-1",
      });
      const res2 = await validateAndConsumeTicket({
        ticket: ticketView2.ticket,
        origin: "https://latex-editor-do7.pages.dev",
        allowedOrigin,
        ticketStore: store,
      });
      expect(res2.ok).toBe(true);

      // Create new ticket for test 3 (unauthorized origin)
      const ticketView3 = await store.createTicket({
        userId: "user-1",
        projectId: "proj-1",
        fileId: "file-1",
        action: "write",
        sessionId: "sess-1",
      });
      const res3 = await validateAndConsumeTicket({
        ticket: ticketView3.ticket,
        origin: "https://attacker.org",
        allowedOrigin,
        ticketStore: store,
      });
      expect(res3.ok).toBe(false);
      if (!res3.ok) {
        expect(res3.error).toBe("ORIGIN_NOT_ALLOWED");
      }
    });
  });
});
