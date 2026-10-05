'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { auth } from '@/lib/server/auth';
import { requireActor } from '@/lib/server/session';
import * as reports from '@/lib/server/reports';
import { reportPage, type PageQuery } from '@/app/(dash)/rekod/rows';
import { createWorkspace as create } from '@/lib/server/workspaces';

// Server actions are public POST endpoints: each re-derives the actor from the
// session and validates its input. The workspace never comes from the caller.

const Fields = z.object({
  title: z.string().trim().max(500).optional(),
  description: z.string().trim().max(20_000).nullable().optional(),
});

export async function saveNotes(id: string, fields: z.input<typeof Fields>) {
  const a = await requireActor();
  const f = Fields.parse(fields);
  if (!(await reports.updateReport(a.workspaceId, id, { ...f, description: f.description || null }))) {
    throw new Error('Rekod not found');
  }
}

export async function addComment(id: string, body: string) {
  const a = await requireActor();
  const text = z.string().trim().min(1).max(10_000).parse(body);
  const c = await reports.addComment(a.workspaceId, a.userId, id, text);
  if (!c) throw new Error('Rekod not found');
  return c;
}

export async function deleteComment(commentId: string) {
  const a = await requireActor();
  if (!(await reports.deleteComment(a.workspaceId, a.userId, commentId))) throw new Error('Comment not found');
}

const More = z.object({
  q: z.string().max(500).optional(),
  types: z.array(z.enum(reports.REPORT_TYPES)).max(reports.REPORT_TYPES.length),
  after: z.string().uuid(),
});

/** The next page of the grid; the workspace is the session's, as everywhere. */
export async function moreReports(query: PageQuery) {
  return reportPage(More.parse(query));
}

export async function deleteReports(ids: string[]) {
  const a = await requireActor();
  return reports.deleteReports(a.workspaceId, z.array(z.string()).max(200).parse(ids));
}

export async function shareToken(id: string) {
  const a = await requireActor();
  const t = await reports.shareTokenFor(a.workspaceId, id);
  if (!t) throw new Error('Rekod not found');
  return t;
}

export async function revokeShare(id: string) {
  const a = await requireActor();
  await reports.revokeShare(a.workspaceId, id);
}

/** Better Auth checks membership, and workspaceOf() re-checks per request.
 *  The caller must router.refresh(): the new cookie reaches cookies() in this
 *  round trip but not headers(), which getSession() reads. */
export async function switchWorkspace(id: string) {
  await requireActor();
  await auth().api.setActiveOrganization({ headers: await headers(), body: { organizationId: z.string().min(1).parse(id) } });
}

/** A refusal is returned as data with a `message` for people. */
export async function createWorkspace(name: string) {
  const a = await requireActor();
  const r = await create(a.userId, z.string().trim().min(1).max(80).parse(name));
  if ('refused' in r) return r;
  await switchWorkspace(r.id);
  return { id: r.id };
}
