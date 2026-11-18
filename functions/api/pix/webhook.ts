// POST /api/pix/webhook — recebe notificação do Mercado Pago quando o PIX é pago.
import { json, type Env } from '../../../server/http';

interface MPWebhook {
  type: string;
  data?: { id: string };
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ ok: false });

  try {
    const body = (await request.json()) as MPWebhook;
    if (body.type === 'payment' && body.data?.id) {
      // Consulta o status real para confirmar que é 'approved'
      if (env.MERCADOPAGO_ACCESS_TOKEN) {
        const resp = await fetch(`https://api.mercadopago.com/v1/payments/${body.data.id}`, {
          headers: { Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}` },
        });
        if (resp.ok) {
          const payment = (await resp.json()) as { status: string };
          if (payment.status === 'approved') {
            await env.DB.prepare('UPDATE purchases SET status = ? WHERE id = ?')
              .bind('PAID', body.data.id)
              .run();
          }
        }
      }
    }
  } catch {
    // MP reenvia se não receber 200
  }

  return json({ ok: true });
};
