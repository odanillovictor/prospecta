// GET /p/<id>/og.jpg — imagem de compartilhamento da prévia (aparece ao colar o link no WhatsApp).
import { PREVIEW_ID } from '../../../src/core/preview';
import type { Env } from '../../../server/http';

export const onRequestGet: PagesFunction<Env, 'id'> = async ({ params, env }) => {
  const id = String(params.id ?? '');
  if (!PREVIEW_ID.test(id) || !env.PREVIEWS) return new Response('Not found', { status: 404 });
  const { value, metadata } = await env.PREVIEWS.getWithMetadata<{ type?: string }>(`og:${id}`, 'arrayBuffer');
  if (!value) return new Response('Not found', { status: 404 });
  return new Response(value, { headers: { 'Content-Type': metadata?.type ?? 'image/jpeg', 'Cache-Control': 'public, max-age=3600' } });
};
