'use server';

import { z } from 'zod';
import { requireActor } from '@/lib/server/session';
import * as reports from '@/lib/server/reports';

// Server actions are public POST endpoints: every one re-derives the actor from
// the session and validates what it was sent. The workspace always comes from
// the session, never from the caller.

const Fields = z.object({
  title: z.string().trim().max(500).optional(),
  description: z.string().trim().max(20_000).nullable().optional(),
});

export async function saveNotes(id: string, fields: z.input<typeof Fields>) {
  const a = await requireActor();
  const f = Fields.parse(fields);
  if (!(await reports.updateReport(a.workspaceId, id, { ...f, description: f.description || null }))) {
    throw new Error('ReKod not found');
  }
}

export async function addComment(id: string, body: string) {
  const a = await requireActor();
  const text = z.string().trim().min(1).max(10_000).parse(body);
  const c = await reports.addComment(a.workspaceId, a.userId, id, text);
  if (!c) throw new Error('ReKod not found');
  return c;
}

export async function deleteComment(commentId: string) {
  const a = await requireActor();
  if (!(await reports.deleteComment(a.workspaceId, a.userId, commentId))) throw new Error('Comment not found');
}

export async function deleteReports(ids: string[]) {
  const a = await requireActor();
  return reports.deleteReports(a.workspaceId, z.array(z.string()).max(200).parse(ids));
}

export async function shareToken(id: string) {
  const a = await requireActor();
  const t = await reports.shareTokenFor(a.workspaceId, id);
  if (!t) throw new Error('ReKod not found');
  return t;
}

export async function revokeShare(id: string) {
  const a = await requireActor();
  await reports.revokeShare(a.workspaceId, id);
}
