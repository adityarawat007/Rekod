import 'server-only';
import { serverEnv } from '../env.ts';
import type { BlobStore } from './types.ts';

/**
 * The bucket adapter, chosen by STORAGE_DRIVER (default s3). Adding one is a
 * file implementing BlobStore plus one entry here. Loaded on first use, never
 * at import (env is lazy — see lib/env.ts). S3 covers any S3-compatible
 * bucket, GCS included, through its interoperability endpoint.
 */
const drivers: Record<string, () => Promise<BlobStore>> = {
  s3: async () => (await import('./s3.ts')).s3Store,
};

let loading: Promise<BlobStore> | undefined;

export function loadBlob(): Promise<BlobStore> {
  return (loading ??= (async () => {
    const name = serverEnv().STORAGE_DRIVER ?? 's3';
    const d = drivers[name];
    if (!d) throw new Error(`STORAGE_DRIVER "${name}" is not supported. Use ${Object.keys(drivers).join(' or ')}.`);
    return d();
  })().catch((e) => {
    loading = undefined;
    throw e;
  }));
}

/** Every method returns a promise, so the lazy load hides behind a forwarder. */
const facade: BlobStore = {
  presignUpload: async (...a) => (await loadBlob()).presignUpload(...a),
  presignDownload: async (...a) => (await loadBlob()).presignDownload(...a),
  removeObject: async (...a) => (await loadBlob()).removeObject(...a),
  readJson: async <T,>(key: string) => (await loadBlob()).readJson<T>(key),
};

export const blob = (): BlobStore => facade;
export const { presignUpload, presignDownload, removeObject, readJson } = facade;
export type { BlobStore } from './types.ts';
