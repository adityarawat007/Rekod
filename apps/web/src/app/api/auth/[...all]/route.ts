import { auth } from '@/lib/server/auth';

// Built on first request, not at import — see lib/env.ts.
export const GET = async (req: Request) => (await auth()).handler(req);
export const POST = async (req: Request) => (await auth()).handler(req);
