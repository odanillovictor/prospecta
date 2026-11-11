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

export async function verifyClerkToken(request: Request, env: Env): Promise<ClerkUser | null> {
  if (!env.CLERK_SECRET_KEY) return null;

  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);

  try {
    // @clerk/backend v3 may return { data, errors } instead of throwing on failure.
    const rawResult = await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY });
    const { data: wrappedPayload, errors } = rawResult as unknown as {
      data?: typeof rawResult;
      errors?: unknown[];
    };
    const payload = wrappedPayload ?? rawResult;
    if (errors || !payload) return null;

    // Email: use claim from token if present, else fetch from Clerk API.
    let email: string;
    const rawEmail = payload.email;
    if (typeof rawEmail === 'string') {
      email = rawEmail;
    } else {
      const client = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
      const user = await client.users.getUser(payload.sub);
      email = user.emailAddresses[0]?.emailAddress ?? '';
    }

    // isAdmin: check publicMetadata.role or metadata.role (SDK versions differ).
    const isAdmin =
      roleFromMeta(payload.publicMetadata) === 'admin' ||
      roleFromMeta(payload.metadata) === 'admin';

    return { clerkId: payload.sub, email, isAdmin };
  } catch {
    return null;
  }
}
