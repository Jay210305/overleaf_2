import { createHash } from "node:crypto";

export class AuthError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "AuthError";
  }
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
