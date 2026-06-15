import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import type { NextRequest } from 'next/server';

export const COOKIE_NAME = 'gp_token';
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export type Role = 'admin' | 'contractor';

export interface Session {
  id: string;
  credential: string;
  role: Role;
}

function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set — create a .env.local with JWT_SECRET=<random-string>');
  return new TextEncoder().encode(secret);
}

export async function signToken(payload: Session): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .setIssuer('gate-pass-app')
    .setAudience('gate-pass-app')
    .sign(secretKey());
}

export async function verifyToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: 'gate-pass-app',
      audience: 'gate-pass-app',
    });
    if (
      typeof payload.id !== 'string' ||
      typeof payload.credential !== 'string' ||
      typeof payload.role !== 'string' ||
      (payload.role !== 'admin' && payload.role !== 'contractor')
    ) {
      return null;
    }
    return { id: payload.id, credential: payload.credential, role: payload.role as Role };
  } catch (e) {
    // Re-throw config errors so broken deploys are diagnosable
    if (e instanceof Error && e.message.startsWith('JWT_SECRET')) throw e;
    // Silently discard expired/malformed tokens
    return null;
  }
}

export async function getSession(request: NextRequest): Promise<Session | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}
