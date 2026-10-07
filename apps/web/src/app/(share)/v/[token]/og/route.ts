import { shareImage } from '../../../og';

export async function GET(_req: Request, ctx: RouteContext<'/v/[token]/og'>) {
  return shareImage((await ctx.params).token);
}
