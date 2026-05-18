import type { Request } from "express";
import type { CreateAuditInput } from "@hanmir/shared";
import type { Repositories } from "./repositories/types";

// Single entry point for write-side audit logging. Failures are swallowed
// so a missing audit row never fails the user-visible action.
//
// Usage (inside a route handler):
//   await auditLog(repos, req, {
//     action: "user.create",
//     targetType: "user",
//     targetId: created.id,
//     targetLabel: created.email
//   });
export async function auditLog(
  repos: Repositories,
  req: Request,
  input: Omit<CreateAuditInput, "actorUserId" | "actorName" | "actorRole" | "ip">
): Promise<void> {
  const me = req.currentUser;
  try {
    await repos.audit.record({
      ...input,
      actorUserId: me?.id,
      actorName: me?.name,
      actorRole: me?.role,
      ip:
        (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
        req.socket.remoteAddress ??
        undefined
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[hanmir-server] audit write failed:", err);
  }
}
