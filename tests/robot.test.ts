import { describe, expect, it } from 'vitest';
import type { Lead, RobotSettings } from '../src/core/types';
import { leadFromRaw } from '../src/core/dedupe';
import { canSendNow, isOptOut, sentToday, withinSendWindow } from '../src/core/robot/guards';
import { composeText, newMessage, newRobot, nextStep } from '../src/core/robot/strategy';
import { buildAgentRequest, parseAgentResponse } from '../src/core/robot/agent';

const src = { provider: 'osm' as const, externalId: 'n/1', collectedAt: '2026-01-01T00:00:00Z' };
const seller = { name: 'Danillo Victor', company: 'Terreno Digital' };
const S: RobotSettings = { mode: 'approve', dailyLimit: 2, startHour: 9, endHour: 18, weekdaysOnly: true, minGapSec: 90, dryRun: false, paused: false, serviceUrl: '', agentUrl: '', offerText: '', priceText: '', meetingText: '' };
// Quarta-feira, 10h (horário local)
const WED_10 = new Date(2026, 9, 28, 10, 0, 0);
const mk = (over: Partial<Lead> = {}): Lead => ({ ...leadFromRaw({ name: 'Studio Aurora', city: 'Curitiba', phone: '5541999998888', source: src }, 'salão de beleza'), ...over });

describe('robô: pedido para parar', () => {
  it('reconhece variações em português', () => {
    for (const t of ['pare', 'Não quero, obrigado', 'sem interesse', 'não me chame mais', 'me tira da lista', 'isso é spam', 'Por favor remover meu número']) expect(isOptOut(t), t).toBe(true);
    for (const t of ['pode ser, me manda a prévia', 'qual o valor?', 'bom dia', 'quero ver o site']) expect(isOptOut(t), t).toBe(false);
  });
});

describe('robô: limites', () => {
  it('horário e dias úteis', () => {
    expect(withinSendWindow(WED_10, S)).toBe(true);
    expect(withinSendWindow(new Date(2026, 9, 28, 20, 0), S)).toBe(false);
    expect(withinSendWindow(new Date(2026, 9, 31, 10, 0), S)).toBe(false); // sábado
  });

  it('só celular, pausa geral, teto diário e intervalo mínimo', () => {
    const l = mk();
    expect(canSendNow(l, [l], WED_10, S).ok).toBe(true);
    expect(canSendNow(mk({ phone: '554133334444' }), [], WED_10, S).ok).toBe(false); // fixo
    expect(canSendNow(l, [l], WED_10, { ...S, paused: true }).reason).toContain('pausa');
    const sentAt = (min: number) => new Date(WED_10.getTime() - min * 60_000).toISOString();
    const withSent = (n: number, minAgo: number): Lead => mk({ robot: { ...newRobot('approve', WED_10), messages: Array.from({ length: n }, (_, i) => newMessage({ at: sentAt(minAgo + i), dir: 'out', text: 'x', state: 'enviada' })) } });
    expect(sentToday([withSent(2, 30)], WED_10)).toBe(2);
    expect(canSendNow(l, [withSent(2, 30)], WED_10, S).reason).toContain('Limite diário');
    expect(canSendNow(l, [withSent(1, 0.5)], WED_10, S).reason).toContain('intervalo');
    // modo teste não é bloqueado por teto/intervalo
    expect(canSendNow(l, [withSent(5, 0.5)], WED_10, { ...S, dryRun: true }).ok).toBe(true);
  });
});

