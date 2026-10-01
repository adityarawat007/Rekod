import 'server-only';
import { requireActor } from '@/lib/server/session';
import { listReports, type ReportType } from '@/lib/server/reports';
import type { ListRow } from '@/components/home/report-list';

export type Page = { rows: ListRow[]; next: string | null };
export type PageQuery = { q?: string; types: ReportType[]; after?: string };

/** One page of the grid, in the card's shape. The first page renders on the
 *  server; the rest come through the moreReports() action as you scroll. */
export async function reportPage({ q, types, after }: PageQuery): Promise<Page> {
  const { workspaceId } = await requireActor();
  const { rows, next } = await listReports(workspaceId, { q, types, after });
  return {
    next,
    rows: rows.map((r) => ({
      id: r.id, title: r.title, project: r.project, created_at: r.createdAt.toISOString(),
      shot: r.type === 'screenshot', preview: r.preview, durationMs: r.durationMs,
    })),
  };
}
