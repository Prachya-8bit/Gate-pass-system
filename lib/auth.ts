import { SignJWT, jwtVerify } from 'jose';
import type { NextRequest } from 'next/server';

export const COOKIE_NAME = 'gp_token';
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface Session {
  id: string;
  credential: string;
  role: string;
}

function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return new TextEncoder().encode(secret);
}

export async function signToken(payload: Session): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secretKey());
}

export async function verifyToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.id !== 'string' || typeof payload.credential !== 'string' || typeof payload.role !== 'string') {
      return null;
    }
    return { id: payload.id, credential: payload.credential, role: payload.role };
  } catch {
    return null;
  }
}

export async function getSession(request: NextRequest): Promise<Session | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}
