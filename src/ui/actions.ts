// Ações reutilizadas por várias telas.
import type { Lead } from '../core/types';
import { diagnosisError, diagnosisFromFacts } from '../core/diagnosis';
import { hasOwnSite } from '../core/scoring';
import { api, ApiError, coletorApi } from '../data/api';
import { gosomToBusinesses } from '../core/providers/gosom';
import { mergeIntoLead, sameBusiness } from '../core/dedupe';
import { store } from '../data/store';

/** Executa o diagnóstico real via /api/diagnose e grava o resultado (inclusive falhas) no lead. */
export async function runDiagnosis(lead: Lead): Promise<{ ok: boolean; message: string }> {
  if (!lead.website || !hasOwnSite(lead)) return { ok: false, message: 'Lead sem site próprio para diagnosticar.' };
  if (lead.isDemo) return { ok: false, message: 'Sites de demonstração são fictícios e não podem ser acessados.' };
  try {
    const r = await api.diagnose(lead.website);
    const diagnosis = r.ok ? diagnosisFromFacts(r.facts) : diagnosisError(r.error);
    store.updateLead(lead.id, (l) => ({ diagnosis, status: l.status === 'novo' ? 'pesquisado' : l.status }));
    return r.ok ? { ok: true, message: 'Diagnóstico concluído.' } : { ok: false, message: r.error };
  } catch (e) {
    return { ok: false, message: e instanceof ApiError ? e.message : 'Falha inesperada no diagnóstico.' };
  }
}

/**
 * Traz foto e avaliações reais do Google Maps para UM lead (modo completo do coletor, via Docker).
 * Só preenche campos vazios do lead; nada é inventado. Devolve o motivo quando não dá.
 */
export async function enrichFromMaps(lead: Lead, onStatus?: (msg: string) => void): Promise<{ ok: boolean; message: string }> {
  if (lead.isDemo) return { ok: false, message: 'Lead de demonstração.' };
  try {
    const address = lead.address || [lead.city, lead.state].filter(Boolean).join(' ');
    onStatus?.('Buscando foto e avaliações no Google Maps (liga o Docker; ~2 min)…');
    const { id } = await coletorApi.place(lead.name.replace(/^\[DEMO\]\s*/, ''), address);
    const t0 = Date.now();
    while (Date.now() - t0 < 6 * 60_000) {
      await new Promise((r) => setTimeout(r, 4000));
      const job = await coletorApi.job(id);
      if (job.status === 'error') return { ok: false, message: job.error ?? 'Falha na coleta.' };
      if (job.status !== 'done') continue;
      const items = gosomToBusinesses(job.results ?? [], lead.name);
      const raw = items.find((b) => sameBusiness(lead, b)) ?? (items.length === 1 ? items[0] : undefined);
      if (!raw) return { ok: false, message: 'O Google Maps não devolveu esta empresa.' };
      store.updateLead(lead.id, (l) => mergeIntoLead(l, raw));
      const n = raw.reviews?.length ?? 0;
      return { ok: true, message: `Google Maps: ${raw.imageUrls?.length ?? 0} foto(s) e ${n} avaliação(ões) reais.` };
    }
    return { ok: false, message: 'Tempo esgotado na coleta do Google Maps.' };
  } catch (e) {
    return { ok: false, message: e instanceof ApiError ? e.message : 'Falha inesperada ao consultar o Google Maps.' };
  }
}
