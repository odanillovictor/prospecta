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

// Busca a chave pública RSA do endpoint JWKS e devolve como PEM.
async function fetchJwtKey(issuer: string): Promise<string | null> {
  try {
    const res = await fetch(`${issuer}/.well-known/jwks.json`);
    if (!res.ok) return null;
    const { keys } = (await res.json()) as { keys: JsonWebKey[] };
    if (!keys?.length) return null;
    const cryptoKey = await crypto.subtle.importKey(
      'jwk', keys[0],
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      true, ['verify'],
    );
    const spki = await crypto.subtle.exportKey('spki', cryptoKey);
    const b64 = btoa(String.fromCharCode(...new Uint8Array(spki as ArrayBuffer)));
    const lines = b64.match(/.{1,64}/g)!.join('\n');
    return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`;
  } catch {
    return null;
  }
}

export async function verifyClerkToken(request: Request, env: Env): Promise<ClerkUser | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);

  try {
    let payload: Awaited<ReturnType<typeof verifyToken>> | null = null;

    // Primário: secret key (também permite buscar email via API Clerk)
    if (env.CLERK_SECRET_KEY) {
      try {
        payload = await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY });
      } catch { /* tenta JWKS abaixo */ }
    }

    // Fallback: JWKS público derivado da publishable key (não precisa da secret key)
    if (!payload && env.CLERK_PUBLISHABLE_KEY) {
      const issuer = issuerFromPublishableKey(env.CLERK_PUBLISHABLE_KEY);
      if (issuer) {
        const jwtKey = await fetchJwtKey(issuer);
        if (jwtKey) {
          payload = await verifyToken(token, { jwtKey });
        }
      }
    }

    if (!payload?.sub) return null;

    // Email: usa claim do token se presente, senão busca via API Clerk.
    let email: string;
    const rawEmail = (payload as any).email;
    if (typeof rawEmail === 'string') {
      email = rawEmail;
    } else if (env.CLERK_SECRET_KEY) {
      const client = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
      const user = await client.users.getUser(payload.sub);
      email = user.emailAddresses[0]?.emailAddress ?? '';
    } else {
      email = '';
    }

    const OWNER_EMAILS = ['dangrafico.1@gmail.com'];
    const isAdmin =
      roleFromMeta((payload as any).publicMetadata) === 'admin' ||
      roleFromMeta((payload as any).metadata) === 'admin' ||
      OWNER_EMAILS.includes(email);

    return { clerkId: payload.sub, email, isAdmin };
  } catch {
    return null;
  }
}
