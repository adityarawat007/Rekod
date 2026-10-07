import 'server-only';
import { AwsClient } from 'aws4fetch';
import { serverEnv } from '../env.ts';
import type { BlobStore } from './types.ts';

/**
 * Any S3-compatible bucket: SeaweedFS in dev, Supabase Storage's S3 endpoint
 * (`https://<ref>.supabase.co/storage/v1/s3`) for our org, R2/S3/MinIO for
 * self-hosters. Path-style URLs, because Supabase and SeaweedFS both want them.
 *
 * The server only signs; bytes go browser/extension ⇄ bucket directly.
 *
 * BlobStore is the seam: another bucket API is one object satisfying it.
 */

let client: AwsClient | undefined;
const aws = () => {
  const e = serverEnv();
  return (client ??= new AwsClient({
    accessKeyId: e.S3_ACCESS_KEY_ID,
    secretAccessKey: e.S3_SECRET_ACCESS_KEY,
    service: 's3',
    region: e.S3_REGION,
  }));
};

const objectUrl = (key: string) => {
  const e = serverEnv();
  const path = key.split('/').map(encodeURIComponent).join('/');
  return new URL(`${e.S3_ENDPOINT.replace(/\/$/, '')}/${e.S3_BUCKET}/${path}`);
};

async function presign(method: 'GET' | 'PUT', key: string, seconds: number, bytes?: number) {
  const url = objectUrl(key);
  url.searchParams.set('X-Amz-Expires', String(seconds));
  // allHeaders: aws4fetch leaves content-length out of the signature by
  // default. Signed in, the bucket rejects a body of any other length.
  const headers = bytes === undefined ? undefined : { 'content-length': String(bytes) };
  const signed = await aws().sign(url.toString(), { method, headers, aws: { signQuery: true, allHeaders: true } });
  return signed.url;
}

/** 15 minutes: long enough to upload a 3-minute video on a slow link. The
 *  exact size is signed in — that is the only size cap a direct upload has. */
const presignUpload = (key: string, bytes: number, seconds = 900) => presign('PUT', key, seconds, bytes);
/** Short on purpose — see "Old signed URLs keep working" in ROADMAP.md. */
const presignDownload = (key: string, seconds = 900) => presign('GET', key, seconds);

async function removeObject(key: string) {
  const res = await aws().fetch(objectUrl(key).toString(), { method: 'DELETE' });
  // 404 is success: the object is already gone, which is what delete wants.
  if (!res.ok && res.status !== 404) throw new Error(`storage delete ${key}: ${res.status}`);
}

/** A JSON object (the logs and network files), fetched server-side. */
async function readJson<T>(key: string): Promise<T> {
  const res = await aws().fetch(objectUrl(key).toString());
  if (!res.ok) throw new Error(`storage read ${key}: ${res.status}`);
  return res.json() as Promise<T>;
}

export const s3Store: BlobStore = { presignUpload, presignDownload, removeObject, readJson };
