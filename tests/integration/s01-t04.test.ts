import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import {
  crdtUpdates,
  crdtSnapshots,
  comments,
  commentReplies,
  suggestions,
  chatMessages,
  commentStatuses,
  suggestionStatuses,
} from "../../packages/db/src/schema/collaboration.js";
import {
  externalConnections,
  projectIntegrations,
  templates,
  auditEvents,
  notifications,
  usageQuotas,
  featureFlags,
} from "../../packages/db/src/schema/integrations.js";

describe("S01-T04 Collaboration and integration tables", () => {
  it("exposes collaboration entities satisfying the contract schema", () => {
    // crdt_updates
    const updateCols = getTableColumns(crdtUpdates);
    expect(updateCols).toHaveProperty("id");
    expect(updateCols).toHaveProperty("fileId");
    expect(updateCols).toHaveProperty("seq");
    expect(updateCols).toHaveProperty("actorUserId");
    expect(updateCols).toHaveProperty("payloadBytes");
    expect(updateCols).toHaveProperty("createdAt");

    // crdt_snapshots
    const snapCols = getTableColumns(crdtSnapshots);
    expect(snapCols).toHaveProperty("id");
    expect(snapCols).toHaveProperty("fileId");
    expect(snapCols).toHaveProperty("uptoSeq");
    expect(snapCols).toHaveProperty("stateBytes");
    expect(snapCols).toHaveProperty("blobKey");
    expect(snapCols).toHaveProperty("contentSha256");
    expect(snapCols).toHaveProperty("createdAt");

    // comments & replies
    const commCols = getTableColumns(comments);
    expect(commCols).toHaveProperty("id");
    expect(commCols).toHaveProperty("projectId");
    expect(commCols).toHaveProperty("fileId");
    expect(commCols).toHaveProperty("createdBy");
    expect(commCols).toHaveProperty("anchorStartJson");
    expect(commCols).toHaveProperty("anchorEndJson");
    expect(commCols).toHaveProperty("body");
    expect(commCols).toHaveProperty("status");
    expect(commCols).toHaveProperty("createdAt");

    const replyCols = getTableColumns(commentReplies);
    expect(replyCols).toHaveProperty("id");
    expect(replyCols).toHaveProperty("commentId");
    expect(replyCols).toHaveProperty("authorId");
    expect(replyCols).toHaveProperty("body");
    expect(replyCols).toHaveProperty("createdAt");
    expect(replyCols).toHaveProperty("deletedAt");

    // suggestions
    const suggCols = getTableColumns(suggestions);
    expect(suggCols).toHaveProperty("id");
    expect(suggCols).toHaveProperty("projectId");
    expect(suggCols).toHaveProperty("fileId");
    expect(suggCols).toHaveProperty("authorId");
    expect(suggCols).toHaveProperty("kind");
    expect(suggCols).toHaveProperty("baseRevision");
    expect(suggCols).toHaveProperty("anchorJson");
    expect(suggCols).toHaveProperty("oldTextHash");
    expect(suggCols).toHaveProperty("newText");
    expect(suggCols).toHaveProperty("status");
    expect(suggCols).toHaveProperty("resolvedBy");

    // chat_messages
    const chatCols = getTableColumns(chatMessages);
    expect(chatCols).toHaveProperty("id");
    expect(chatCols).toHaveProperty("projectId");
    expect(chatCols).toHaveProperty("authorId");
    expect(chatCols).toHaveProperty("body");
    expect(chatCols).toHaveProperty("createdAt");
    expect(chatCols).toHaveProperty("deletedAt");
  });

  it("exposes integration and support entities satisfying the contract schema", () => {
    // external_connections
    const connCols = getTableColumns(externalConnections);
    expect(connCols).toHaveProperty("id");
    expect(connCols).toHaveProperty("userId");
    expect(connCols).toHaveProperty("provider");
    expect(connCols).toHaveProperty("encryptedCredentialRef");
    expect(connCols).toHaveProperty("scopesJson");
    expect(connCols).toHaveProperty("status");
    expect(connCols).toHaveProperty("createdAt");

    // project_integrations
    const intCols = getTableColumns(projectIntegrations);
    expect(intCols).toHaveProperty("id");
    expect(intCols).toHaveProperty("projectId");
    expect(intCols).toHaveProperty("connectionId");
    expect(intCols).toHaveProperty("provider");
    expect(intCols).toHaveProperty("remoteRef");
    expect(intCols).toHaveProperty("branch");
    expect(intCols).toHaveProperty("lastSyncedRevision");
    expect(intCols).toHaveProperty("syncCursor");

    // templates
    const tempCols = getTableColumns(templates);
    expect(tempCols).toHaveProperty("id");
    expect(tempCols).toHaveProperty("ownerId");
    expect(tempCols).toHaveProperty("title");
    expect(tempCols).toHaveProperty("category");
    expect(tempCols).toHaveProperty("description");
    expect(tempCols).toHaveProperty("sourceManifestKey");
    expect(tempCols).toHaveProperty("publishedAt");
    expect(tempCols).toHaveProperty("version");

    // audit_events
    const auditCols = getTableColumns(auditEvents);
    expect(auditCols).toHaveProperty("id");
    expect(auditCols).toHaveProperty("actorId");
    expect(auditCols).toHaveProperty("projectId");
    expect(auditCols).toHaveProperty("action");
    expect(auditCols).toHaveProperty("targetType");
    expect(auditCols).toHaveProperty("targetId");
    expect(auditCols).toHaveProperty("metadataRedacted");
    expect(auditCols).toHaveProperty("occurredAt");
    expect(auditCols).toHaveProperty("requestId");

    // notifications
    const notifCols = getTableColumns(notifications);
    expect(notifCols).toHaveProperty("id");
    expect(notifCols).toHaveProperty("userId");
    expect(notifCols).toHaveProperty("type");
    expect(notifCols).toHaveProperty("payloadJson");
    expect(notifCols).toHaveProperty("readAt");
    expect(notifCols).toHaveProperty("createdAt");

    // usage_quotas
    const quotaCols = getTableColumns(usageQuotas);
    expect(quotaCols).toHaveProperty("id");
    expect(quotaCols).toHaveProperty("subjectType");
    expect(quotaCols).toHaveProperty("subjectId");
    expect(quotaCols).toHaveProperty("metric");
    expect(quotaCols).toHaveProperty("maxValue");
    expect(quotaCols).toHaveProperty("window");
    expect(quotaCols).toHaveProperty("effectiveAt");

    // feature_flags
    const flagCols = getTableColumns(featureFlags);
    expect(flagCols).toHaveProperty("key");
    expect(flagCols).toHaveProperty("enabled");
    expect(flagCols).toHaveProperty("scope");
    expect(flagCols).toHaveProperty("configurationJson");
  });

  it("verifies collaboration enums agree with contract specifications", () => {
    expect(commentStatuses).toEqual(["open", "resolved", "detached"]);
    expect(suggestionStatuses).toEqual(["pending", "accepted", "rejected", "conflict"]);
  });
});
