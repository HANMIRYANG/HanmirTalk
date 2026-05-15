import { randomBytes } from "crypto";

interface Session {
  token: string;
  userId: string;
  createdAt: number;
}

const TOKEN_TTL_MS = 1000 * 60 * 60 * 12;

class SessionStore {
  private readonly byToken = new Map<string, Session>();

  issue(userId: string): Session {
    const token = randomBytes(24).toString("hex");
    const session: Session = { token, userId, createdAt: Date.now() };
    this.byToken.set(token, session);
    return session;
  }

  revoke(token: string): void {
    this.byToken.delete(token);
  }

  resolve(token: string | undefined): Session | undefined {
    if (!token) return undefined;
    const session = this.byToken.get(token);
    if (!session) return undefined;
    if (Date.now() - session.createdAt > TOKEN_TTL_MS) {
      this.byToken.delete(token);
      return undefined;
    }
    return session;
  }
}

export const sessionStore = new SessionStore();
