import { maxFileBytes } from "@latex-collab/storage";
import type { GitHubRepo } from "@latex-collab/contracts";

const SHA = /^[a-f0-9]{40}$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BRANCH = /^[A-Za-z0-9._/-]+$/;

function providerError(code: string) {
  return { code };
}

/** Fixed-host GitHub REST reader. Provider URLs and redirects are never followed. */
export function createGitHubRestReader(request: typeof fetch = fetch) {
  async function get(token: string, path: string): Promise<Record<string, unknown> | unknown[]> {
    let response: Response;
    try {
      response = await request(`https://api.github.com/${path}`, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw providerError("PROVIDER_UNAVAILABLE");
    }
    if (!response.ok) {
      if (response.status === 401) throw providerError("TOKEN_EXPIRED");
      if (
        response.status === 429 ||
        (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0")
      )
        throw providerError("RATE_LIMITED");
      if (response.status === 403) throw providerError("CREDENTIALS_MISSING");
      if (response.status === 404) throw providerError("RESOURCE_NOT_FOUND");
      throw providerError("PROVIDER_UNAVAILABLE");
    }
    try {
      const body: unknown = await response.json();
      if (typeof body !== "object" || body === null) throw new Error("Invalid provider body");
      return body as Record<string, unknown> | unknown[];
    } catch {
      throw providerError("PROVIDER_UNAVAILABLE");
    }
  }
  function object(value: unknown): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      throw providerError("PROVIDER_UNAVAILABLE");
    return value as Record<string, unknown>;
  }
  function sha(value: unknown): string {
    if (typeof value !== "string" || !SHA.test(value)) throw providerError("PROVIDER_UNAVAILABLE");
    return value;
  }
  function repo(value: string): string {
    if (!REPO.test(value)) throw providerError("PROVIDER_UNAVAILABLE");
    return value;
  }
  function branch(value: string): string {
    if (!BRANCH.test(value) || value.includes("..") || value.includes("//"))
      throw providerError("PROVIDER_UNAVAILABLE");
    return value.split("/").map(encodeURIComponent).join("/");
  }
  return {
    async listRepos(token: string): Promise<GitHubRepo[]> {
      const repos: GitHubRepo[] = [];
      for (let page = 1; page <= 10; page += 1) {
        const result = await get(token, `user/repos?per_page=100&page=${page}`);
        if (!Array.isArray(result)) throw providerError("PROVIDER_UNAVAILABLE");
        for (const item of result) {
          const row = object(item);
          if (
            typeof row.full_name !== "string" ||
            typeof row.default_branch !== "string" ||
            typeof row.private !== "boolean"
          )
            throw providerError("PROVIDER_UNAVAILABLE");
          repos.push({
            fullName: row.full_name,
            defaultBranch: row.default_branch,
            private: row.private,
          });
        }
        if (result.length < 100) return repos;
      }
      throw providerError("QUOTA_EXCEEDED");
    },
    async readTree(token: string, remoteRef: string, selectedBranch: string) {
      const root = `repos/${repo(remoteRef)}/git`;
      const ref = object(await get(token, `${root}/ref/heads/${branch(selectedBranch)}`));
      const commitSha = sha(object(ref.object).sha);
      const commit = object(await get(token, `${root}/commits/${commitSha}`));
      const treeSha = sha(object(commit.tree).sha);
      const tree = object(await get(token, `${root}/trees/${treeSha}?recursive=1`));
      if (tree.truncated !== false || !Array.isArray(tree.tree))
        throw providerError("PROVIDER_UNAVAILABLE");
      return {
        sha: commitSha,
        defaultBranch: selectedBranch,
        entries: tree.tree.map((raw) => {
          const item = object(raw);
          if (typeof item.path !== "string" || (item.type !== "blob" && item.type !== "tree"))
            throw providerError("PROVIDER_UNAVAILABLE");
          return {
            path: item.path,
            kind: item.type === "tree" ? ("folder" as const) : ("file" as const),
            sizeBytes: item.type === "tree" ? 0 : Number(item.size),
            sha: item.type === "tree" ? null : sha(item.sha),
          };
        }),
      };
    },
    async readFile(
      token: string,
      remoteRef: string,
      _branch: string,
      _path: string,
      blobSha: string,
    ): Promise<Uint8Array> {
      const blob = object(await get(token, `repos/${repo(remoteRef)}/git/blobs/${sha(blobSha)}`));
      if (blob.encoding !== "base64" || typeof blob.content !== "string")
        throw providerError("PROVIDER_UNAVAILABLE");
      if (typeof blob.size !== "number" || blob.size < 0 || blob.size > maxFileBytes)
        throw providerError("QUOTA_EXCEEDED");
      const bytes = Buffer.from(blob.content.replace(/\s/g, ""), "base64");
      if (bytes.byteLength !== blob.size) throw providerError("PROVIDER_UNAVAILABLE");
      return bytes;
    },
  };
}
