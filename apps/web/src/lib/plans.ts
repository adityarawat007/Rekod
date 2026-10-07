/** Plan defaults. setPlan() copies `videos` onto the user row, so changing a
 *  number here does not move people already on the plan. */
export const PLANS = {
  // `workspaces` counts owned ones, the personal one included; not copied to the row.
  free: { videos: 20, workspaces: 1 },
  pro: { videos: 200, workspaces: 10 },
} as const;
export type Plan = keyof typeof PLANS;
export const isPlan = (p: string): p is Plan => Object.hasOwn(PLANS, p);

/** Per user, every plan. Abuse limits, not product ones. */
export const LIMITS = {
  /** Creates per hour, finished or not: each one mints upload URLs. */
  createsPerHour: 30,
  /** Bytes per file. A signed Content-Length makes the bucket refuse more. */
  bytes: {
    // CAP_MS (3 min) × 600 kbps in offscreen.js ≈ 13.5 MB, ×2 for encoder
    // overshoot. Moves with those two.
    video: 32 * 2 ** 20,
    screenshot: 25 * 2 ** 20,
    poster: 1 * 2 ** 20,
    logs: 50 * 2 ** 20,
    network: 50 * 2 ** 20,
  },
  /** A `processing` report this old was abandoned; the cleanup job deletes it. */
  abandonedAfterMs: 24 * 3600e3,
} as const;
