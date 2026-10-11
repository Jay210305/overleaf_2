import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import {
  artifactSets,
  authIdentities,
  compileJobs,
  compilers,
  contentKinds,
  nodeKinds,
  projectInvitations,
  projectMembers,
  projectNodes,
  projectRevisions,
  projects,
  projectStatuses,
  projectTagLinks,
  projectTags,
  revisionItems,
  roles,
  sessions,
  shareLinks,
  textDocuments,
  userPreferences,
  users,
  verificationTokens,
} from "../../packages/db/src/schema/core.js";

describe("S01-T01 Core Drizzle entities", () => {
  it("exposes all core entities with typed fields specified by the contract", () => {
    // users
    const userCols = getTableColumns(users);
    expect(userCols).toHaveProperty("id");
    expect(userCols).toHaveProperty("emailNormalized");
    expect(userCols).toHaveProperty("passwordHash");
    expect(userCols).toHaveProperty("displayName");
    expect(userCols).toHaveProperty("avatarKey");
    expect(userCols).toHaveProperty("emailVerifiedAt");
    expect(userCols).toHaveProperty("createdAt");
    expect(userCols).toHaveProperty("disabledAt");

    // user_preferences
    const prefCols = getTableColumns(userPreferences);
    expect(prefCols).toHaveProperty("userId");
    expect(prefCols).toHaveProperty("locale");
    expect(prefCols).toHaveProperty("timezone");
    expect(prefCols).toHaveProperty("theme");
    expect(prefCols).toHaveProperty("editorSettingsJson");
    expect(prefCols).toHaveProperty("notificationSettingsJson");

    // sessions
    const sessCols = getTableColumns(sessions);
    expect(sessCols).toHaveProperty("id");
    expect(sessCols).toHaveProperty("userId");
    expect(sessCols).toHaveProperty("tokenHash");
    expect(sessCols).toHaveProperty("expiresAt");
    expect(sessCols).toHaveProperty("lastSeenAt");
    expect(sessCols).toHaveProperty("revokedAt");
    expect(sessCols).toHaveProperty("deviceLabel");

    // auth_identities
    const authCols = getTableColumns(authIdentities);
    expect(authCols).toHaveProperty("id");
    expect(authCols).toHaveProperty("userId");
    expect(authCols).toHaveProperty("provider");
    expect(authCols).toHaveProperty("providerSubject");

    // verification_tokens
    const tokenCols = getTableColumns(verificationTokens);
    expect(tokenCols).toHaveProperty("id");
    expect(tokenCols).toHaveProperty("userId");
    expect(tokenCols).toHaveProperty("purpose");
    expect(tokenCols).toHaveProperty("tokenHash");
    expect(tokenCols).toHaveProperty("expiresAt");
    expect(tokenCols).toHaveProperty("usedAt");

    // projects
    const projCols = getTableColumns(projects);
    expect(projCols).toHaveProperty("id");
    expect(projCols).toHaveProperty("ownerId");
    expect(projCols).toHaveProperty("title");
    expect(projCols).toHaveProperty("description");
    expect(projCols).toHaveProperty("mainFileId");
    expect(projCols).toHaveProperty("compiler");
    expect(projCols).toHaveProperty("texliveImageVersion");
    expect(projCols).toHaveProperty("status");
    expect(projCols).toHaveProperty("currentRevision");
    expect(projCols).toHaveProperty("createdAt");
    expect(projCols).toHaveProperty("updatedAt");

    // project_members
    const memCols = getTableColumns(projectMembers);
    expect(memCols).toHaveProperty("projectId");
    expect(memCols).toHaveProperty("userId");
    expect(memCols).toHaveProperty("role");
    expect(memCols).toHaveProperty("joinedAt");
    expect(memCols).toHaveProperty("revokedAt");

    // project_invitations
    const invCols = getTableColumns(projectInvitations);
    expect(invCols).toHaveProperty("id");
    expect(invCols).toHaveProperty("projectId");
    expect(invCols).toHaveProperty("emailNormalized");
    expect(invCols).toHaveProperty("role");
    expect(invCols).toHaveProperty("tokenHash");
    expect(invCols).toHaveProperty("expiresAt");
    expect(invCols).toHaveProperty("acceptedAt");
    expect(invCols).toHaveProperty("invitedBy");

    // share_links
    const linkCols = getTableColumns(shareLinks);
    expect(linkCols).toHaveProperty("id");
    expect(linkCols).toHaveProperty("projectId");
    expect(linkCols).toHaveProperty("tokenHash");
    expect(linkCols).toHaveProperty("role");
    expect(linkCols).toHaveProperty("expiresAt");
    expect(linkCols).toHaveProperty("maxUses");
    expect(linkCols).toHaveProperty("useCount");
    expect(linkCols).toHaveProperty("revokedAt");

    // project_nodes
    const nodeCols = getTableColumns(projectNodes);
    expect(nodeCols).toHaveProperty("id");
    expect(nodeCols).toHaveProperty("projectId");
    expect(nodeCols).toHaveProperty("parentId");
    expect(nodeCols).toHaveProperty("name");
    expect(nodeCols).toHaveProperty("kind");
    expect(nodeCols).toHaveProperty("mime");
    expect(nodeCols).toHaveProperty("sizeBytes");
    expect(nodeCols).toHaveProperty("contentKind");
    expect(nodeCols).toHaveProperty("blobKey");
    expect(nodeCols).toHaveProperty("deletedAt");

    // project_tags & project_tag_links
    const tagCols = getTableColumns(projectTags);
    expect(tagCols).toHaveProperty("id");
    expect(tagCols).toHaveProperty("userId");
    expect(tagCols).toHaveProperty("name");
    expect(tagCols).toHaveProperty("color");

    const tagLinkCols = getTableColumns(projectTagLinks);
    expect(tagLinkCols).toHaveProperty("projectId");
    expect(tagLinkCols).toHaveProperty("tagId");

    // text_documents
    const docCols = getTableColumns(textDocuments);
    expect(docCols).toHaveProperty("fileId");
    expect(docCols).toHaveProperty("projectId");
    expect(docCols).toHaveProperty("latestSnapshotId");
    expect(docCols).toHaveProperty("lastPersistedSeq");
    expect(docCols).toHaveProperty("updatedAt");

    // project_revisions & revision_items
    const revCols = getTableColumns(projectRevisions);
    expect(revCols).toHaveProperty("id");
    expect(revCols).toHaveProperty("projectId");
    expect(revCols).toHaveProperty("revisionNo");
    expect(revCols).toHaveProperty("manifestKey");
    expect(revCols).toHaveProperty("manifestHash");
    expect(revCols).toHaveProperty("authorId");
    expect(revCols).toHaveProperty("source");
    expect(revCols).toHaveProperty("createdAt");
    expect(revCols).toHaveProperty("label");

    const itemCols = getTableColumns(revisionItems);
    expect(itemCols).toHaveProperty("revisionId");
    expect(itemCols).toHaveProperty("nodeId");
    expect(itemCols).toHaveProperty("path");
    expect(itemCols).toHaveProperty("blobKey");
    expect(itemCols).toHaveProperty("sha256");
    expect(itemCols).toHaveProperty("deleted");

    // compile_jobs & artifact_sets
    const jobCols = getTableColumns(compileJobs);
    expect(jobCols).toHaveProperty("id");
    expect(jobCols).toHaveProperty("projectId");
    expect(jobCols).toHaveProperty("requestedBy");
    expect(jobCols).toHaveProperty("sourceRevisionId");
    expect(jobCols).toHaveProperty("engine");
    expect(jobCols).toHaveProperty("optionsHash");
    expect(jobCols).toHaveProperty("status");
    expect(jobCols).toHaveProperty("queueId");
    expect(jobCols).toHaveProperty("startedAt");
    expect(jobCols).toHaveProperty("finishedAt");
    expect(jobCols).toHaveProperty("errorCode");
    expect(jobCols).toHaveProperty("artifactSetId");

    const artCols = getTableColumns(artifactSets);
    expect(artCols).toHaveProperty("id");
    expect(artCols).toHaveProperty("compileJobId");
    expect(artCols).toHaveProperty("pdfKey");
    expect(artCols).toHaveProperty("logKey");
    expect(artCols).toHaveProperty("synctexKey");
    expect(artCols).toHaveProperty("auxManifestKey");
    expect(artCols).toHaveProperty("sourceHash");
    expect(artCols).toHaveProperty("createdAt");
    expect(artCols).toHaveProperty("expiresAt");
  });

  it("verifies enum constants match contract boundaries", () => {
    expect(roles).toEqual(["OWNER", "EDITOR", "REVIEWER", "VIEWER"]);
    expect(compilers).toEqual(["pdflatex", "xelatex", "lualatex", "latex"]);
    expect(projectStatuses).toEqual(["active", "archived", "trashed"]);
    expect(nodeKinds).toEqual(["FILE", "FOLDER"]);
    expect(contentKinds).toEqual(["TEXT", "BINARY"]);
  });
});
