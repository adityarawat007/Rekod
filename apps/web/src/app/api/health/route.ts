import { health } from '@/lib/server/health';

export async function GET() {
  try {
    return Response.json(await health());
  } catch (e) {
    // Public route: log the cause, never echo it (it names the DB host).
    console.error('health:', e);
    return Response.json({ ok: false }, { status: 503 });
  }
}
