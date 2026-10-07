/**
 * BlobStore is the seam: another bucket API is one file satisfying it plus one
 * entry in the registry in index.ts. The server only signs; bytes go
 * browser/extension <-> bucket directly.
 */
export type BlobStore = {
  presignUpload(key: string, bytes: number, seconds?: number): Promise<string>;
  presignDownload(key: string, seconds?: number): Promise<string>;
  removeObject(key: string): Promise<void>;
  readJson<T>(key: string): Promise<T>;
};
