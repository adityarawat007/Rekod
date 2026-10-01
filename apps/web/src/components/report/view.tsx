'use client';

import { useMemo, useState } from 'react';
import { PanelRightOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReportPlayer, usePlayhead, type Media } from '@/components/report/player';
import { DevtoolsPane, type ReportInfo } from '@/components/report/devtools-pane';
import { offset } from '@/lib/format';
import { isError, isNet, isWarn, netFailed, type Entry, type Env, type TimelineEntry } from '@/lib/types';
import { PanelFrame } from '@/components/shell/panel-frame';
import { cn } from '@/lib/utils';

type Props = {
  entries: TimelineEntry[];
  t0: number;
  env: Env;
  media: Media | null;
  info: ReportInfo;
  /** False on a "video only" share link (?view=media): no log pane at all. */
  showLog?: boolean;
  /** The bar above the player. */
  toolbar: React.ReactNode;
  /** Under the player: editable on the owner's page, flat on a share link. */
  children?: React.ReactNode;
};

/** Below xl the columns stack and the page scrolls as one, hence the
 *  xl:-prefixed height rules. */
export function ReportView({ entries, t0, env, media, info, showLog = true, toolbar, children }: Props) {
  const playhead = usePlayhead();
  const [devtools, setDevtools] = useState(true);
  const pane = showLog && devtools;
  const failed = entries.some((e) => isError(e) || isWarn(e) || (isNet(e) && netFailed(e)));
  const offsetOf = (e: Entry) => offset(e.t, t0);
  const seek = (e: Entry) => playhead.playFrom(offsetOf(e));

  // The track spans the pre-roll buffer (negative offsets) too.
  const span = useMemo(() => {
    const offs = entries.map((e) => offset(e.t, t0));
    return { lo: Math.min(0, ...offs), hi: Math.max(1, playhead.dur, ...offs) };
  }, [entries, t0, playhead.dur]);

  return (
    <PanelFrame className="xl:flex-row">
      <section className="flex min-w-0 flex-1 flex-col xl:min-h-0">
        <header className="flex h-16 shrink-0 items-center gap-1.5 border-b px-3 sm:px-4">
          {toolbar}
          {showLog && !devtools ? (
            // A closed pane must not hide that the page failed: the dot stays.
            <Button variant="outline" size="icon" className="relative" aria-label="Open DevTools" onClick={() => setDevtools(true)}>
              <PanelRightOpen />
              {failed ? (
                <i className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-crit ring-2 ring-background" aria-label="has errors" role="img" />
              ) : null}
            </Button>
          ) : null}
        </header>
        <div className="xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
          <div className={cn('mx-auto w-full space-y-6 p-4 sm:p-6', pane ? 'max-w-5xl' : 'max-w-4xl')}>
            <ReportPlayer media={media} playhead={playhead} entries={entries} offsetOf={offsetOf} span={span} />
            {children}
          </div>
        </div>
      </section>

      {pane && (
        // Stacked, it needs a definite height or it grows to the log's length.
        <aside className="flex h-[80svh] min-w-0 flex-col border-t xl:h-auto xl:w-[min(44%,720px)] xl:shrink-0 xl:border-l xl:border-t-0">
          <DevtoolsPane
            entries={entries}
            env={env}
            info={info}
            dur={playhead.dur}
            offsetOf={offsetOf}
            onSeek={seek}
            onClose={() => setDevtools(false)}
          />
        </aside>
      )}
    </PanelFrame>
  );
}
