// GET /api/stock?seg=odonto — fotos ilustrativas do segmento (Openverse), com cache de 7 dias.
// GET /api/stock?q=dog+grooming — foto para UM serviço: Pixabay (PIXABAY_API_KEY) ou Pexels (PEXELS_API_KEY); sem chave, Openverse filtrado.
import { searchServiceStock, searchStock } from '../../src/core/providers/openverse';
import { searchPexels } from '../../src/core/providers/pexels';
import { searchPixabay } from '../../src/core/providers/pixabay';
import { searchWikimedia } from '../../src/core/providers/wikimedia';
import { STOCK_QUERIES } from '../../src/core/site/variation';
import { cleanStockQuery } from '../../src/core/site/serviceImages';
import { type Env, cached, errorJson, fetchWithTimeout, json, logError, userAgent } from '../../server/http';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const params = new URL(request.url).searchParams;
  const fetchFn = ((input: RequestInfo | URL, init?: RequestInit) => fetchWithTimeout(String(input), init as RequestInit, 12_000)) as typeof fetch;
  if (params.has('q')) {
    const q = cleanStockQuery(params.get('q'));
    if (!q) return errorJson(400, 'Consulta inválida.');
    const pixabay = env.PIXABAY_API_KEY?.trim();
    const key = env.PEXELS_API_KEY?.trim();
    const provider = pixabay ? 'pixabay' : key ? 'pexels' : 'free';
    let note: string | undefined;
    try {
      // Links do Pixabay expiram em 24 h: cache curto. Os demais valem por 7 dias.
      const { value } = await cached(`stockq|${provider}|${q}|v10`, provider === 'pixabay' ? 60 * 60 * 12 : 60 * 60 * 24 * 7, async () => {
        if (pixabay) {
          try {
            const pb = await searchPixabay(q, pixabay, fetchFn);
            if (pb.length) return pb;
          } catch (err) {
            note = err instanceof Error ? err.message.slice(0, 160) : 'falha';
            logError('stock-pixabay', err, env);
            // Recusa passageira (429/5xx): não cai no Openverse (fotos piores); o app tenta de novo.
            if (/HTTP (429|5\d\d)/.test(note)) throw err;
          }
        }
        if (key) {
          try {
            const px = await searchPexels(q, key, fetchFn);
            if (px.length) return px;
          } catch (err) {
            logError('stock-pexels', err, env);
          }
        }
        // Sem chave (ou chave sem resultado): Wikimedia Commons (grátis, sem chave), depois Openverse.
        try {
          const wm = await searchWikimedia(q, fetchFn, userAgent(env));
          if (wm.length) return wm;
        } catch (err) {
          logError('stock-wikimedia', err, env);
        }
        const ov = await searchServiceStock(q, fetchFn, userAgent(env));
        // Lista vazia não vai para o cache (falha passageira não pode travar o serviço sem foto por horas).
        if (!ov.length) throw new Error('sem fotos');
        return ov;
      });
      return json({ photos: value, provider });
    } catch (err) {
      logError('stock', err, env);
      return json({ photos: [], note });
    }
  }
  const seg = params.get('seg') ?? 'generico';
  const queries = STOCK_QUERIES[seg];
  if (!queries) return errorJson(400, 'Segmento desconhecido.');
  try {
    const { value } = await cached(`stock|${seg}|v3`, 60 * 60 * 24 * 7, () => searchStock(queries, fetchFn, userAgent(env)));
    return json({ photos: value });
  } catch (err) {
    logError('stock', err, env);
    return json({ photos: [] });
  }
};
