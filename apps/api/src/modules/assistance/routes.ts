import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  type WritingAssistantProvider,
  type WritingAssistantRequest,
  type WritingAssistantResponse,
  MockWritingAssistantProvider,
  STATIC_LATEX_HELP,
  writingAssistantRequestSchema,
} from "@latex-collab/contracts";
import type { DatabaseClient } from "@latex-collab/db";
import { problem } from "../../plugins/errors.js";
import { requireSession } from "../../plugins/require-session.js";

export interface AssistanceRoutesOptions {
  db?: DatabaseClient | undefined;
  origin?: string | undefined;
  secureCookies?: boolean | undefined;
  provider?: WritingAssistantProvider | undefined;
}

// In-memory user consent store (userId -> { consentGranted: boolean, consentedAt: Date })
const userConsents = new Map<string, { consentGranted: boolean; consentedAt: Date }>();

export function setUserConsent(userId: string, granted: boolean): void {
  userConsents.set(userId, {
    consentGranted: granted,
    consentedAt: new Date(),
  });
}

export function getUserConsent(userId: string): { consentGranted: boolean; consentedAt?: Date } {
  const c = userConsents.get(userId);
  return c ? { consentGranted: c.consentGranted, consentedAt: c.consentedAt } : { consentGranted: false };
}

export function clearUserConsents(): void {
  userConsents.clear();
}

// In-memory quota tracker (userId -> { count: number, resetAt: number })
const userQuotas = new Map<string, { count: number; resetAt: number }>();
const MAX_REQUESTS_PER_WINDOW = 50;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

export function checkAndConsumeQuota(userId: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = userQuotas.get(userId);

  if (!entry || now > entry.resetAt) {
    userQuotas.set(userId, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1 };
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - entry.count };
}

export function resetUserQuota(userId: string): void {
  userQuotas.delete(userId);
}

let activeProvider: WritingAssistantProvider = new MockWritingAssistantProvider();

export function setAssistanceProvider(provider: WritingAssistantProvider | null): void {
  activeProvider = provider ?? new MockWritingAssistantProvider();
}

export function getAssistanceProvider(): WritingAssistantProvider {
  return activeProvider;
}

export function registerAssistanceRoutes(
  app: FastifyInstance,
  options: AssistanceRoutesOptions = {},
): void {
  if (options.provider) {
    activeProvider = options.provider;
  }

  async function resolveUserId(request: FastifyRequest, mutation = false): Promise<string> {
    const auth = request as unknown as {
      projectAuthorization?: { identity?: { userId?: string }; userId?: string };
      sessionIdentity?: { userId?: string };
      session?: { userId?: string };
    };
    if (auth.projectAuthorization?.userId) return auth.projectAuthorization.userId;
    if (auth.projectAuthorization?.identity?.userId) return auth.projectAuthorization.identity.userId;
    if (auth.sessionIdentity?.userId) return auth.sessionIdentity.userId;
    if (auth.session?.userId) return auth.session.userId;

    if (options.db) {
      try {
        const session = await requireSession(
          options.db,
          request,
          options.origin,
          options.secureCookies ?? false,
          mutation,
        );
        return session.userId;
      } catch {
        // Fall back to anonymous if unauthenticated
      }
    }
    return "anonymous";
  }

  // 1. Get user consent status
  app.get("/api/v1/assistance/consent", async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await resolveUserId(request, false);
    const consent = getUserConsent(userId);

    return reply.code(200).send({
      userId,
      consentGranted: consent.consentGranted,
      consentedAt: consent.consentedAt?.toISOString() ?? null,
      modelProvider: "local_or_trusted",
    });
  });

  // 2. Set user consent status
  app.post("/api/v1/assistance/consent", async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await resolveUserId(request, true);
    const body = request.body as { consentGranted?: boolean };

    const granted = Boolean(body?.consentGranted);
    setUserConsent(userId, granted);

    return reply.code(200).send({
      userId,
      consentGranted: granted,
      consentedAt: new Date().toISOString(),
      modelProvider: "local_or_trusted",
    });
  });

  // 3. Static LaTeX help (operates offline without transmitting text)
  app.get("/api/v1/assistance/static-help", async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send({
      helpEntries: STATIC_LATEX_HELP,
    });
  });

  // 4. Request writing assistance on a selected text fragment
  app.post(
    "/api/v1/projects/:projectId/assistance",
    { config: { projectAction: "READ" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { projectId } = request.params as { projectId: string };
      const userId = await resolveUserId(request, false);

      // A. Schema validation
      const parseResult = writingAssistantRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply
          .code(400)
          .type("application/problem+json")
          .send(problem(400, "VALIDATION_ERROR", request.id, "Invalid writing assistant request payload"));
      }

      const body: WritingAssistantRequest = parseResult.data;

      // Project ID in path must match payload
      if (body.projectId !== projectId) {
        return reply
          .code(400)
          .type("application/problem+json")
          .send(problem(400, "VALIDATION_ERROR", request.id, "Project ID in path does not match payload"));
      }

      // B. Opt-in Consent Verification (INT-09, EDT-14)
      const userConsent = getUserConsent(userId);
      if (!body.optInConsent || !userConsent.consentGranted) {
        return reply
          .code(403)
          .type("application/problem+json")
          .send(
            problem(
              403,
              "AI_CONSENT_REQUIRED",
              request.id,
              "Writing assistant requires explicit opt-in consent; no manuscript text is transmitted without consent",
            ),
          );
      }

      // C. Bounded Quota Check
      const quota = checkAndConsumeQuota(userId);
      if (!quota.allowed) {
        return reply
          .code(429)
          .type("application/problem+json")
          .send(
            problem(
              429,
              "QUOTA_EXCEEDED",
              request.id,
              "Writing assistant request quota exceeded; please try again later",
            ),
          );
      }

      // D. Provider Invocation with Disconnect & Error Fallback
      try {
        const currentProvider = getAssistanceProvider();
        const result = await currentProvider.generateAssistance({
          fragment: body.fragment,
          mode: body.mode,
          instruction: body.instruction,
        });

        const responsePayload: WritingAssistantResponse = {
          ok: true,
          suggestion: result.suggestion,
          mode: body.mode,
          tokensUsed: result.tokensUsed,
          remainingQuota: quota.remaining,
        };

        return reply.code(200).send(responsePayload);
      } catch {
        // Fallback: Disconnect and provider errors preserve editor use without blocking
        const matchedStaticHelp = STATIC_LATEX_HELP["Undefined control sequence"];
        const fallbackResponse: WritingAssistantResponse = {
          ok: false,
          mode: body.mode,
          fallbackAvailable: true,
          staticHelp: matchedStaticHelp,
          error: "Writing assistant provider temporarily unavailable",
          remainingQuota: quota.remaining,
        };

        return reply.code(200).send(fallbackResponse);
      }
    },
  );
}
