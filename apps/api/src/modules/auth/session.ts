import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { loginRequestSchema, userViewSchema, type UserView } from "@latex-collab/contracts";
import { writeAuditEvent, type DatabaseClient, type TransactionContext } from "@latex-collab/db";
import { AuthError, tokenHash } from "./errors.js";
import { normalizeEmail } from "./register.js";
import { requireSessionCsrf } from "../../plugins/csrf.js";
import { challengeMfaLogin } from "./totp.js";

const idleMs = 7 * 24 * 60 * 60 * 1000;
const absoluteMs = 30 * 24 * 60 * 60 * 1000;
// Hashing an unknown account's password keeps the normal and absent-user paths comparable.
const dummyHash = argon2.hash(randomBytes(32), { type: argon2.argon2id });

interface AccountRow {
  id: string;
  email_normalized: string;
  display_name: string;
  password_hash: string | null;
  email_verified_at: Date | null;
  disabled_at: Date | null;
  created_at: Date;
}

interface SessionRow extends AccountRow {
  session_id: string;
  csrf_hash: string | null;
  expires_at: Date;
  session_created_at: Date;
  revoked_at: Date | null;
}

export interface SessionIssue {
  user: UserView;
  token: string;
  csrf: string;
  expiresAt: Date;
}

function view(account: AccountRow): UserView {
  return userViewSchema.parse({
    id: account.id,
    email: account.email_normalized,
    displayName: account.display_name,
    createdAt: account.created_at.toISOString(),
  });
}

function newSecret(): string {
  return randomBytes(32).toString("base64url");
}

function expiry(now: Date, createdAt: Date): Date {
  return new Date(Math.min(now.getTime() + idleMs, createdAt.getTime() + absoluteMs));
}

export async function login(
  db: DatabaseClient,
  rawInput: unknown,
  requestId: string,
): Promise<SessionIssue> {
  const input = rawInput as { email?: unknown; password?: unknown } | null;
  const email = typeof input?.email === "string" ? normalizeEmail(input.email) : undefined;
  const parsed = loginRequestSchema.safeParse({ ...input, email });
  if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");
  const result = await db.query<AccountRow>(
    "SELECT id, email_normalized, display_name, password_hash, email_verified_at, disabled_at, created_at FROM users WHERE email_normalized = $1",
    [email],
  );
  const account = result.rows[0];
  const valid = await argon2.verify(
    account?.password_hash ?? (await dummyHash),
    parsed.data.password,
  );
  if (!valid || !account?.password_hash) throw new AuthError(401, "AUTHENTICATION_REQUIRED");
  await challengeMfaLogin(db, account.id, parsed.data.code);
  const token = newSecret();
  const csrf = newSecret();
  const now = new Date();
  const expiresAt = expiry(now, now);
  return db.transaction(async (tx) => {
    const current = await tx.query<AccountRow>(
      "SELECT id, email_normalized, display_name, password_hash, email_verified_at, disabled_at, created_at FROM users WHERE id = $1 FOR UPDATE",
      [account.id],
    );
    const locked = current.rows[0];
    if (!locked || locked.password_hash !== account.password_hash)
      throw new AuthError(401, "AUTHENTICATION_REQUIRED");
    if (locked.disabled_at) throw new AuthError(403, "ACCOUNT_DISABLED");
    if (!locked.email_verified_at) throw new AuthError(403, "EMAIL_NOT_VERIFIED");
    const session = await tx.query<{ id: string }>(
      "INSERT INTO sessions (user_id, token_hash, csrf_hash, expires_at, last_seen_at, device_label) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      [locked.id, tokenHash(token), tokenHash(csrf), expiresAt, now, "Browser"],
    );
    await writeAuditEvent(tx, {
      action: "session.login",
      actorId: locked.id,
      targetId: session.rows[0]!.id,
      requestId,
    });
    return { user: view(locked), token, csrf, expiresAt };
  });
}

