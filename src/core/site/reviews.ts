// Inteligência das avaliações reais do Google (0 token): descobre o que os clientes mais elogiam e escolhe
// depoimentos de verdade para provar a copy. Nada é gerado: só contagem de temas e trechos exatamente como foram escritos.
import type { Review } from '../types';
import { normText } from '../normalize';

export type ThemeId = 'atendimento' | 'pontualidade' | 'preco' | 'qualidade' | 'confianca' | 'ambiente' | 'resultado';

/** Termos (sem acento) que indicam cada tema nas avaliações. */
const THEMES: Array<{ id: ThemeId; label: string; re: RegExp }> = [
  { id: 'atendimento', label: 'o atendimento', re: /atend|atencios|educad|simpati|gentil|cordial|acolh|cuidado/ },
  { id: 'pontualidade', label: 'a pontualidade', re: /pontual|no horario|sem espera|nao atras|rapid|agil/ },
  { id: 'preco', label: 'o preço justo', re: /preco|valor justo|custo beneficio|barato|acessivel|bom preco/ },
  { id: 'qualidade', label: 'a qualidade do trabalho', re: /qualidade|caprich|perfeit|excelente|detalh|profissional/ },
  { id: 'confianca', label: 'a confiança', re: /confian|honest|transparen|recomend/ },
  { id: 'ambiente', label: 'o ambiente', re: /ambiente|limpo|limpeza|organiz|aconcheg|espaco/ },
  { id: 'resultado', label: 'o resultado', re: /resultado|ficou (lind|otim|perfeit)|amei|adorei/ },
];

export interface ReviewInsights {
  /** Quantas avaliações com texto foram lidas. */
  n: number;
  /** Temas citados por 2+ avaliações, do mais para o menos citado. */
  themes: Array<{ id: ThemeId; label: string; count: number }>;
  /** Melhor depoimento (nota 4–5, tamanho de citação) que fala do tema pedido; sem tema, o melhor geral. */
  quoteFor(theme?: ThemeId): Review | undefined;
}

const usable = (r: Review) => r.text && r.author && r.rating >= 4 && r.text.length >= 50 && r.text.length <= 200;

export function reviewInsights(reviews: Review[] | undefined): ReviewInsights {
  const rs = (reviews ?? []).filter((r) => r.text && r.text.trim().length >= 20);
  const norm = rs.map((r) => normText(r.text));
  const counts = THEMES.map((t) => ({ id: t.id, label: t.label, count: norm.filter((x) => t.re.test(x)).length }));
  const themes = rs.length >= 3 ? counts.filter((c) => c.count >= 2).sort((a, b) => b.count - a.count).slice(0, 3) : [];
  const quoteFor = (theme?: ThemeId) => {
    const t = theme ? THEMES.find((x) => x.id === theme) : undefined;
    const pool = rs.map((r, i) => ({ r, i })).filter(({ r }) => usable(r));
    const pick = (list: typeof pool) => list.sort((a, b) => b.r.rating - a.r.rating || b.r.text.length - a.r.text.length)[0]?.r;
    if (t) return pick(pool.filter(({ i }) => t.re.test(norm[i])));
    return pick(pool);
  };
  return { n: rs.length, themes, quoteFor };
}

/** Frase para o "Quem somos": só se 2+ avaliações reais citam o tema. */
export function themeSentence(ins: ReviewInsights): string {
  if (!ins.themes.length) return '';
  const labels = ins.themes.slice(0, 2).map((t) => t.label);
  return `Nas avaliações do Google, os clientes costumam destacar ${labels.length > 1 ? `${labels[0]} e ${labels[1]}` : labels[0]}.`;
}

/** Tema de cada objeção (para mostrar um depoimento de verdade como resposta). */
export function themeOfObjection(title: string): ThemeId | undefined {
  const t = normText(title);
  if (/caro|custa|valor|orcamento|quanto/.test(t)) return 'preco';
  if (/espera|tempo|parad|demora/.test(t)) return 'pontualidade';
  if (/medo|ficar bem|gostar|jeito|entender|seguro/.test(t)) return 'atendimento';
  if (/confia|surpresa|cobrar/.test(t)) return 'confianca';
  return undefined;
}
