import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "lumintrack_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days, in seconds

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not set. Copy .env.example to .env and fill it in.");
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());
}

/** Returns the user id if the token is valid and unexpired, otherwise null. */
export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    // Pin the algorithm — without an allowlist jwtVerify accepts any alg the
    // header claims. Not currently exploitable (symmetric key rejects alg:none),
    // but defence-in-depth against algorithm-confusion.
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
