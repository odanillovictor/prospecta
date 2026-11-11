import { describe, it, expect } from 'vitest';
import { verifyClerkToken } from '../server/auth';

describe('verifyClerkToken', () => {
  it('retorna null quando não há Authorization header', async () => {
    const req = new Request('https://x.invalid/api/test');
    const result = await verifyClerkToken(req, {} as any);
    expect(result).toBeNull();
  });

  it('retorna null para token malformado', async () => {
    const req = new Request('https://x.invalid/api/test', {
      headers: { Authorization: 'Bearer nao-e-um-jwt' },
    });
    const result = await verifyClerkToken(req, { CLERK_SECRET_KEY: 'sk_test_xxx' } as any);
    expect(result).toBeNull();
  });
});
