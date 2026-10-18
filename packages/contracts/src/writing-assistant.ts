import { z } from "zod";

export const assistantModeSchema = z.enum([
  "grammar",
  "rephrase",
  "autocomplete",
  "explain_error",
  "summarize",
]);
export type AssistantMode = z.infer<typeof assistantModeSchema>;

export const writingAssistantConsentSchema = z.strictObject({
  userId: z.string().uuid(),
  consentGranted: z.boolean(),
  consentedAt: z.string().datetime().nullable(),
  modelProvider: z.string().default("local_or_trusted"),
});
export type WritingAssistantConsent = z.infer<typeof writingAssistantConsentSchema>;

// Strict bound on fragment size: never transmit entire manuscript (max 4,000 characters)
export const MAX_FRAGMENT_LENGTH = 4000;

export const writingAssistantRequestSchema = z.strictObject({
  projectId: z.string().uuid(),
  fragment: z.string().min(1).max(MAX_FRAGMENT_LENGTH),
  mode: assistantModeSchema,
  instruction: z.string().max(500).optional(),
  optInConsent: z.boolean(),
});
export type WritingAssistantRequest = z.infer<typeof writingAssistantRequestSchema>;

export const writingAssistantResponseSchema = z.strictObject({
  ok: z.boolean(),
  suggestion: z.string().optional(),
  mode: assistantModeSchema,
  tokensUsed: z.number().int().optional(),
  remainingQuota: z.number().int().optional(),
  fallbackAvailable: z.boolean().optional(),
  staticHelp: z.string().optional(),
  error: z.string().optional(),
});
export type WritingAssistantResponse = z.infer<typeof writingAssistantResponseSchema>;

export interface WritingAssistantProvider {
  generateAssistance(params: {
    fragment: string;
    mode: AssistantMode;
    instruction?: string | undefined;
  }): Promise<{ suggestion: string; tokensUsed: number }>;
}

export class MockWritingAssistantProvider implements WritingAssistantProvider {
  constructor(private readonly shouldFail: boolean = false) {}

  async generateAssistance(params: {
    fragment: string;
    mode: AssistantMode;
    instruction?: string | undefined;
  }): Promise<{ suggestion: string; tokensUsed: number }> {
    if (this.shouldFail) {
      throw new Error("Provider service unavailable or disconnected");
    }

    switch (params.mode) {
      case "grammar":
        return {
          suggestion: params.fragment.replace(/\bteh\b/g, "the"),
          tokensUsed: 15,
        };
      case "rephrase":
        return {
          suggestion: `In summary, ${params.fragment.toLowerCase()}`,
          tokensUsed: 25,
        };
      case "explain_error":
        return {
          suggestion: "LaTeX error explanation: missing closing bracket or undefined macro.",
          tokensUsed: 30,
        };
      case "autocomplete":
        return {
          suggestion: `${params.fragment} \\label{sec:intro}`,
          tokensUsed: 10,
        };
      case "summarize":
        return {
          suggestion: "Condensed summary of the provided text fragment.",
          tokensUsed: 20,
        };
    }
  }
}

/**
 * Static LaTeX command and compiler error help library that operates entirely offline
 * without transmitting any manuscript text (EDT-14).
 */
export const STATIC_LATEX_HELP: Record<string, string> = {
  "Undefined control sequence":
    "LaTeX encountered an unrecognized macro or command. Check spelling or verify that the required package is imported in the preamble via \\usepackage{...}.",
  "Missing $ inserted":
    "A math symbol (such as _, ^, or greek letters) was used in standard text mode. Enclose the formula in dollar signs: $...$.",
  "Fatal error occurred, no output PDF file produced":
    "The compiler crashed due to severe syntax errors or missing required input files. Inspect compiler raw logs for previous error locations.",
  "Runaway argument":
    "An opening brace '{' or environment was not properly closed before the end of the paragraph or file.",
};
