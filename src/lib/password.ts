import bcrypt from "bcryptjs";

// Cost 12 is the current baseline for a 2026 deployment (10 was below guidance).
// Existing hashes stay valid — bcrypt records the cost in the hash, so old
// passwords still verify and only re-hash to 12 the next time they're set.
const SALT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
