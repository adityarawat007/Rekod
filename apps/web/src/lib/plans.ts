/**
 * What each plan allows. A user's own limit lives on the user row
 * (`video_limit`), so one person can be given more by hand without a new plan;
 * setPlan() copies the plan's number there. Changing a number here does not
 * move people already on the plan — that is one UPDATE, on purpose.
 */
export const PLANS = {
  free: { videos: 20 },
  pro: { videos: 200 },
} as const;
export type Plan = keyof typeof PLANS;
export const isPlan = (p: string): p is Plan => Object.hasOwn(PLANS, p);

/** Per user, every plan. Abuse limits, not product ones. */
export const LIMITS = {
  /** Creates per hour, finished or not: each one mints upload URLs. */
  createsPerHour: 30,
  /** Bytes per file. A signed Content-Length makes the bucket refuse more. */
  bytes: {
    // CAP_MS (3 min) × videoBitsPerSecond (600 kbps) in offscreen.js ≈ 13.5 MB;
    // ×2 for encoder overshoot on busy screens (and room for audio, if it
    // comes back). Change those two and this moves with them.
    video: 32 * 2 ** 20,
    screenshot: 25 * 2 ** 20,
    logs: 50 * 2 ** 20,
    network: 50 * 2 ** 20,
  },
  /** A `processing` report this old was abandoned; the cleanup job deletes it. */
  abandonedAfterMs: 24 * 3600e3,
} as const;
