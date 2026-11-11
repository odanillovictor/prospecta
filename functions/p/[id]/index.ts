// GET /p/<id> — página pública da prévia de um site gerado.
import { PREVIEW_ID } from '../../../src/core/preview';
import { SITE_JS_HASH } from '../../../src/core/site/siteJsHash';
import type { Env } from '../../../server/http';

const notFound = () =>
  new Response('<!doctype html><meta charset="utf-8"><title>Prévia não encontrada</title><p style="font-family:system-ui;padding:40px">Esta prévia não existe ou expirou.</p>', {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });

export const onRequestGet: PagesFunction<Env, 'id'> = async ({ params, env }) => {
  const id = String(params.id ?? '');
  if (!PREVIEW_ID.test(id) || !env.PREVIEWS) return notFound();
  const html = await env.PREVIEWS.get(`p:${id}`);
  if (!html) return notFound();
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
      // Prévia: não indexar no Google. Só o script do gerador roda (hash), fontes do Google e mapa do OSM.
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': `default-src 'none'; script-src 'sha256-${SITE_JS_HASH}'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; frame-src https://www.google.com; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`,
    },
  });
};
