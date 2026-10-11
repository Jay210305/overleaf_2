export type ObjectRef = {
  key: string;
  sha256: string;
  sizeBytes: number;
  mime: string;
};

export interface StorageAdapter {
  put(key: string, bytes: Uint8Array, mime: string): Promise<ObjectRef>;
  get(key: string): Promise<Uint8Array>;
  head(key: string): Promise<ObjectRef | null>;
  delete(key: string): Promise<void>;
  presign(key: string, operation: "get" | "put", ttlSeconds: number): Promise<string>;
}

export type RevisionManifest = {
  version: 1;
  projectId: string;
  revisionId: string;
  revisionNo: number;
  mainFileId: string;
  compiler: "pdflatex" | "xelatex" | "lualatex" | "latex";
  texliveImageDigest: string;
  items: Array<{
    nodeId: string;
    path: string;
    kind: "TEXT" | "BINARY";
    object: ObjectRef;
  }>;
};
