// Contador mensal de consultas à API oficial do Google (cada consulta custa dinheiro).
// Por enquanto fica no navegador (não impede quem limpar o navegador); a cota por assinante
// só vale de verdade com login + servidor (D1). Ver reports/Viabilidade SaaS Prospecta.md.
export const GOOGLE_MONTHLY_LIMIT = 300;
/** A partir daqui a tela avisa que está perto do limite. */
export const GOOGLE_WARN_AT = 0.8;

const key = (d = new Date()) => `quota.google.${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export function googleUsed(d = new Date()): number {
  try {
    const n = Number(localStorage.getItem(key(d)));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Soma consultas ao contador do mês e devolve o novo total. */
export function addGoogleUsage(n: number, d = new Date()): number {
  const total = googleUsed(d) + Math.max(0, Math.round(n));
  try {
    localStorage.setItem(key(d), String(total));
  } catch {
    /* sem armazenamento: o contador só não persiste */
  }
  return total;
}
