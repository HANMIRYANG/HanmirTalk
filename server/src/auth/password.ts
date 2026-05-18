import bcrypt from "bcryptjs";
import { config } from "../config";

// Single place that knows the bcrypt cost. 10 rounds is the sweet spot for
// dev — verification stays under 100ms while remaining brute-force resistant.
const ROUNDS = 10;

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string): boolean {
  if (!plain || !hash) return false;
  try {
    return bcrypt.compareSync(plain, hash);
  } catch {
    return false;
  }
}

// Pre-computed once at module load — used by the memory adapter to populate
// every seed user with a real hash of the configured DEFAULT_PASSWORD. The
// migration 006 bakes a static hash for postgres; this keeps memory mode
// in sync with whatever DEFAULT_PASSWORD env value the dev set.
export const seedPasswordHash: string = hashPassword(config.defaultPassword);
