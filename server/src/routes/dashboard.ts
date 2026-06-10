import { Router } from "express";
import { requireRole } from "../auth/middleware";
import type { Repositories } from "../repositories/types";
import type { AdminKpi, ActivityEvent } from "@hanmir/shared";

interface DeptStat {
  name: string;
  sub: string;
  count: string;
}

async function buildAdminKpis(repos: Repositories): Promise<AdminKpi[]> {
  const [users, projects, notices, rooms] = await Promise.all([
    repos.users.list(),
    repos.projects.list(),
    repos.notices.list(),
    repos.rooms.list()
  ]);

  const activeUsers = users.filter((u) => u.isActive !== false);
  const pendingPasswordUsers = activeUsers.filter((u) => u.mustChangePassword);
  const activeProjects = projects.filter((p) => p.status !== "done" && p.status !== "cancelled");
  const mandatoryNotices = notices.filter((n) => n.isMandatory);

  return [
    {
      label: "전체 사용자",
      value: String(users.length),
      sub: `활성 ${activeUsers.length} · 비활성 ${users.length - activeUsers.length}`
    },
    {
      label: "초기 비밀번호 변경",
      value: String(pendingPasswordUsers.length),
      sub:
        pendingPasswordUsers.length > 0
          ? `변경 필요 ${pendingPasswordUsers.length}명`
          : "모든 활성 사용자가 변경 완료",
      highlight: pendingPasswordUsers.length > 0 ? "warn" : undefined
    },
    {
      label: "진행 중인 프로젝트",
      value: String(activeProjects.length),
      sub: `전체 ${projects.length} · 완료/취소 ${projects.length - activeProjects.length}`
    },
    {
      label: "채팅방",
      value: String(rooms.length),
      sub: "활성 대화방 기준"
    },
    {
      label: "공지",
      value: String(notices.length),
      sub: `필독 ${mandatoryNotices.length} · 일반 ${notices.length - mandatoryNotices.length}`
    }
  ];
}

async function buildDeptStats(repos: Repositories): Promise<DeptStat[]> {
  const [departments, users, projects] = await Promise.all([
    repos.departments.list(),
    repos.users.list(),
    repos.projects.list()
  ]);
  const activeUsers = users.filter((u) => u.isActive !== false);

  return departments.map((department) => {
    const memberCount = activeUsers.filter((u) => u.departmentId === department.id).length;
    const projectCount = projects.filter((p) => p.department === department.name).length;
    return {
      name: department.name,
      sub: `프로젝트 ${projectCount} · 활성 사용자 ${memberCount}`,
      count: String(memberCount)
    };
  });
}

export function createDashboardRouter(repos: Repositories): Router {
  const router = Router();

  const adminOnly = requireRole("admin", "super_admin");

  router.get("/overview", adminOnly, async (_req, res) => {
    const [kpis, audit, deptStats] = await Promise.all([
      buildAdminKpis(repos),
      repos.audit.list({ limit: 20 }),
      buildDeptStats(repos)
    ]);
    res.json({
      kpis,
      audit,
      deptStats,
      activities: [] satisfies ActivityEvent[]
    });
  });

  router.get("/admin-kpis", adminOnly, async (_req, res) => {
    res.json(await buildAdminKpis(repos));
  });

  // Real audit log: writes come from auditLog() helper, reads come from
  // audit repo with optional ?limit / ?action / ?actorUserId filters.
  router.get("/audit", adminOnly, async (req, res) => {
    const limit = Number(req.query.limit ?? 50);
    const action = typeof req.query.action === "string" ? req.query.action : undefined;
    const actorUserId =
      typeof req.query.actorUserId === "string" ? req.query.actorUserId : undefined;
    const entries = await repos.audit.list({
      limit: Number.isFinite(limit) ? limit : 50,
      action,
      actorUserId
    });
    res.json(entries);
  });

  router.get("/dept-stats", adminOnly, async (_req, res) => {
    res.json(await buildDeptStats(repos));
  });

  // Personal/general activity feeds. These used to return static seed data;
  // until a real activity-event table exists, return an empty feed.
  router.get("/activities", (_req, res) => {
    res.json([] satisfies ActivityEvent[]);
  });

  router.get("/project-activities", (_req, res) => {
    res.json([] satisfies ActivityEvent[]);
  });

  return router;
}
