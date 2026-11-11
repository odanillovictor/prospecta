// Regras das prévias online (link público do site gerado). Compartilhado entre app e Functions.

/** Id do link: 10 caracteres [a-z0-9], difícil de adivinhar e curto para mandar no WhatsApp. */
export const PREVIEW_ID = /^[a-z0-9]{10}$/;
export const PREVIEW_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 dias
export const PREVIEW_MAX_HTML = 20_000_000; // limite de valor do KV é 25 MB
export const PREVIEW_MAX_OG = 2_000_000;

export function newPreviewId(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
}

/** Valida o HTML recebido: precisa ser uma página completa gerada pelo construtor. */
export function validPreviewHtml(html: unknown): html is string {
  return typeof html === 'string' && html.length > 200 && html.length <= PREVIEW_MAX_HTML && /^<!doctype html>/i.test(html.trimStart());
}
