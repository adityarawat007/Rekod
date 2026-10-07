import type { BetterAuthOptions } from 'better-auth';
import type { Plan } from '../../plans.ts';

/**
 * Every database operation the app makes, and nothing else. Adapters (pg.ts,
 * later mongo.ts) return raw data; the rules — plan limits, id and token
 * validation, presigning, objects-before-rows — live in reports.ts and friends.
 *
 * The tenant rule rides along: every method that touches workspace data takes
 * `ws` first and puts it in its filter. The exceptions are keyed by something
 * else on purpose — sharedReport() (the token is the credential), abandoned()
 * (a system job), and the user-keyed ones (a plan, a workspace list, a comment
 * thread under a report the caller already resolved).
 */

export type Kind = 'video' | 'screenshot' | 'logs' | 'network' | 'poster';
export type MediaType = 'video' | 'screenshot';
export type Asset = { kind: Kind; key: string };

/** `project` is an exact match on the site host. */
export type Filters = { q?: string; types?: MediaType[]; project?: string };

export type ListRowRaw = {
  id: string;
  title: string;
  project: string | null;
  createdAt: Date;
  type: MediaType;
  durationMs: number | null;
  /** The media asset's storage key, or null when the report has none. */
  key: string | null;
  /** The poster's storage key (videos only, and not every video has one). */
  posterKey: string | null;
};

export type BaseRow = {
  id: string;
  title: string;
  description: string | null;
  type: MediaType;
  pageUrl: string | null;
  project: string | null;
  t0: number;
  env: Record<string, unknown>;
  createdAt: Date;
};

export type OwnerRow = BaseRow & {
  shareToken: string | null;
  creator: { name: string | null; email: string; image: string | null } | null;
  assets: Asset[];
};
/** `workspaceId` is for reports.ts only (to scope the comment read); it is
 *  stripped before anything reaches a page. */
export type SharedRow = BaseRow & { workspaceId: string; assets: Asset[] };

export type CommentRaw = { id: string; body: string; at: Date; by: string | null };

export type NewReport = {
  id: string;
  workspaceId: string;
  createdBy: string;
  type: MediaType;
  title: string;
  description: string | null;
  pageUrl: string | null;
  project: string | null;
  t0: number;
  durationMs: number | null;
  env: Record<string, unknown>;
};
export type NewAsset = { kind: Kind; mimeType: string; storageKey: string };

/** What /complete may set besides the status, which the adapter flips itself. */
export type CompleteSet = {
  title?: string;
  description?: string | null;
  pageUrl?: string | null;
  project?: string | null;
  env?: Record<string, unknown>;
};

export type Usage = { plan: string; limit: number; videos: number; lastHour: number };
export type Workspace = { id: string; name: string };

export interface Store {
  health(): Promise<void>;
  /** Awaited by authParts() before authAdapter(): one-time setup that must
   *  finish before Better Auth is handed the adapter (Mongo: indexes). */
  init?(): Promise<void>;
  authAdapter(): BetterAuthOptions['database'];
  /** Extra Better Auth options this adapter needs (Mongo: string ids). auth.ts
   *  merges `advanced` into its own; Postgres has none. */
  authOptions?(): Pick<BetterAuthOptions, 'advanced'>;

  // reads
  listReports(ws: string, f: Filters & { after?: string; limit: number }): Promise<ListRowRaw[]>;
  getReport(ws: string, id: string): Promise<OwnerRow | null>;
  /** Ready only, explicit fields: no workspace, creator or token. */
  sharedReport(token: string): Promise<SharedRow | null>;
  /** Distinct sites among this workspace's ready reports, most used first, then A–Z. */
  projectsOf(ws: string): Promise<{ project: string; count: number }[]>;
  commentsOf(ws: string, reportId: string): Promise<CommentRaw[]>;
  usageOf(userId: string): Promise<Usage | null>;
  /** Storage keys of these reports' files. */
  assetKeys(ws: string, ids: string[]): Promise<string[]>;
  /** `undefined`: no such report. `null`: it exists with no live link. */
  getShareToken(ws: string, id: string): Promise<string | null | undefined>;
  /** Processing reports created before `olderThan`, across every workspace. */
  abandoned(olderThan: Date, batch: number): Promise<{ id: string; ws: string }[]>;

  // writes
  /** `email` arrives already lowercased (reports.ts); adapters match it exactly. */
  setPlan(email: string, plan: Plan, videos: number): Promise<boolean>;
  /** The report row, then its assets: two plain inserts, not a transaction. */
  insertReport(report: NewReport, assets: NewAsset[]): Promise<void>;
  /** Sets `ready` plus `set`, enforcing the creator's video cap atomically
   *  inside the adapter. An already-ready row passes (idempotent retry). */
  completeReport(ws: string, id: string, set: CompleteSet): Promise<boolean>;
  updateReport(ws: string, id: string, fields: { title?: string; description?: string | null }): Promise<boolean>;
  /** Rows only: the caller removed the objects first. Returns how many went. */
  deleteReports(ws: string, ids: string[]): Promise<number>;
  /** `null` if the report is not in this workspace. */
  addComment(ws: string, userId: string, reportId: string, body: string): Promise<CommentRaw | null>;
  /** Soft delete, and only the author's own. */
  deleteComment(ws: string, userId: string, commentId: string): Promise<boolean>;
  setShareToken(ws: string, id: string, token: string | null): Promise<boolean>;
  /** For adapters that keep a per-user ready-video counter: repair drift from a
   *  crash between two writes. Run by the cleanup job. Returns users repaired. */
  recountVideos?(): Promise<number>;

  // workspaces
  /** Session's active workspace if still a member, else the oldest membership. */
  workspaceOf(userId: string, active: string | null | undefined): Promise<string | null>;
  /** Every membership, oldest first. */
  workspacesOf(userId: string): Promise<Workspace[]>;
  ownedWorkspaces(userId: string): Promise<{ plan: string; owned: number } | null>;
}
