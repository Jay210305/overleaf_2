import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { parsePublicConfig } from "@latex-collab/config";
import {
  projectInvitationPageSchema,
  shareLinkPageSchema,
  sharingMemberPageSchema,
  sharingMemberViewSchema,
  type ProjectInvitationView,
  type ShareLinkView,
  type SharingMemberView,
} from "@latex-collab/contracts";

const defaultApiUrl = parsePublicConfig(import.meta.env).VITE_API_URL;
type ShareRole = "EDITOR" | "REVIEWER" | "VIEWER";

interface ShareDialogProps {
  projectId: string;
  apiUrl?: string | undefined;
  csrfToken?: string | undefined;
  onClose: () => void;
}

function messageForStatus(status: number): string {
  if (status === 401) return "Session expired. Sign in and try again.";
  if (status === 403) return "Only the project owner can manage sharing.";
  if (status === 404) return "Project or sharing item was not found.";
  if (status === 409) return "Sharing changed. Refresh and try again.";
  if (status === 410) return "This invitation or link has expired or reached its use limit.";
  if (status === 429) return "Too many requests. Wait and try again.";
  return "Sharing request failed. Try again.";
}

async function requireOk(response: Response): Promise<Response> {
  if (!response.ok) throw new Error(messageForStatus(response.status));
  return response;
}

async function sessionCsrf(apiUrl: string, supplied?: string): Promise<string> {
  if (supplied) return supplied;
  try {
    const stored = sessionStorage.getItem("csrf_token");
    if (stored) return stored;
  } catch {
    // A blocked session store still permits the session endpoint fallback.
  }
  const response = await requireOk(
    await fetch(`${apiUrl}/auth/session`, {
      credentials: "include",
      headers: { accept: "application/json" },
    }),
  );
  const token = response.headers.get("x-csrf-token");
  if (!token) throw new Error("Session token unavailable. Sign in and try again.");
  try {
    sessionStorage.setItem("csrf_token", token);
  } catch {
    // Keep the token only for this request when storage is unavailable.
  }
  return token;
}

function roleOptions() {
  return (
    <>
      <option value="EDITOR">Editor</option>
      <option value="REVIEWER">Reviewer</option>
      <option value="VIEWER">Viewer</option>
    </>
  );
}

