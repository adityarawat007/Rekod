import { auth } from '@/lib/server/auth';

// Built on first request, not at import — see lib/env.ts.
export const GET = (req: Request) => auth().handler(req);
export const POST = (req: Request) => auth().handler(req);
