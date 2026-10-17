import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { parsePublicConfig } from "@latex-collab/config";

const config = parsePublicConfig(import.meta.env);

interface AdminQuotas {
  maxConcurrentCompilationsPerProject: number;
  maxProjectSizeBytes: number;
  maxDailyCompilationsPerUser: number;
}

interface AdminFeatureFlags {
  publicSignupEnabled: boolean;
  untrustedCompileEnabled: boolean;
  gitBridgeEnabled: boolean;
  templatesGalleryEnabled: boolean;
}

interface UserSummary {
  id: string;
  email_normalized: string;
  display_name: string;
  disabled_at: string | null;
  created_at: string;
}

export function AdminDashboard() {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const quotasQuery = useQuery<{ quotas: AdminQuotas }>({
    queryKey: ["admin", "quotas"],
    queryFn: async () => {
      const res = await fetch(`${config.VITE_API_URL}/admin/quotas`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load quotas");
      return res.json();
    },
  });

  const flagsQuery = useQuery<{ flags: AdminFeatureFlags }>({
    queryKey: ["admin", "flags"],
    queryFn: async () => {
      const res = await fetch(`${config.VITE_API_URL}/admin/flags`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load feature flags");
      return res.json();
    },
  });

  const usersQuery = useQuery<{ users: UserSummary[] }>({
    queryKey: ["admin", "users"],
    queryFn: async () => {
      const res = await fetch(`${config.VITE_API_URL}/admin/users`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load users");
      return res.json();
    },
  });

  async function fetchCsrfToken(): Promise<string> {
    try {
      const stored = sessionStorage.getItem("csrf_token");
      if (stored) return stored;
      const res = await fetch(`${config.VITE_API_URL}/auth/session`, { credentials: "include" });
      const token = res.headers.get("x-csrf-token");
      if (token) {
        sessionStorage.setItem("csrf_token", token);
        return token;
      }
    } catch {}
    return "";
  }

  const disableUserMutation = useMutation({
    mutationFn: async ({ userId, disabled }: { userId: string; disabled: boolean }) => {
      const csrf = await fetchCsrfToken();
      const res = await fetch(`${config.VITE_API_URL}/admin/users/${userId}/disable`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        body: JSON.stringify({ disabled }),
      });
      if (!res.ok) throw new Error("Failed to update user moderation status");
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (err: Error) => {
      setErrorMessage(err.message);
    },
  });

  return (
    <div className="admin-dashboard p-6 space-y-8">
      <h1 className="text-2xl font-bold">System Administration & Abuse Controls</h1>
      {errorMessage && (
        <div role="alert" className="p-4 bg-red-100 text-red-800 rounded">
          {errorMessage}
        </div>
      )}

      {/* Quotas Section */}
      <section aria-labelledby="quotas-heading" className="space-y-4">
        <h2 id="quotas-heading" className="text-xl font-semibold">Concurrency & Storage Quotas (NFR-07)</h2>
        {quotasQuery.data?.quotas && (
          <dl className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded">
            <dt className="font-medium">Max Concurrent Compiles / Project:</dt>
            <dd>{quotasQuery.data.quotas.maxConcurrentCompilationsPerProject}</dd>
            <dt className="font-medium">Max Project Size (MB):</dt>
            <dd>{Math.round(quotasQuery.data.quotas.maxProjectSizeBytes / (1024 * 1024))} MB</dd>
            <dt className="font-medium">Max Daily Compiles / User:</dt>
            <dd>{quotasQuery.data.quotas.maxDailyCompilationsPerUser}</dd>
          </dl>
        )}
      </section>

      {/* Feature Flags Section */}
      <section aria-labelledby="flags-heading" className="space-y-4">
        <h2 id="flags-heading" className="text-xl font-semibold">Security & Feature Flags</h2>
        {flagsQuery.data?.flags && (
          <ul className="space-y-2">
            <li>
              Public Signup Enabled:{" "}
              <span className="font-mono">{flagsQuery.data.flags.publicSignupEnabled ? "TRUE" : "FALSE"}</span>
            </li>
            <li>
              Untrusted Compile Enabled:{" "}
              <span className="font-mono">{flagsQuery.data.flags.untrustedCompileEnabled ? "TRUE" : "FALSE"}</span>
            </li>
          </ul>
        )}
      </section>

      {/* User Moderation Section */}
      <section aria-labelledby="users-heading" className="space-y-4">
        <h2 id="users-heading" className="text-xl font-semibold">User Moderation & Abuse Mitigation</h2>
        {usersQuery.data?.users && (
          <table className="w-full text-left border">
            <thead>
              <tr className="border-b bg-gray-100">
                <th className="p-2">Email</th>
                <th className="p-2">Display Name</th>
                <th className="p-2">Status</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {usersQuery.data.users.map((u) => (
                <tr key={u.id} className="border-b">
                  <td className="p-2">{u.email_normalized}</td>
                  <td className="p-2">{u.display_name}</td>
                  <td className="p-2">{u.disabled_at ? "Suspended" : "Active"}</td>
                  <td className="p-2">
                    <button
                      type="button"
                      className="px-3 py-1 text-sm rounded bg-gray-200 hover:bg-gray-300"
                      onClick={() =>
                        disableUserMutation.mutate({
                          userId: u.id,
                          disabled: !u.disabled_at,
                        })
                      }
                    >
                      {u.disabled_at ? "Reactivate" : "Suspend (Abuse)"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
