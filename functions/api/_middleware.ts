// Middleware de /api/*: autenticação Clerk, cabeçalhos de segurança e tratamento de erros.
import { type Env, HttpError, errorJson, logError } from '../../server/http';
import { verifyClerkToken } from '../../server/auth';

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });

  const user = await verifyClerkToken(request, env);
  if (user === null) return errorJson(401, 'Autenticação necessária.', 'unauthorized');

  const modifiedHeaders = new Headers(request.headers);
  modifiedHeaders.set('x-clerk-id', user.clerkId);
  if (user.isAdmin) modifiedHeaders.set('x-clerk-admin', '1');
  const modifiedRequest = new Request(request, { headers: modifiedHeaders });

  try {
    const res = await ctx.next(modifiedRequest);
    const out = new Response(res.body, res);
    out.headers.set('X-Content-Type-Options', 'nosniff');
    out.headers.set('Referrer-Policy', 'no-referrer');
    return out;
  } catch (err) {
    if (err instanceof HttpError) return errorJson(err.status, err.message);
    logError('api', err, env);
    return errorJson(500, 'Erro interno. Veja os logs da Function.');
  }
};