async function lockedSession(tx: TransactionContext, token: string): Promise<SessionRow> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AuthError(401, "AUTHENTICATION_REQUIRED");
  const result = await tx.query<SessionRow>(
    `SELECT s.id AS session_id, s.csrf_hash, s.expires_at, s.created_at AS session_created_at,
            s.revoked_at, u.id, u.email_normalized, u.display_name, u.password_hash,
            u.email_verified_at, u.disabled_at, u.created_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 FOR UPDATE OF s`,
    [tokenHash(token)],
  );
  const row = result.rows[0];
  if (
    !row ||
    !row.csrf_hash ||
    row.revoked_at ||
    row.expires_at.getTime() <= Date.now() ||
    row.session_created_at.getTime() + absoluteMs <= Date.now()
  )
    throw new AuthError(401, "AUTHENTICATION_REQUIRED");
  if (row.disabled_at) throw new AuthError(403, "ACCOUNT_DISABLED");
  if (!row.email_verified_at) throw new AuthError(403, "EMAIL_NOT_VERIFIED");
  return row;
}

export async function rotateSession(db: DatabaseClient, token: string): Promise<SessionIssue> {
  return db.transaction(async (tx) => {
    const row = await lockedSession(tx, token);
    const nextToken = newSecret();
    const csrf = newSecret();
    const now = new Date();
    const expiresAt = expiry(now, row.session_created_at);
    await tx.query(
      "UPDATE sessions SET token_hash = $1, csrf_hash = $2, expires_at = $3, last_seen_at = $4 WHERE id = $5",
      [tokenHash(nextToken), tokenHash(csrf), expiresAt, now, row.session_id],
    );
    return { user: view(row), token: nextToken, csrf, expiresAt };
  });
}

export async function logout(
  db: DatabaseClient,
  token: string,
  csrf: unknown,
  requestId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockedSession(tx, token);
    requireSessionCsrf(csrf, row.csrf_hash);
    await tx.query("UPDATE sessions SET revoked_at = NOW() WHERE id = $1", [row.session_id]);
    await writeAuditEvent(tx, {
      action: "session.revoked",
      actorId: row.id,
      targetId: row.session_id,
      requestId,
    });
  });
}

export function sessionCookieName(secure: boolean): string {
  return secure ? "__Host-latex_session" : "latex_session";
}

export function sessionCookie(token: string, secure: boolean, expiresAt: Date): string {
  const maxAge = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
  return `${sessionCookieName(secure)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function expiredSessionCookie(secure: boolean): string {
  return `${sessionCookieName(secure)}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

export function readSessionCookie(header: string | undefined, secure: boolean): string {
  const name = sessionCookieName(secure);
  const matches = (header ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  if (matches.length !== 1) throw new AuthError(401, "AUTHENTICATION_REQUIRED");
  return matches[0]!.slice(name.length + 1);
}

export async function createSessionForUserId(
  db: DatabaseClient,
  userId: string,
  requestId: string,
): Promise<SessionIssue> {
  const token = newSecret();
  const csrf = newSecret();
  const now = new Date();
  const expiresAt = expiry(now, now);
  return db.transaction(async (tx) => {
    const current = await tx.query<AccountRow>(
      "SELECT id, email_normalized, display_name, password_hash, email_verified_at, disabled_at, created_at FROM users WHERE id = $1 FOR UPDATE",
      [userId],
    );
    const locked = current.rows[0];
    if (!locked) throw new AuthError(404, "RESOURCE_NOT_FOUND");
    if (locked.disabled_at) throw new AuthError(403, "ACCOUNT_DISABLED");
    const session = await tx.query<{ id: string }>(
      "INSERT INTO sessions (user_id, token_hash, csrf_hash, expires_at, last_seen_at, device_label) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      [locked.id, tokenHash(token), tokenHash(csrf), expiresAt, now, "Browser"],
    );
    await writeAuditEvent(tx, {
      action: "session.login",
      actorId: locked.id,
      targetId: session.rows[0]!.id,
      requestId,
    });
    return { user: view(locked), token, csrf, expiresAt };
  });
}

