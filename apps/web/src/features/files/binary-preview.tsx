import React, { useEffect, useState } from "react";

export interface BinaryPreviewNode {
  id: string;
  name: string;
  mime: string;
  contentKind: "TEXT" | "BINARY";
  sizeBytes: number;
}

export interface BinaryPreviewProps {
  projectId: string;
  apiUrl: string;
  node: BinaryPreviewNode;
}

const inlineImageTypes = new Set(["image/png", "image/jpeg"]);
const inlinePdfType = "application/pdf";

function downloadUrl(apiUrl: string, projectId: string, nodeId: string): string {
  return `${apiUrl}/projects/${projectId}/files/${nodeId}/download`;
}

/**
 * Safe binary preview. Permitted images and PDFs render from bytes fetched
 * through the authorized download route as local blob URLs; the fetch uses
 * session credentials and never exposes an object key or signed URL. Every
 * other binary — including legacy active HTML/SVG the upload policy would
 * reject today — renders as an attachment-only download link and its bytes
 * are never fetched into the page, so active content cannot execute in the
 * trusted UI. Failures degrade to a visible placeholder, never a raw URL.
 */
export const BinaryPreview: React.FC<BinaryPreviewProps> = ({ projectId, apiUrl, node }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const previewable =
    node.contentKind === "BINARY" &&
    (inlineImageTypes.has(node.mime) || node.mime === inlinePdfType);
  const url = downloadUrl(apiUrl, projectId, node.id);

  useEffect(() => {
    setObjectUrl(null);
    setFailed(false);
    if (!previewable) return;
    const controller = new AbortController();
    let created: string | null = null;
    void (async () => {
      try {
        const response = await fetch(url, { credentials: "include", signal: controller.signal });
        if (!response.ok) {
          setFailed(true);
          return;
        }
        const blob = await response.blob();
        if (!blob.size || controller.signal.aborted) {
          setFailed(true);
          return;
        }
        if (node.mime === inlinePdfType && blob.type !== inlinePdfType) {
          setFailed(true);
          return;
        }
        if (inlineImageTypes.has(node.mime) && !blob.type.startsWith("image/")) {
          setFailed(true);
          return;
        }
        created = URL.createObjectURL(blob);
        if (!controller.signal.aborted) setObjectUrl(created);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    })();
    return () => {
      controller.abort();
      if (created) URL.revokeObjectURL(created);
    };
  }, [url, previewable, node.mime]);

  if (!previewable) {
    if (node.contentKind !== "BINARY") {
      return (
        <span data-testid="binary-unavailable" className="text-sm text-gray-500">
          Binary preview unavailable for {node.name}
        </span>
      );
    }
    return (
      <a
        href={url}
        download={node.name}
        data-testid="binary-download"
        className="text-sm text-blue-600 underline"
      >
        Download {node.name}
      </a>
    );
  }

  if (failed) {
    return (
      <span data-testid="binary-unavailable" className="text-sm text-gray-500">
        Preview unavailable for {node.name}
      </span>
    );
  }

  if (!objectUrl) {
    return (
      <span data-testid="binary-loading" className="text-sm text-gray-400">
        Loading {node.name}…
      </span>
    );
  }

  if (node.mime === inlinePdfType) {
    return (
      <embed
        src={objectUrl}
        type="application/pdf"
        data-testid="binary-pdf"
        className="w-full min-h-96"
      />
    );
  }

  return <img src={objectUrl} alt={node.name} data-testid="binary-image" className="max-w-full" />;
};
