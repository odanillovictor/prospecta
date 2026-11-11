import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addGoogleUsage, googleUsed } from '../src/data/quota';
import { MONTHLY_SEARCHES, MONTHLY_PREVIEWS, DAILY_SEARCH_WARN } from '../server/quota';

describe('contador mensal do Google', () => {
  beforeEach(() => {
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    });
  });

  it('soma dentro do mês e zera no mês seguinte', () => {
    const jan = new Date(2026, 0, 15);
    expect(googleUsed(jan)).toBe(0);
    expect(addGoogleUsage(2, jan)).toBe(2);
    expect(addGoogleUsage(1, jan)).toBe(3);
    expect(googleUsed(new Date(2026, 0, 31))).toBe(3);
    expect(googleUsed(new Date(2026, 1, 1))).toBe(0);
  });

  it('ignora valores negativos', () => {
    const d = new Date(2026, 5, 1);
    expect(addGoogleUsage(-5, d)).toBe(0);
  });
});

describe('quota constants', () => {
  it('monthly searches limit is 200', () => expect(MONTHLY_SEARCHES).toBe(200));
  it('monthly previews limit is 50', () => expect(MONTHLY_PREVIEWS).toBe(50));
  it('daily warn threshold is 20', () => expect(DAILY_SEARCH_WARN).toBe(20));
});
