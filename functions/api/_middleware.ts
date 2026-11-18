// Middleware de /api/*: autenticação Clerk, cabeçalhos de segurança e tratamento de erros.
import { type Env, HttpError, errorJson, logError } from '../../server/http';
import { verifyClerkToken } from '../../server/auth';
import { ensureUser } from '../../server/quota';

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });

  // Rotas PIX são públicas (checkout de não-autenticados)
  const url = new URL(request.url);
  const isPublic = url.pathname.startsWith('/api/pix/');

  let next: Request = request;
  if (!isPublic) {
    const user = await verifyClerkToken(request, env);
    if (user === null) return errorJson(401, 'Autenticação necessária.', 'unauthorized');
    // Só e-mails com assinatura ativa (ou admin) usam a API; /api/me responde para o app mostrar o aviso.
    if (!user.isAdmin && url.pathname !== '/api/me') {
      try {
        const { active } = await ensureUser(env.DB!, user.clerkId, user.email);
        if (!active) return errorJson(403, 'Assinatura inativa.', 'inactive');
      } catch (err) {
        logError('api', err, env);
        return errorJson(500, 'Erro ao verificar acesso.');
      }
    }
    const h = new Headers(request.headers);
    h.delete('x-clerk-admin'); // prevent header spoofing
    h.set('x-clerk-id', user.clerkId);
    h.set('x-clerk-email', user.email);
    if (user.isAdmin) h.set('x-clerk-admin', '1');
    next = new Request(request, { headers: h });
  }

  try {
    const res = await ctx.next(next);
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
