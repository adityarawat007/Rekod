import { randomBytes, randomUUID } from 'node:crypto';

/** UUIDv7 (RFC 9562): 48-bit ms timestamp, then random. Time-ordered, so new
 *  rows land at the end of the primary-key index instead of all over it.
 *  ponytail: hand-rolled because node:crypto only has v4; swap for
 *  crypto.randomUUIDv7 if Node grows one. */
export function uuidv7(now = Date.now()): string {
  const b = randomBytes(16);
  b.writeUIntBE(now, 0, 6);
  b[6] = (b[6] & 0x0f) | 0x70;   // version 7
  b[8] = (b[8] & 0x3f) | 0x80;   // variant 10
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** A share token, and the credential itself: a v4 UUID, 122 random bits —
 *  the shape of the link (/c/<uuid>), never the report's own id, which is
 *  time-ordered and cannot be revoked. */
export const shareToken = () => randomUUID();
