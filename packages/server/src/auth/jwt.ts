import { SignJWT, jwtVerify } from "jose";

export interface JwtPayload {
  userId: string;
  email: string;
}

let secret: Uint8Array;

function getSecret(): Uint8Array {
  if (!secret) {
    const raw = process.env.PONDER_JWT_SECRET || "ponderdb-local-dev-secret-change-in-production";
    secret = new TextEncoder().encode(raw);
  }
  return secret;
}

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      userId: payload.userId as string,
      email: payload.email as string,
    };
  } catch {
    return null;
  }
}