describe('robô: estratégia', () => {
  const at = (h: number) => new Date(WED_10.getTime() + h * 3600_000);
  const sent = (stage: 'abertura' | 'followup1' | 'followup2', when: Date) => newMessage({ at: when.toISOString(), dir: 'out', text: 'x', state: 'enviada', stage });

  it('começa pela abertura', () => {
    const l = mk({ robot: newRobot('approve', WED_10) });
    const step = nextStep(l, WED_10, seller);
    expect(step.kind).toBe('compose');
    if (step.kind === 'compose') expect(step.stage).toBe('abertura');
  });

  it('aguarda aprovação enquanto há mensagem pendente', () => {
    const r = newRobot('approve', WED_10);
    r.messages.push(newMessage({ at: WED_10.toISOString(), dir: 'out', text: 'oi', state: 'pendente', stage: 'abertura' }));
    expect(nextStep(mk({ robot: r }), WED_10, seller).kind).toBe('waiting-approval');
  });

  it('follow-up só depois de 24 h; depois 72 h; depois despedida; depois fim', () => {
    const r = newRobot('auto', WED_10);
    r.messages.push(sent('abertura', WED_10));
    let s = nextStep(mk({ robot: r }), at(5), seller);
    expect(s.kind).toBe('wait');
    s = nextStep(mk({ robot: r }), at(25), seller);
    expect(s).toMatchObject({ kind: 'compose', stage: 'followup1' });
    r.messages.push(sent('followup1', at(25)));
    expect(nextStep(mk({ robot: r }), at(60), seller).kind).toBe('wait');
    expect(nextStep(mk({ robot: r }), at(25 + 73), seller)).toMatchObject({ kind: 'compose', stage: 'followup2' });
    r.messages.push(sent('followup2', at(100)));
    expect(nextStep(mk({ robot: r }), at(100 + 97), seller)).toMatchObject({ kind: 'compose', stage: 'despedida' });
    r.messages.push(newMessage({ at: at(200).toISOString(), dir: 'out', text: 'tchau', state: 'enviada', stage: 'despedida' }));
    expect(nextStep(mk({ robot: r }), at(300), seller).kind).toBe('done');
  });

  it('resposta do lead para o robô; pedido de parar encerra', () => {
    const r = newRobot('auto', WED_10);
    r.messages.push(sent('abertura', WED_10), newMessage({ at: at(1).toISOString(), dir: 'in', text: 'Pode ser, quanto custa?', state: 'recebida' }));
    expect(nextStep(mk({ robot: r }), at(2), seller).kind).toBe('reply-needed');
    r.messages.push(newMessage({ at: at(3).toISOString(), dir: 'in', text: 'Não quero, obrigado', state: 'recebida' }));
    expect(nextStep(mk({ robot: r }), at(4), seller).kind).toBe('stop-optout');
  });

  it('depois que o lead respondeu e você respondeu, não manda lembretes automáticos', () => {
    const r = newRobot('auto', WED_10);
    r.messages.push(sent('abertura', WED_10), newMessage({ at: at(1).toISOString(), dir: 'in', text: 'Quanto custa?', state: 'recebida' }), newMessage({ at: at(2).toISOString(), dir: 'out', text: 'R$ 1.500', state: 'enviada', stage: 'respondeu' }));
    expect(nextStep(mk({ robot: r }), at(200), seller).kind).toBe('none');
  });

  it('textos usam dados reais e não inventam', () => {
    const l = mk({ siteDraft: { previewUrl: 'https://prospecta-9y4.pages.dev/p/abc123' } });
    // O site só é publicado se o lead quiser ver: nenhuma mensagem automática leva link
    for (const st of ['abertura', 'followup1', 'followup2', 'despedida'] as const) expect(composeText(l, st, seller), st).not.toMatch(/https?:\/\//);
    expect(composeText(l, 'abertura', seller)).toContain('Studio Aurora');
    expect(composeText(l, 'abertura', seller)).toContain('tem um site ou página?');
    expect(composeText(l, 'followup1', seller)).toContain('Studio Aurora');
    expect(composeText(l, 'despedida', seller)).toContain('Danillo');
    expect(composeText(mk(), 'followup2', seller)).not.toMatch(/undefined|\{/);
  });
});

describe('robô: agente do usuário', () => {
  it('monta o pedido sem segredos e só com histórico enviado/recebido', () => {
    const r = newRobot('approve', WED_10);
    r.messages.push(newMessage({ at: WED_10.toISOString(), dir: 'out', text: 'oi', state: 'enviada' }), newMessage({ at: WED_10.toISOString(), dir: 'out', text: 'rascunho', state: 'pendente' }));
    const req = buildAgentRequest(mk({ robot: r }), seller);
    expect(req.history).toHaveLength(1);
    expect(req.constraints).toMatchObject({ noPromises: true, stopOnOptOut: true });
    expect(JSON.stringify(req)).not.toMatch(/token|apikey|senha/i);
  });

  it('valida a resposta: ação conhecida, texto limpo e curto; pedido de parar vence o agente', () => {
    expect(parseAgentResponse({ action: 'send', text: '  Olá!\u0000 ' })).toEqual({ action: 'send', text: 'Olá!', note: undefined });
    expect(parseAgentResponse({ action: 'send', text: 'x'.repeat(2000) })).toMatchObject({ action: 'send' });
    expect((parseAgentResponse({ action: 'send', text: 'x'.repeat(2000) }) as { text: string }).text).toHaveLength(600);
    expect(parseAgentResponse({ action: 'send', text: '' })).toBeUndefined();
    expect(parseAgentResponse({ action: 'apagar tudo' })).toBeUndefined();
    expect(parseAgentResponse({ action: 'wait', waitHours: 48 })).toMatchObject({ action: 'wait', waitHours: 48 });
    expect(parseAgentResponse({ action: 'send', text: 'tente de novo!' }, 'não quero')).toMatchObject({ action: 'stop' });
  });
});

describe('robô: trecho esquecido', () => {
  it('detecta [seu nome] e outros campos entre colchetes', async () => {
    const { hasPlaceholder } = await import('../src/data/robot');
    expect(hasPlaceholder('Olá, aqui é [seu nome], eu crio sites')).toBe(true);
    expect(hasPlaceholder('Olá, aqui é o Danillo.')).toBe(false);
  });
});

describe('robô: cérebro embutido (regras, sem IA)', () => {
  it('entende respostas comuns em português', async () => {
    const { classifyIntent } = await import('../src/core/robot/brain');
    const cases: Array<[string, string]> = [
      ['Quanto custa?', 'preco'], ['qual o valor do site', 'preco'], ['Quanto tempo demora?', 'prazo'], ['já tenho site', 'ja_tem_site'],
      ['tá caro pra mim', 'sem_verba'], ['agora não, quem sabe mais pra frente', 'depois'], ['quem é você? como conseguiu meu número', 'quem_e'],
      ['como funciona?', 'como_funciona'], ['podemos marcar uma reunião amanhã?', 'reuniao'], ['pode mandar', 'quer_ver_aqui'], ['me manda por aqui mesmo', 'quer_ver_aqui'], ['quero ver o site', 'quer_ver_aqui'], ['sim, tenho interesse', 'interesse'], ['legal, gostei da ideia', 'interesse'],
      ['bom dia', 'cumprimento'], ['boa tarde, não tenho', 'nao_tem_site'], ['não temos ainda', 'nao_tem_site'], ['não', 'nao_tem_site'], ['não tenho dinheiro', 'sem_verba'], ['não tenho interesse, obrigado', 'parar'], ['isso ai é hospedagem inclusa?', 'tecnica'], ['hmm', 'desconhecida'],
    ];
    for (const [t, i] of cases) expect(classifyIntent(t), t).toBe(i);
  });

  it('responde com dados reais, não inventa preço e passa a bola quando não sabe', async () => {
    const { replyFor } = await import('../src/core/robot/brain');
    const lead = mk({ siteDraft: { previewUrl: 'https://prospecta-9y4.pages.dev/p/abc' } });
    const vazio = { offerText: '', priceText: '', meetingText: '' };
    // interesse geral: pergunta se prefere conversa rápida ou prévia por aqui (não publica nada)
    const geral = replyFor(mk(), 'tenho interesse', seller, vazio) as { text: string; needsPreview?: boolean };
    expect(geral.text).toContain('conversa rápida');
    expect(geral.text).toContain('prévia por aqui');
    expect(geral.needsPreview).toBeUndefined();
    const interesse = replyFor(lead, 'pode mandar', seller, vazio);
    expect(interesse).toMatchObject({ action: 'send' });
    expect((interesse as { text: string }).text).toContain('https://prospecta-9y4.pages.dev/p/abc');
    // sem prévia pública (ou só em localhost) o robô NÃO manda link: abre a tarefa "gerar prévia"
    const semPrevia = replyFor(mk(), 'quero ver', seller, vazio);
    expect(semPrevia).toMatchObject({ action: 'send', needsPreview: true });
    expect((semPrevia as { text: string }).text).not.toMatch(/https?:\/\//);
    const local = replyFor(mk({ siteDraft: { previewUrl: 'http://localhost:8788/p/abc' } }), 'quero ver', seller, vazio);
    expect(local).toMatchObject({ needsPreview: true });
    expect(replyFor(lead, 'quanto custa?', seller, vazio).action).toBe('handoff'); // sem preço cadastrado
    expect(replyFor(lead, 'quanto custa?', seller, { ...vazio, priceText: 'O site sai por R$ 1.500.' })).toMatchObject({ action: 'send' });
    expect(replyFor(lead, 'hmm', seller, vazio).action).toBe('handoff');
    expect(replyFor(lead, 'não quero, pare', seller, vazio).action).toBe('stop');
    expect(replyFor(lead, 'podemos marcar uma reunião?', seller, vazio).action).toBe('handoff');
    expect((replyFor(lead, 'quem é você?', seller, vazio) as { text: string }).text).toContain('Danillo');
    // momento 2: "não tenho site" → pitch com protótipo (link só se a prévia for pública)
    const m2 = replyFor(lead, 'boa tarde, não tenho', seller, vazio) as { text: string; needsPreview?: boolean };
    expect(m2.text).toContain('Google Meu Negócio');
    expect(m2.text).toContain('https://prospecta-9y4.pages.dev/p/abc');
    const m2b = replyFor(mk(), 'não tenho', seller, vazio);
    expect(m2b).toMatchObject({ action: 'send', needsPreview: true });
  });
});

describe('robô: abordagem por perfil do lead', () => {
  const diag = (checks: Array<{ id: string; result: 'ok' | 'problema' | 'atencao'; priority: 1 | 2 | 3 }>) => ({ ranAt: '2026-01-01', ok: true, checks: checks.map((c) => ({ ...c, label: c.id, origin: 'automatico' as const, detail: '' })) });

  it('classifica: sem site, só rede social, site com problemas, site ok', async () => {
    const { leadProfile } = await import('../src/core/robot/profile');
    expect(leadProfile(mk()).kind).toBe('sem_site');
    expect(leadProfile(mk({ website: 'https://www.instagram.com/studioaurora' }))).toMatchObject({ kind: 'rede_social', network: 'Instagram' });
    const fraco = leadProfile(mk({ website: 'https://studioaurora.com.br', diagnosis: diag([{ id: 'https', result: 'problema', priority: 1 }, { id: 'cta', result: 'problema', priority: 2 }]) as never }));
    expect(fraco.kind).toBe('site_fraco');
    expect(fraco.problems[0]).toContain('HTTPS');
    expect(leadProfile(mk({ website: 'https://studioaurora.com.br', diagnosis: diag([{ id: 'https', result: 'ok', priority: 1 }]) as never })).kind).toBe('site_ok');
    expect(leadProfile(mk({ website: 'https://studioaurora.com.br' })).kind).toBe('site_ok'); // sem diagnóstico: não inventa problema
  });

  it('a abertura muda conforme o perfil e nunca leva link', () => {
    const semSite = composeText(mk(), 'abertura', seller);
    expect(semSite).toContain('tem um site ou página?'); // momento 1: só pergunta
    expect(semSite.length).toBeLessThan(160);
    const rede = composeText(mk({ website: 'https://www.instagram.com/studioaurora' }), 'abertura', seller);
    expect(rede).toContain('tem um site ou página?');
    const fraco = composeText(mk({ website: 'https://studioaurora.com.br', diagnosis: diag([{ id: 'viewport', result: 'problema', priority: 1 }]) as never }), 'abertura', seller);
    expect(fraco).toContain('studioaurora.com.br');
    expect(fraco).toContain('não está preparado para celular');
    const ok = composeText(mk({ website: 'https://studioaurora.com.br' }), 'abertura', seller);
    expect(ok).toContain('mais personalizado e atualizado');
    for (const t of [semSite, rede, fraco, ok]) expect(t).not.toMatch(/https?:\/\//);
  });

  it('"já tenho site": quem não tem site no Google é convidado a passar o endereço', async () => {
    const { replyFor } = await import('../src/core/robot/brain');
    const vazio = { offerText: '', priceText: '', meetingText: '' };
    const r = replyFor(mk(), 'já tenho site sim', seller, vazio) as { text: string };
    expect(r.text).toContain('Pode me passar o endereço');
    const r2 = replyFor(mk({ website: 'https://studioaurora.com.br' }), 'já tenho site', seller, vazio) as { text: string };
    expect(r2.text).toContain('versão melhorada');
  });
});
