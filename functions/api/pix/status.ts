// GET /api/pix/status?id=... — verifica se o PIX foi pago.
import { json, errorJson, type Env } from '../../../server/http';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return errorJson(503, 'Banco indisponível.');

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorJson(400, 'id é obrigatório.');

  // 1. Verifica no D1 (webhook pode já ter marcado)
  const row = await env.DB.prepare('SELECT status FROM purchases WHERE id = ?')
    .bind(id)
    .first<{ status: string }>();

  if (row?.status === 'PAID') return json({ paid: true });

  // 2. Consulta o Mercado Pago diretamente
  if (env.MERCADOPAGO_ACCESS_TOKEN) {
    const resp = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
      headers: { Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}` },
    });
    if (resp.ok) {
      const data = (await resp.json()) as { status: string };
      if (data.status === 'approved') {
        await env.DB.prepare('UPDATE purchases SET status = ? WHERE id = ?').bind('PAID', id).run();
        return json({ paid: true });
      }
    }
  }

  return json({ paid: false });
};
