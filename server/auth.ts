// Verificação de JWT do Clerk para Pages Functions.
import { createClerkClient, verifyToken } from '@clerk/backend';
import type { Env } from './http';

export interface ClerkUser {
  clerkId: string;
  email: string;
  isAdmin: boolean;
}

function roleFromMeta(meta: unknown): string | undefined {
  if (meta != null && typeof meta === 'object' && 'role' in meta) {
    const r = (meta as Record<string, unknown>).role;
    return typeof r === 'string' ? r : undefined;
  }
  return undefined;
}

// Deriva o issuer da publishable key (ex: "pk_test_xxx" → "https://wondrous-toucan-1095.clerk.accounts.dev")
function issuerFromPublishableKey(pk: string): string | null {
  try {
    const b64 = pk.replace(/^pk_(?:test|live)_/, '');
    const domain = atob(b64).replace(/\$+$/, '');
    return `https://${domain}`;
  } catch {
    return null;
  }
}

// Busca todas as chaves públicas RSA do endpoint JWKS e devolve como PEMs.
async function fetchJwtKeys(issuer: string): Promise<string[]> {
  try {
    const res = await fetch(`${issuer}/.well-known/jwks.json`);
    if (!res.ok) return [];
    const { keys } = (await res.json()) as { keys: JsonWebKey[] };
    if (!keys?.length) return [];
    const pems: string[] = [];
    for (const key of keys) {
      try {
        const cryptoKey = await crypto.subtle.importKey(
          'jwk', key,
          { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
          true, ['verify'],
        );
        const spki = await crypto.subtle.exportKey('spki', cryptoKey);
        const b64 = btoa(String.fromCharCode(...new Uint8Array(spki as ArrayBuffer)));
        const lines = b64.match(/.{1,64}/g)!.join('\n');
        pems.push(`-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`);
      } catch { /* skip key inválida */ }
    }
    return pems;
  } catch {
    return [];
  }
}

export async function verifyClerkToken(request: Request, env: Env): Promise<ClerkUser | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);

  try {
    let payload: Awaited<ReturnType<typeof verifyToken>> | null = null;

    const allowedOrigins = ['https://sitesales.com.br', 'http://localhost:5173', 'http://localhost:4173'];

    // Primário: secret key (também permite buscar email via API Clerk)
    if (env.CLERK_SECRET_KEY) {
      try {
        payload = await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY, authorizedParties: allowedOrigins });
      } catch { /* tenta JWKS abaixo */ }
    }

    // Fallback: JWKS público — tenta todas as chaves disponíveis
    if (!payload && env.CLERK_PUBLISHABLE_KEY) {
      const issuer = issuerFromPublishableKey(env.CLERK_PUBLISHABLE_KEY);
      if (issuer) {
        const jwtKeys = await fetchJwtKeys(issuer);
        for (const jwtKey of jwtKeys) {
          try {
            payload = await verifyToken(token, { jwtKey, authorizedParties: allowedOrigins });
            if (payload?.sub) break;
          } catch { /* tenta próxima */ }
        }
      }
    }

    if (!payload?.sub) return null;

    // Email: usa claim do token se presente, senão busca via API Clerk.
    let email = '';
    const rawEmail = (payload as any).email;
    if (typeof rawEmail === 'string') {
      email = rawEmail;
    } else if (env.CLERK_SECRET_KEY) {
      try {
        const client = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
        const user = await client.users.getUser(payload.sub);
        email = user.emailAddresses[0]?.emailAddress ?? '';
      } catch { /* e-mail fica vazio; autenticação continua */ }
    }

    const OWNER_EMAILS = ['dangrafico.1@gmail.com'];
    const OWNER_CLERK_IDS = ['user_3MHezFklTjdo1yzYBNjmsPnpW5l'];
    const isAdmin =
      roleFromMeta((payload as any).publicMetadata) === 'admin' ||
      roleFromMeta((payload as any).metadata) === 'admin' ||
      OWNER_EMAILS.includes(email) ||
      OWNER_CLERK_IDS.includes(payload.sub);

    return { clerkId: payload.sub, email, isAdmin };
  } catch {
    return null;
  }
}
