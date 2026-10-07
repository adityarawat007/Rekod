import 'server-only';
import { serverEnv } from '../../env.ts';
import type { Store } from './types.ts';

/**
 * The database, chosen by DATABASE_URL's scheme. Adding an adapter is one file
 * implementing Store plus one entry here. Each adapter loads on first use, so
 * a Postgres install never loads the MongoDB driver (and vice versa). Resolved
 * on first use, never at import (env is lazy — see lib/env.ts).
 */
const adapters: { schemes: string[]; load: () => Promise<Store> }[] = [
  { schemes: ['postgres', 'postgresql'], load: async () => (await import('./pg.ts')).pgStore },
  { schemes: ['mongodb', 'mongodb+srv'], load: async () => (await import('./mongo.ts')).mongoStore },
];

let loading: Promise<Store> | undefined;

/** The chosen adapter, loaded. Rejects (and retries next time) on a bad URL. */
export function loadStore(): Promise<Store> {
  return (loading ??= (async () => {
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(serverEnv().DATABASE_URL)?.[1].toLowerCase();
    const a = adapters.find((x) => scheme && x.schemes.includes(scheme));
    if (!a) {
      throw new Error(
        `DATABASE_URL scheme "${scheme ?? ''}:" is not supported. Use ${adapters.flatMap((x) => x.schemes).map((k) => `${k}://`).join(' or ')}.`,
      );
    }
    return a.load();
  })().catch((e) => {
    loading = undefined;
    throw e;
  }));
}

/** Better Auth's database and the options that go with it. Async because the
 *  adapter may not be loaded yet; auth() awaits it once. */
export async function authParts() {
  const s = await loadStore();
  await s.init?.(); // a failure (Mongo indexes) surfaces here, before Better Auth gets the adapter
  return { database: s.authAdapter(), options: s.authOptions?.() };
}

/** Every data method, forwarded to the adapter once it has loaded. Callers
 *  keep writing `store().x()`; there is no sync access to a lazy module. */
export type DataStore = Omit<Store, 'authAdapter' | 'authOptions' | 'init' | 'recountVideos'> & {
  recountVideos(): Promise<number>;
};

const facade: DataStore = {
  health: async () => (await loadStore()).health(),
  listReports: async (...a) => (await loadStore()).listReports(...a),
  getReport: async (...a) => (await loadStore()).getReport(...a),
  sharedReport: async (...a) => (await loadStore()).sharedReport(...a),
  projectsOf: async (...a) => (await loadStore()).projectsOf(...a),
  commentsOf: async (...a) => (await loadStore()).commentsOf(...a),
  usageOf: async (...a) => (await loadStore()).usageOf(...a),
  assetKeys: async (...a) => (await loadStore()).assetKeys(...a),
  getShareToken: async (...a) => (await loadStore()).getShareToken(...a),
  abandoned: async (...a) => (await loadStore()).abandoned(...a),
  setPlan: async (...a) => (await loadStore()).setPlan(...a),
  insertReport: async (...a) => (await loadStore()).insertReport(...a),
  completeReport: async (...a) => (await loadStore()).completeReport(...a),
  updateReport: async (...a) => (await loadStore()).updateReport(...a),
  deleteReports: async (...a) => (await loadStore()).deleteReports(...a),
  addComment: async (...a) => (await loadStore()).addComment(...a),
  deleteComment: async (...a) => (await loadStore()).deleteComment(...a),
  setShareToken: async (...a) => (await loadStore()).setShareToken(...a),
  recountVideos: async () => (await loadStore()).recountVideos?.() ?? 0,
  workspaceOf: async (...a) => (await loadStore()).workspaceOf(...a),
  workspacesOf: async (...a) => (await loadStore()).workspacesOf(...a),
  ownedWorkspaces: async (...a) => (await loadStore()).ownedWorkspaces(...a),
};

export const store = (): DataStore => facade;

export type { Store } from './types.ts';
