// Converte fatos coletados em um checklist explicando o que foi verificado, inferido ou depende de validação manual.
import type { DiagnosisCheck, SiteDiagnosis, SiteFacts } from './types';

export const SLOW_RESPONSE_MS = 2500;
export const HEAVY_HTML_BYTES = 1_500_000;

export function buildChecks(f: SiteFacts, now = new Date()): DiagnosisCheck[] {
  const c: DiagnosisCheck[] = [];
  const year = now.getFullYear();

  // ---- Verificações automatizadas (executadas de fato pelo servidor) ----
  c.push({
    id: 'https',
    label: 'HTTPS',
    origin: 'automatico',
    result: f.https ? 'ok' : 'problema',
    detail: f.https ? `Endereço final usa HTTPS (${f.finalUrl}).` : `Endereço final sem HTTPS (${f.finalUrl}). Navegadores marcam como "não seguro".`,
    priority: 1,
  });
  c.push({
    id: 'status',
    label: 'Site no ar',
    origin: 'automatico',
    result: f.httpStatus >= 200 && f.httpStatus < 400 ? 'ok' : 'problema',
    detail: `Resposta HTTP ${f.httpStatus}${f.redirects ? ` após ${f.redirects} redirecionamento(s)` : ''}.`,
    priority: 1,
  });
  c.push({
    id: 'viewport',
    label: 'Preparado para celular (meta viewport)',
    origin: 'automatico',
    result: f.hasViewport ? 'ok' : 'problema',
    detail: f.hasViewport
      ? 'Possui meta viewport. Isso não garante boa experiência no celular — ver item manual.'
      : 'Sem meta viewport: o site tende a aparecer "miniaturizado" no celular.',
    priority: 1,
  });
  if (f.pagespeed) {
    const p = f.pagespeed.performance;
    c.push({
      id: 'velocidade',
      label: 'Velocidade (PageSpeed mobile)',
      origin: 'automatico',
      result: p >= 70 ? 'ok' : p >= 50 ? 'atencao' : 'problema',
      detail: `Nota de performance mobile ${p}/100${f.pagespeed.lcpMs ? `, LCP ${(f.pagespeed.lcpMs / 1000).toFixed(1)}s` : ''} (Google PageSpeed Insights).`,
      priority: 1,
    });
  } else {
    const slow = f.responseMs > SLOW_RESPONSE_MS;
    const heavy = f.htmlBytes > HEAVY_HTML_BYTES;
    c.push({
      id: 'velocidade',
      label: 'Velocidade (resposta do servidor)',
      origin: 'automatico',
      result: slow || heavy ? 'atencao' : 'ok',
      detail:
        `Servidor respondeu em ${f.responseMs} ms; HTML com ${(f.htmlBytes / 1024).toFixed(0)} KB. ` +
        'Medição aproximada feita a partir da Cloudflare — não mede imagens nem renderização. Configure PAGESPEED_API_KEY para nota real.',
      priority: 2,
    });
  }
  c.push({
    id: 'title',
    label: 'Title da página',
    origin: 'automatico',
    result: !f.title ? 'problema' : f.title.length < 15 || f.title.length > 70 ? 'atencao' : 'ok',
    detail: f.title ? `"${f.title}" (${f.title.length} caracteres).` : 'Sem <title>: prejudica Google e compartilhamentos.',
    priority: 2,
  });
  c.push({
    id: 'description',
    label: 'Meta description',
    origin: 'automatico',
    result: f.metaDescription ? 'ok' : 'problema',
    detail: f.metaDescription ? `"${f.metaDescription.slice(0, 160)}"` : 'Sem meta description: o Google improvisa o texto do resultado.',
    priority: 2,
  });
  c.push({
    id: 'headings',
    label: 'Estrutura de headings',
    origin: 'automatico',
    result: f.h1.length === 1 ? 'ok' : f.h1.length === 0 ? 'problema' : 'atencao',
    detail:
      f.h1.length === 0
        ? `Nenhum H1 encontrado (${f.h2Count} H2).`
        : `${f.h1.length} H1 (${f.h1.slice(0, 2).map((h) => `"${h.slice(0, 60)}"`).join(', ')}), ${f.h2Count} H2.`,
    priority: 3,
  });
  c.push({
    id: 'whatsapp',
    label: 'Botão/link de WhatsApp',
    origin: 'automatico',
    result: f.hasWhatsAppLink ? 'ok' : 'problema',
    detail: f.hasWhatsAppLink ? 'Encontrado link para WhatsApp.' : 'Nenhum link wa.me/api.whatsapp encontrado no HTML inicial.',
    priority: 1,
  });
  const contactVisible = f.hasTelLink || f.hasWhatsAppLink || f.phonesInText > 0 || f.hasMailto;
  c.push({
    id: 'contato',
    label: 'Contato visível',
    origin: 'automatico',
    result: contactVisible ? (f.hasTelLink || f.hasWhatsAppLink ? 'ok' : 'atencao') : 'problema',
    detail: `Link tel: ${f.hasTelLink ? 'sim' : 'não'} · WhatsApp: ${f.hasWhatsAppLink ? 'sim' : 'não'} · telefones no texto: ${f.phonesInText} · e-mail: ${f.hasMailto ? 'sim' : 'não'}.`,
    priority: 1,
  });
  c.push({
    id: 'formulario',
    label: 'Formulário',
    origin: 'automatico',
    result: f.formCount > 0 ? 'ok' : 'atencao',
    detail: f.formCount > 0 ? `${f.formCount} formulário(s) no HTML.` : 'Nenhum <form> no HTML inicial (pode ser carregado via script).',
    priority: 3,
  });
  c.push({
    id: 'seo_local',
    label: 'Dados estruturados de negócio local',
    origin: 'automatico',
    result: f.hasSchemaLocalBusiness ? 'ok' : 'atencao',
    detail: f.hasSchemaLocalBusiness ? 'Schema.org de negócio encontrado.' : 'Sem schema.org LocalBusiness: oportunidade de SEO local.',
    priority: 3,
  });

  // ---- Inferências de baixa confiança (heurísticas sobre o texto) ----
  c.push({
    id: 'cta',
    label: 'Chamadas para ação',
    origin: 'inferido',
    result: f.ctaKeywords.length >= 2 || f.hasWhatsAppLink ? 'ok' : f.ctaKeywords.length === 1 ? 'atencao' : 'problema',
    detail: f.ctaKeywords.length ? `Termos de ação encontrados: ${f.ctaKeywords.slice(0, 5).join(', ')}.` : 'Nenhum termo de ação típico ("agende", "orçamento", "fale conosco"...).',
    priority: 1,
  });
  const offerClear = f.h1.some((h) => h.split(' ').length >= 3) && !!f.metaDescription;
  c.push({
    id: 'oferta',
    label: 'Clareza da oferta',
    origin: 'inferido',
    result: offerClear ? 'ok' : 'atencao',
    detail: offerClear
      ? 'Há um título principal descritivo e descrição. Confirme se diz o que faz, para quem e onde.'
      : 'Título principal ausente ou genérico — provável que a oferta não fique clara nos primeiros segundos.',
    priority: 1,
  });
  c.push({
    id: 'prova_social',
    label: 'Provas sociais',
    origin: 'inferido',
    result: f.socialProofKeywords.length ? 'ok' : 'atencao',
    detail: f.socialProofKeywords.length ? `Indícios: ${f.socialProofKeywords.slice(0, 4).join(', ')}.` : 'Nenhum indício de depoimentos/avaliações no texto.',
    priority: 2,
  });
  c.push({
    id: 'info_local',
    label: 'Informações locais',
    origin: 'inferido',
    result: f.localInfoKeywords.length >= 2 ? 'ok' : 'atencao',
    detail: f.localInfoKeywords.length ? `Indícios: ${f.localInfoKeywords.slice(0, 4).join(', ')}.` : 'Sem endereço/mapa/horário identificáveis.',
    priority: 2,
  });
  const outdatedReasons: string[] = [];
  if (f.copyrightYear && f.copyrightYear < year - 2) outdatedReasons.push(`rodapé © ${f.copyrightYear}`);
  if (!f.hasViewport) outdatedReasons.push('sem viewport');
  if (f.usesTablesForLayout) outdatedReasons.push('layout em tabelas');
  if (f.usesFlash) outdatedReasons.push('usa Flash');
  c.push({
    id: 'desatualizado',
    label: 'Aparência de site desatualizado',
    origin: 'inferido',
    result: outdatedReasons.length >= 2 ? 'problema' : outdatedReasons.length === 1 ? 'atencao' : 'ok',
    detail: outdatedReasons.length ? `Sinais: ${outdatedReasons.join(', ')}.` : 'Nenhum sinal técnico óbvio de site antigo.',
    priority: 2,
  });

  // ---- Itens que exigem validação manual ----
  const manual: Array<[string, string, string]> = [
    ['mobile_real', 'Experiência real no celular', 'Abra no celular: textos legíveis, botões tocáveis, nada cortado.'],
    ['credibilidade', 'Credibilidade visual', 'Fotos reais, identidade visual, CNPJ/endereço, aparência profissional.'],
    ['avaliacoes', 'Avaliações no Google', 'Confira nota, volume e respostas no Perfil da Empresa.'],
  ];
  for (const [id, label, detail] of manual) {
    c.push({ id, label, origin: 'manual', result: 'nao_verificado', detail, priority: 3 });
  }
  return c;
}

export function diagnosisFromFacts(facts: SiteFacts, now = new Date()): SiteDiagnosis {
  return { ranAt: now.toISOString(), ok: true, facts, checks: buildChecks(facts, now) };
}

export function diagnosisError(message: string, now = new Date()): SiteDiagnosis {
  return { ranAt: now.toISOString(), ok: false, error: message, checks: [] };
}

export function checkById(d: SiteDiagnosis | undefined, id: string): DiagnosisCheck | undefined {
  return d?.checks.find((c) => c.id === id);
}
