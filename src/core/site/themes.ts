// Temas visuais do gerador. Cada um tem tipografia e paleta próprias (nada de gradiente roxo genérico).

export interface SiteTheme {
  id: string;
  label: string;
  dark: boolean;
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  accentInk: string; // texto sobre o accent
  accentText?: string; // accent ajustado para uso como cor de texto (contraste ≥ 4,5:1)
  display: string; // font-family CSS
  body: string;
  fontsHref: string;
  displayWeight: number;
  displayTracking: string;
  radius: string;
}

const gf = (q: string) => `https://fonts.googleapis.com/css2?${q}&display=swap`;

export const THEMES: Record<string, SiteTheme> = {
  clinico: {
    id: 'clinico', label: 'Clínico (claro, verde-petróleo)', dark: false,
    bg: '#f4f2ec', surface: '#fbfaf7', ink: '#11221e', muted: '#5b6b66', line: '#d9ddd5',
    accent: '#0f6e5c', accentInk: '#ffffff',
    display: "'Fraunces', Georgia, serif", body: "'Manrope', system-ui, sans-serif",
    fontsHref: gf('family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Manrope:wght@400;500;600;700'),
    displayWeight: 400, displayTracking: '-0.025em', radius: '18px',
  },
  terracota: {
    id: 'terracota', label: 'Terracota (quente, editorial)', dark: false,
    bg: '#f3ebe1', surface: '#faf5ee', ink: '#2a1912', muted: '#6e5a50', line: '#e0d2c3',
    accent: '#bd4b26', accentInk: '#fff8f2',
    display: "'DM Serif Display', Georgia, serif", body: "'DM Sans', system-ui, sans-serif",
    fontsHref: gf('family=DM+Serif+Display&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700'),
    displayWeight: 400, displayTracking: '-0.015em', radius: '4px',
  },
  noturno: {
    id: 'noturno', label: 'Noturno (escuro, âmbar)', dark: true,
    bg: '#14120f', surface: '#1d1a16', ink: '#f2ebdd', muted: '#a89f8f', line: '#332e27',
    accent: '#e8a33d', accentInk: '#1a1206',
    display: "'Bricolage Grotesque', system-ui, sans-serif", body: "'Inter', system-ui, sans-serif",
    fontsHref: gf('family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,800&family=Inter:wght@400;500;600'),
    displayWeight: 800, displayTracking: '-0.035em', radius: '14px',
  },
  esportivo: {
    id: 'esportivo', label: 'Esportivo (preto, verde-limão)', dark: true,
    bg: '#0e0f0c', surface: '#171914', ink: '#f1f3ea', muted: '#9aa092', line: '#2a2d25',
    accent: '#c6f432', accentInk: '#0e0f0c',
    display: "'Archivo', system-ui, sans-serif", body: "'Archivo', system-ui, sans-serif",
    fontsHref: gf('family=Archivo:wdth,wght@62..125,400;62..125,600;62..125,900'),
    displayWeight: 900, displayTracking: '-0.03em', radius: '0px',
  },
  // Do vault-sites: fundo escuro com uma fonte de luz (dourado), carvão em vez de cinza lavado.
  grafite: {
    id: 'grafite', label: 'Grafite (carvão, dourado)', dark: true,
    bg: '#111216', surface: '#1a1b20', ink: '#f4efe6', muted: '#a9a69e', line: '#2c2d33',
    accent: '#dfa968', accentInk: '#17120a',
    display: "'Playfair Display', Georgia, serif", body: "'Inter', system-ui, sans-serif",
    fontsHref: gf('family=Playfair+Display:wght@500;700&family=Inter:wght@400;500;600'),
    displayWeight: 500, displayTracking: '-0.02em', radius: '6px',
  },
  // Claro e arejado, azul-petróleo: saúde, pet e serviços de cuidado.
  oceano: {
    id: 'oceano', label: 'Oceano (claro, azul)', dark: false,
    bg: '#f3f6f7', surface: '#fbfcfc', ink: '#0f1f2a', muted: '#566873', line: '#d6e0e4',
    accent: '#0b6b8a', accentInk: '#ffffff',
    display: "'Bricolage Grotesque', system-ui, sans-serif", body: "'Work Sans', system-ui, sans-serif",
    fontsHref: gf('family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Work+Sans:wght@400;500;600'),
    displayWeight: 700, displayTracking: '-0.03em', radius: '16px',
  },
  sobrio: {
    id: 'sobrio', label: 'Sóbrio (marinho, clássico)', dark: false,
    bg: '#f1f0eb', surface: '#fafaf7', ink: '#141820', muted: '#5d6370', line: '#d8d8d1',
    accent: '#1e3a5f', accentInk: '#ffffff',
    display: "'Newsreader', Georgia, serif", body: "'Public Sans', system-ui, sans-serif",
    fontsHref: gf('family=Newsreader:opsz,wght@6..72,400;6..72,500&family=Public+Sans:wght@400;500;600;700'),
    displayWeight: 400, displayTracking: '-0.02em', radius: '10px',
  },
};

export function themeFor(id: string | undefined): SiteTheme {
  return (id && THEMES[id]) || THEMES.sobrio;
}

/** Aceita apenas cores hex (#rgb/#rrggbb) — evita injeção de CSS via cor personalizada. */
export function safeHex(v: string | undefined): string | undefined {
  return v && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim()) ? v.trim() : undefined;
}

/** Cor de texto legível sobre um fundo (preto ou branco), pelo contraste de luminância. */
export function readableOn(hex: string): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? '#111111' : '#ffffff';
}
