// POST /api/pix/create — cria cobrança PIX via Mercado Pago.
import { json, errorJson, readJson, type Env } from '../../../server/http';

const AMOUNT = 59.90; // R$ 59,90
const AMOUNT_CENTS = 5990;

interface CreateBody {
  name: string;
  email: string;
  phone?: string;
}

interface MPPayment {
  id: number;
  point_of_interaction: {
    transaction_data: {
      qr_code: string;
      qr_code_base64: string;
    };
  };
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MERCADOPAGO_ACCESS_TOKEN) return errorJson(503, 'Pagamento ainda não configurado.');
  if (!env.DB) return errorJson(503, 'Banco indisponível.');

  const body = (await readJson(request)) as CreateBody;
  if (!body.email?.trim()) {
    return errorJson(400, 'E-mail é obrigatório.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return errorJson(400, 'E-mail inválido.');
  }

  const resolvedName = body.name?.trim() || body.email.split('@')[0];
  const nameParts = resolvedName.split(' ');
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ') || firstName;

  const origin = new URL(request.url).origin;
  const resp = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN.trim()}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({
      transaction_amount: AMOUNT,
      description: 'SiteSales — assinatura mensal',
      payment_method_id: 'pix',
      notification_url: `${origin}/api/pix/webhook`,
      payer: {
        email: body.email.trim(),
        first_name: firstName,
        last_name: lastName,
      },
    }),
  });

  if (!resp.ok) {
    console.error(`[pix/create] MercadoPago ${resp.status}: ${await resp.text()}`);
    return errorJson(502, 'Erro ao gerar QR Code. Tente novamente.');
  }

  const data = (await resp.json()) as MPPayment;
  const id = String(data.id);
  const txData = data.point_of_interaction.transaction_data;

  await env.DB.prepare(
    'INSERT INTO purchases (id, email, name, phone, status, amount) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(id, body.email.trim().toLowerCase(), resolvedName, body.phone ?? '', 'PENDING', AMOUNT_CENTS)
    .run();

  return json({
    id,
    qrCodeImage: `data:image/png;base64,${txData.qr_code_base64}`,
    brCode: txData.qr_code,
    amount: AMOUNT_CENTS,
  });
};
