import { AuthError } from "../auth/errors.js";

export function validateProjectTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length === 0 || trimmed.length > 300) {
    throw new AuthError(400, "VALIDATION_ERROR");
  }
  if (/[\0\r\n\x00-\x1f\x7f]/.test(title)) {
    throw new AuthError(400, "VALIDATION_ERROR");
  }
  return trimmed;
}

export function parseIfMatch(header: string | undefined): number {
  if (!header) {
    throw new AuthError(400, "VALIDATION_ERROR");
  }
  const match = /^"([0-9]+)"$/.exec(header.trim());
  if (!match) {
    throw new AuthError(400, "VALIDATION_ERROR");
  }
  return Number.parseInt(match[1]!, 10);
}
