import { createHash } from "node:crypto";

export class AuthError extends Error {
  readonly statusCode: number;
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "AuthError";
    this.statusCode = status;
  }
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
