'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Maximize, Minimize, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { clock, stamp, trackPct } from '@/lib/format';
import { isError, isNet, isWarn, netFailed, type TimelineEntry } from '@/lib/types';
import { cn } from '@/lib/utils';

export type Media = { url: string; kind: 'video' | 'shot' };

/** Shared by the player and the log pane: a log row seeks the video. */
export function usePlayhead() {
  const video = useRef<HTMLVideoElement>(null);
  const [now, setNow] = useState(0);
  const [dur, setDur] = useState(0);

  const seekTo = (s: number) => {
    if (video.current) video.current.currentTime = Math.max(0, s);
  };
  const playFrom = (s: number) => {
    seekTo(s);
    void video.current?.play();
  };
  return { video, now, setNow, dur, setDur, seekTo, playFrom };
}

type Playhead = ReturnType<typeof usePlayhead>;

export function ReportPlayer({
  media,
  playhead,
  entries,
  offsetOf,
  span,
}: {
  media: Media | null;
  playhead: Playhead;
  entries: TimelineEntry[];
  offsetOf: (e: TimelineEntry) => number;
  span: { lo: number; hi: number };
}) {
  const { video, now, setNow, dur, setDur, seekTo, playFrom } = playhead;
  const [ready, setReady] = useState(false);
  const [broken, setBroken] = useState(false);
  const [playing, setPlaying] = useState(false);
  // Recordings are silent (AUDIO in extension/offscreen.js); a mute control
  // comes back with sound.
  const muted = false;

  // True mid-probe, while currentTime is 1e101 and must not reach `now`.
  const probing = useRef(false);

  /** The extension's webm has no duration in its header, so Chrome reports
   *  Infinity. Seeking past the end makes it compute one; durationchange then
   *  rewinds. Fixed here, not in the extension, so old recordings play too. */
  const onMeta = (v: HTMLVideoElement) => {
    if (Number.isFinite(v.duration) && v.duration > 0) return setDur(v.duration);
    if (probing.current) return; // one probe, or a file with no duration loops
    probing.current = true;
    v.currentTime = 1e101;
  };

  const onDurationChange = (v: HTMLVideoElement) => {
    if (!Number.isFinite(v.duration) || v.duration <= 0) return;
    setDur(v.duration);
    if (probing.current) {
      probing.current = false;
      v.currentTime = 0;
    }
  };

  /** "Fullscreen" restyles this same <video> as a fixed overlay. A second
   *  player in a dialog would start at 0:00 with an empty buffer. */
  const stage = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);

  useEffect(() => {
    if (!full) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false);
    document.addEventListener('keydown', key);
    const { overflow } = document.documentElement.style;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', key);
      document.documentElement.style.overflow = overflow;
    };
  }, [full]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  };

  const pct = (s: number) => trackPct(s, span.lo, span.hi);
  // Failures only: every request would turn the track into a barcode.
  const ticks = entries.filter((e) => isError(e) || isWarn(e) || (isNet(e) && netFailed(e)));

  return (
    <div
      ref={stage}
      role={full ? 'dialog' : undefined}
      aria-modal={full || undefined}
      aria-label={full ? 'Rekod' : undefined}
      onClick={full ? (e) => e.target === stage.current && setFull(false) : undefined}
      className={cn(
        'flex shrink-0 flex-col overflow-hidden rounded-2xl bg-zinc-950 ring-1 ring-black/5',
        full && 'fixed inset-0 z-50 rounded-none p-4 md:p-8',
      )}
    >
      <div
        onDoubleClick={media ? () => setFull((v) => !v) : undefined}
        className={cn('group/stage relative', full ? 'min-h-0 flex-1' : 'aspect-video')}
      >
        {!media ? (
          <div className="grid size-full place-items-center text-sm text-zinc-400">
            No media on this Rekod
          </div>
        ) : media.kind === 'shot' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.url}
            alt="Screenshot of the reported page"
            className="size-full object-contain"
            onLoad={() => setReady(true)}
            onError={() => setBroken(true)}
          />
        ) : (
          <video
            ref={video}
            src={media.url}
            playsInline
            muted={muted}
            preload="metadata"
            // The second click of a double-click is the fullscreen gesture.
            onClick={(e) => e.detail === 1 && toggle()}
            className="size-full cursor-pointer object-contain"
            onTimeUpdate={(e) => {
              if (!probing.current) setNow(e.currentTarget.currentTime);
            }}
            onLoadedMetadata={(e) => onMeta(e.currentTarget)}
            onDurationChange={(e) => onDurationChange(e.currentTarget)}
            onLoadedData={() => setReady(true)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onError={() => setBroken(true)}
          />
        )}

        {media && !ready && !broken && (
          <div className="absolute inset-0 animate-pulse bg-white/5" aria-hidden />
        )}

        {media && (
          <Button
            size="icon-sm"
            onClick={() => setFull((v) => !v)}
            aria-label={full ? 'Close the large player' : 'Open the large player'}
            title={full ? 'Close (Esc)' : 'Expand — or double-click the picture'}
            className="absolute right-3 top-3 z-20 border-0 bg-black/60 text-white backdrop-blur transition-opacity hover:bg-black/80 focus-visible:opacity-100 md:opacity-0 md:group-hover/stage:opacity-100"
          >
            {full ? <Minimize /> : <Maximize />}
          </Button>
        )}

        {broken && (
          <div className="absolute inset-0 grid place-content-center justify-items-center gap-2 bg-zinc-950 p-6 text-center text-white">
            <AlertTriangle className="size-5 text-warn" aria-hidden />
            <p className="text-sm font-medium">This Rekod would not load</p>
            <p className="max-w-xs text-xs text-zinc-400">
              Media links are signed for an hour. Reload the page for a fresh one — the log is
              unaffected.
            </p>
            <Button size="sm" variant="secondary" onClick={() => location.reload()}>
              Reload
            </Button>
          </div>
        )}
      </div>

      {/* Not native controls: those scrub the video only, while this track
          spans the pre-roll too. */}
      {media?.kind === 'video' && (
        <div className="flex shrink-0 items-center gap-3 px-3 py-2.5 text-white">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={toggle}
            disabled={broken}
            aria-label={playing ? 'Pause' : 'Play'}
            className="text-white hover:bg-white/10 hover:text-white"
          >
            {playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
          </Button>
          <span className="mono shrink-0 text-xs text-white/90">{clock(now)}</span>

          <div className="relative h-6 flex-1">
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/15" />
            <div
              className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/60"
              style={{ left: `${pct(0)}%`, width: `${Math.max(0, pct(now) - pct(0))}%` }}
            />

            {/* A real range input for keyboard and drag; the dot below is its thumb. */}
            <input
              type="range"
              className="peer absolute inset-0 w-full cursor-pointer appearance-none bg-transparent opacity-0"
              min={span.lo}
              max={span.hi}
              step={0.05}
              value={now}
              disabled={broken}
              onChange={(e) => seekTo(Number(e.target.value))}
              aria-label="Seek"
              aria-valuetext={clock(now)}
            />

            {ticks.map((e) => (
              <button
                key={e.uid}
                onClick={() => playFrom(offsetOf(e))}
                aria-label={`Jump to ${stamp(offsetOf(e))}`}
                className="absolute top-1/2 h-3 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-crit ring-2 ring-zinc-950"
                style={{ left: `${pct(offsetOf(e))}%` }}
              />
            ))}

            <div
              className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow peer-focus-visible:ring-2 peer-focus-visible:ring-white/50"
              style={{ left: `${pct(now)}%` }}
              aria-hidden
            />
          </div>

          <span className="mono shrink-0 text-xs text-white/60">{dur ? clock(dur) : '—:—'}</span>
        </div>
      )}
    </div>
  );
}
