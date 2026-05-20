import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireServerMe } from "@/lib/server-auth";
import { AdminNav } from "./AdminNav";
import styles from "./admin.module.css";

const ADMIN_ROLES = new Set(["admin", "super_admin"]);

// Phase 8 — shared shell for every /admin/* page. The role guard lives here
// so each sub-page only fetches its own data.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { me } = await requireServerMe();
  if (!ADMIN_ROLES.has(me.role)) redirect("/dashboard");

  return (
    <div className={styles.layout}>
      <AdminNav />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
