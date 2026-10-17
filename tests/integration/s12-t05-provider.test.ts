import { expect, it, vi } from "vitest";
import { createGitHubRestReader } from "../../apps/api/src/modules/integrations/github-rest.js";

it("reads an authorized branch tree and exact blob bytes without following provider URLs", async () => {
  const sha = (digit: string) => digit.repeat(40);
  const calls: string[] = [];
  const fetcher = vi.fn(async (url: string | URL | Request) => {
    const path = String(url);
    calls.push(path);
    if (path.endsWith("/git/ref/heads/main")) return Response.json({ object: { sha: sha("a") } });
    if (path.endsWith(`/git/commits/${sha("a")}`))
      return Response.json({ tree: { sha: sha("b") } });
    if (path.endsWith(`/git/trees/${sha("b")}?recursive=1`))
      return Response.json({
        truncated: false,
        tree: [{ path: "main.tex", type: "blob", size: 3, sha: sha("c") }],
      });
    if (path.endsWith(`/git/blobs/${sha("c")}`))
      return Response.json({ encoding: "base64", content: "YWJj\n", size: 3 });
    throw new Error(`unexpected provider request: ${path}`);
  });
  const reader = createGitHubRestReader(fetcher as unknown as typeof fetch);
  const tree = await reader.readTree("fixture-token", "owner/repo", "main");
  expect(tree).toEqual({
    sha: sha("a"),
    defaultBranch: "main",
    entries: [{ path: "main.tex", kind: "file", sizeBytes: 3, sha: sha("c") }],
  });
  expect(
    await reader.readFile("fixture-token", "owner/repo", "main", "main.tex", sha("c")),
  ).toEqual(Buffer.from("abc"));
  expect(calls).toHaveLength(4);
  expect(calls.every((url) => url.startsWith("https://api.github.com/repos/owner/repo/git/"))).toBe(
    true,
  );
});

it("rejects a truncated provider tree and oversized decoded blob", async () => {
  const sha = (digit: string) => digit.repeat(40);
  const reader = createGitHubRestReader((async (url: string | URL | Request) => {
    const path = String(url);
    if (path.includes("/ref/")) return Response.json({ object: { sha: sha("a") } });
    if (path.includes("/commits/")) return Response.json({ tree: { sha: sha("b") } });
    if (path.includes("/trees/")) return Response.json({ truncated: true, tree: [] });
    return Response.json({ encoding: "base64", content: "YWJj", size: 30_000_000 });
  }) as unknown as typeof fetch);
  await expect(reader.readTree("fixture-token", "owner/repo", "main")).rejects.toMatchObject({
    code: "PROVIDER_UNAVAILABLE",
  });
  await expect(
    reader.readFile("fixture-token", "owner/repo", "main", "main.tex", sha("c")),
  ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
});