export function ShareDialog({
  projectId,
  apiUrl = defaultApiUrl,
  csrfToken,
  onClose,
}: ShareDialogProps) {
  const base = `${apiUrl}/projects/${projectId}`;
  const closeButton = useRef<HTMLButtonElement>(null);
  const [members, setMembers] = useState<SharingMemberView[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitationView[]>([]);
  const [links, setLinks] = useState<ShareLinkView[]>([]);
  const [memberCursor, setMemberCursor] = useState<string | null>(null);
  const [invitationCursor, setInvitationCursor] = useState<string | null>(null);
  const [linkCursor, setLinkCursor] = useState<string | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, ShareRole>>({});
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [canManage, setCanManage] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<ShareRole>("EDITOR");
  const [linkRole, setLinkRole] = useState<ShareRole>("VIEWER");
  const [linkExpiry, setLinkExpiry] = useState("");
  const [linkMaxUses, setLinkMaxUses] = useState("");
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoaded(false);
    setError(null);
    try {
      const request = (path: string) =>
        fetch(`${base}/${path}?limit=100`, {
          credentials: "include",
          headers: { accept: "application/json" },
        });
      const memberResponse = await requireOk(await request("members"));
      const memberPage = sharingMemberPageSchema.parse(await memberResponse.json());
      setMembers(memberPage.items);
      setMemberCursor(memberPage.nextCursor);
      setSelectedRoles(
        Object.fromEntries(
          memberPage.items
            .filter((member) => member.role !== "OWNER")
            .map((member) => [member.userId, member.role as ShareRole]),
        ),
      );
      const [invitationResponse, linkResponse] = await Promise.all([
        request("invitations"),
        request("share-links"),
      ]);
      if (invitationResponse.status === 403 && linkResponse.status === 403) {
        setCanManage(false);
        setInvitations([]);
        setLinks([]);
        setInvitationCursor(null);
        setLinkCursor(null);
      } else {
        await requireOk(invitationResponse);
        await requireOk(linkResponse);
        const invitationPage = projectInvitationPageSchema.parse(await invitationResponse.json());
        const linkPage = shareLinkPageSchema.parse(await linkResponse.json());
        setCanManage(true);
        setInvitations(invitationPage.items);
        setLinks(linkPage.items);
        setInvitationCursor(invitationPage.nextCursor);
        setLinkCursor(linkPage.nextCursor);
      }
      setLoaded(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load sharing state.");
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function mutate(path: string, method: "POST" | "PATCH" | "DELETE", body?: object) {
    const token = await sessionCsrf(apiUrl, csrfToken);
    const response = await requireOk(
      await fetch(path, {
        method,
        credentials: "include",
        headers: {
          accept: "application/json",
          "x-csrf-token": token,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
    return response;
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sharing request failed.");
    } finally {
      setBusy(false);
    }
  }

  function loadMore(kind: "members" | "invitations" | "share-links", cursor: string) {
    void run(async () => {
      const params = new URLSearchParams({ limit: "100", cursor });
      const response = await requireOk(
        await fetch(`${base}/${kind}?${params}`, {
          credentials: "include",
          headers: { accept: "application/json" },
        }),
      );
      const json: unknown = await response.json();
      if (kind === "members") {
        const page = sharingMemberPageSchema.parse(json);
        setMembers((previous) => [...previous, ...page.items]);
        setSelectedRoles((previous) => ({
          ...previous,
          ...Object.fromEntries(
            page.items
              .filter((item) => item.role !== "OWNER")
              .map((item) => [item.userId, item.role as ShareRole]),
          ),
        }));
        setMemberCursor(page.nextCursor);
      } else if (kind === "invitations") {
        const page = projectInvitationPageSchema.parse(json);
        setInvitations((previous) => [...previous, ...page.items]);
        setInvitationCursor(page.nextCursor);
      } else {
        const page = shareLinkPageSchema.parse(json);
        setLinks((previous) => [...previous, ...page.items]);
        setLinkCursor(page.nextCursor);
      }
    });
  }

  function submitInvite(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await mutate(`${base}/invitations`, "POST", { email: inviteEmail.trim(), role: inviteRole });
      setInviteEmail("");
      setNotice("Invitation sent.");
      await load();
    });
  }

  function submitLink(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const expiresAt = new Date(linkExpiry);
      if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now())
        throw new Error("Choose a future expiry for the link.");
      const maxUses = linkMaxUses.trim() ? Number(linkMaxUses) : undefined;
      if (maxUses !== undefined && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 10000))
        throw new Error("Maximum uses must be between 1 and 10,000.");
      const response = await mutate(`${base}/share-links`, "POST", {
        role: linkRole,
        expiresAt: expiresAt.toISOString(),
        ...(maxUses === undefined ? {} : { maxUses }),
      });
      const created = (await response.json()) as { token?: unknown };
      if (typeof created.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(created.token))
        throw new Error("Link was created but its one-time token was unavailable.");
      setCreatedUrl(`${window.location.origin}/share-links#token=${created.token}`);
      setNotice("Link created. Copy it now; the secret will not be shown again.");
      await load();
    });
  }

  return (
    <div
      className="share-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
        className="share-dialog"
      >
        <header className="share-dialog-header">
          <h2 id="share-dialog-title">Project sharing</h2>
          <button ref={closeButton} type="button" onClick={onClose}>
            Close
          </button>
        </header>
        {loading && <p role="status">Loading sharing state…</p>}
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {!loading && loaded && (
          <div className="share-sections">
            {!canManage && <p>Only the project owner can manage sharing.</p>}
            <section aria-labelledby="share-members-title">
              <h3 id="share-members-title">Members and roles</h3>
              <ul>
                {members.map((member) => (
                  <li key={member.userId}>
                    <span>
                      {member.displayName} · {member.role}
                    </span>
                    {canManage && member.role !== "OWNER" && (
                      <>
                        <label>
                          Role for {member.displayName}
                          <select
                            value={selectedRoles[member.userId] ?? member.role}
                            disabled={busy}
                            onChange={(event) =>
                              setSelectedRoles((previous) => ({
                                ...previous,
                                [member.userId]: event.target.value as ShareRole,
                              }))
                            }
                          >
                            {roleOptions()}
                          </select>
                        </label>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              const response = await mutate(
                                `${base}/members/${member.userId}`,
                                "PATCH",
                                { role: selectedRoles[member.userId] ?? member.role },
                              );
                              sharingMemberViewSchema.parse(await response.json());
                              setNotice("Member role updated.");
                              await load();
                            })
                          }
                        >
                          Save role for {member.displayName}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await mutate(`${base}/members/${member.userId}`, "DELETE");
                              setNotice("Member removed.");
                              await load();
                            })
                          }
                        >
                          Remove {member.displayName}
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {memberCursor && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => loadMore("members", memberCursor)}
                >
                  Load more members
                </button>
              )}
            </section>
            {canManage && (
              <section aria-labelledby="share-invites-title">
                <h3 id="share-invites-title">Invitations</h3>
                <form onSubmit={submitInvite}>
                  <label>
                    Email{" "}
                    <input
                      type="email"
                      required
                      maxLength={254}
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                    />
                  </label>
                  <label>
                    Invitation role{" "}
                    <select
                      value={inviteRole}
                      onChange={(event) => setInviteRole(event.target.value as ShareRole)}
                    >
                      {roleOptions()}
                    </select>
                  </label>
                  <button type="submit" disabled={busy}>
                    Send invitation
                  </button>
                </form>
                <ul>
                  {invitations.map((invitation) => (
                    <li key={invitation.id}>
                      {invitation.email} · {invitation.role} · {invitation.status} · expires{" "}
                      {new Date(invitation.expiresAt).toLocaleString()}
                      {invitation.status === "pending" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await mutate(`${base}/invitations/${invitation.id}`, "DELETE");
                              setNotice("Invitation revoked.");
                              await load();
                            })
                          }
                        >
                          Revoke invitation for {invitation.email}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {invitationCursor && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => loadMore("invitations", invitationCursor)}
                  >
                    Load more invitations
                  </button>
                )}
              </section>
            )}
            {canManage && (
              <section aria-labelledby="share-links-title">
                <h3 id="share-links-title">Share links</h3>
                <form onSubmit={submitLink}>
                  <label>
                    Link role{" "}
                    <select
                      value={linkRole}
                      onChange={(event) => setLinkRole(event.target.value as ShareRole)}
                    >
                      {roleOptions()}
                    </select>
                  </label>
                  <label>
                    Link expiry{" "}
                    <input
                      type="datetime-local"
                      required
                      value={linkExpiry}
                      onChange={(event) => setLinkExpiry(event.target.value)}
                    />
                  </label>
                  <label>
                    Maximum uses{" "}
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={linkMaxUses}
                      onChange={(event) => setLinkMaxUses(event.target.value)}
                    />
                  </label>
                  <button type="submit" disabled={busy}>
                    Create share link
                  </button>
                </form>
                {createdUrl && (
                  <p>
                    <label>
                      One-time share URL{" "}
                      <input
                        readOnly
                        value={createdUrl}
                        onFocus={(event) => event.target.select()}
                      />
                    </label>
                  </p>
                )}
                <ul>
                  {links.map((link) => (
                    <li key={link.id}>
                      {link.role} · {link.useCount}
                      {link.maxUses === null ? " uses" : `/${link.maxUses} uses`} · expires{" "}
                      {new Date(link.expiresAt).toLocaleString()} ·{" "}
                      {link.revokedAt ? "revoked" : "active"}
                      {!link.revokedAt && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await mutate(`${base}/share-links/${link.id}`, "DELETE");
                              setNotice("Share link revoked.");
                              await load();
                            })
                          }
                        >
                          Revoke link
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {linkCursor && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => loadMore("share-links", linkCursor)}
                  >
                    Load more links
                  </button>
                )}
              </section>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

interface AccessRedemptionProps {
  kind: "invitation" | "share-link";
  apiUrl?: string | undefined;
}

export function AccessRedemption({ kind, apiUrl = defaultApiUrl }: AccessRedemptionProps) {
  const [token] = useState(() => {
    const fragmentValue = new URLSearchParams(window.location.hash.slice(1)).get("token");
    const queryValue = new URLSearchParams(window.location.search).get("token");
    const value = fragmentValue ?? queryValue ?? "";
    window.history.replaceState(null, "", window.location.pathname);
    return value;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

  async function redeem(action: "accept" | "reject" | "redeem") {
    setBusy(true);
    setError(null);
    try {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("Invalid or missing access token.");
      const csrf = await sessionCsrf(apiUrl);
      const path = kind === "invitation" ? `/invitations/${action}` : "/share-links/redeem";
      const response = await requireOk(
        await fetch(`${apiUrl}${path}`, {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": csrf,
            accept: "application/json",
          },
          body: JSON.stringify({ token }),
        }),
      );
      const result = (await response.json()) as { projectId?: unknown };
      if (typeof result.projectId === "string") setProjectId(result.projectId);
      else if (action === "reject") setProjectId("");
      else throw new Error("Access response was incomplete.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Access request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="access-redemption-title">
      <h1 id="access-redemption-title">
        {kind === "invitation" ? "Project invitation" : "Share link"}
      </h1>
      {!token && <p role="alert">This access link has no token.</p>}
      {token && projectId === null && (
        <>
          <p>
            Sign in with your trusted account before continuing. If needed,{" "}
            <Link to="/login" target="_blank" rel="noopener noreferrer">
              sign in in another tab
            </Link>
            , then return here.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void redeem(kind === "invitation" ? "accept" : "redeem")}
          >
            {busy ? "Working…" : kind === "invitation" ? "Accept invitation" : "Join project"}
          </button>
          {kind === "invitation" && (
            <button type="button" disabled={busy} onClick={() => void redeem("reject")}>
              Reject invitation
            </button>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {projectId === "" && <p role="status">Invitation rejected.</p>}
      {projectId && (
        <p role="status">
          Access granted. <Link to={`/project/${projectId}`}>Open project</Link>
        </p>
      )}
    </section>
  );
}
