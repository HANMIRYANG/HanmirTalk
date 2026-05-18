# Codex Review Guide

This document defines how Codex should review Claude Code results for this
project. The goal is to prevent hallucinated progress, misplaced priorities,
and accidental acceptance of incomplete work.

## Core Rule

Do not trust a summary by itself. Always verify claims against the actual code,
documents, and command output.

When Claude Code reports work as complete, Codex must classify each claim as:

- Completed
- Partially completed
- Not implemented
- Summary/code mismatch
- Needs follow-up

## Priority Order

Use this order when deciding the next implementation prompt.

### P0: Foundation

- Authentication, session, logout, and authorization correctness
- PostgreSQL schema, migrations, and repository adapter structure
- Stable repository interfaces
- Security-sensitive backend behavior
- Build/typecheck health

### P1: Core Business Features

- Admin user CRUD
- Department CRUD
- Project CRUD and project member management
- Task CRUD and task status updates
- Product CRUD and sales status updates
- Notice write/read-status flows
- File upload/download metadata and access control

### P2: Operations and Realtime

- WebSocket events
- Notifications
- Audit logs
- Soft delete
- Redis/session persistence
- File storage integration

### P3: Convenience and Advanced Features

- `@` mention UI and mention notifications
- `/` AI commands
- AI summaries and extraction
- Advanced search and automation

P3 features must not be implemented before P0/P1 gaps are handled, unless the
user explicitly reprioritizes them.

## Required Review Procedure

### 1. Compare Summary to Files

For every file Claude Code says it changed:

- Confirm the file exists.
- Open the file.
- Verify the described function, route, type, or behavior exists.
- Distinguish documentation-only changes from implemented code.

### 2. Compare API Spec to Routes

Use `docs/08_API_SPEC.md` as the contract.

For each API claim:

- Check the actual route in `server/src/routes/*`.
- Confirm method and path.
- Confirm request body handling.
- Confirm response shape where practical.
- Confirm `requireAuth` / `requireRole` is applied where required.

### 3. Check Repository Behavior

Review:

- `server/src/repositories/types.ts`
- `server/src/repositories/memory.ts`
- any PostgreSQL repository files
- schema and migration files

Do not accept "CRUD implemented" unless the repository actually mutates state
or persists data according to the current storage mode.

### 4. Check Frontend Integration

Review:

- `apps/web/src/services/*`
- relevant pages under `apps/web/src/app`
- relevant components under `apps/web/src/components`

Confirm that UI buttons/forms actually call services. If a button exists but
does not call an API, classify it as UI-only.

### 5. Run Verification Commands

Run these whenever code changed:

```bash
npm.cmd run typecheck
npm.cmd run build:server
npm.cmd run build
```

If backend behavior changed, run focused smoke tests against the Express app.
Prefer an in-process temporary server when possible, so the test closes cleanly.

### 6. Report Findings First

If issues exist, lead with findings ordered by severity.

Use this format:

- Severity
- File/path reference
- What is wrong
- Why it matters
- What should be done next

Only after findings, include:

- What passed
- What is complete
- What remains
- Recommended next prompt

## Anti-Hallucination Rules

- Never say "implemented" for a feature seen only in docs.
- Never say "verified" unless a command or direct file inspection supports it.
- Never assume a route exists because it appears in `docs/08_API_SPEC.md`.
- Never assume a frontend button is functional without checking its handler.
- Never assume persistence exists while the app still uses memory repositories.
- Never promote P3 convenience features ahead of P0/P1 essentials without user approval.

## Current Project State Baseline

As of the latest verified review (2026-05-18):

- Auth/session/logout basics are implemented.
- Read API protection and admin role guard are implemented.
- Repository interface + memory adapter (default) and PostgreSQL adapter both
  exist; selection is automatic based on `DATABASE_URL`.
- PostgreSQL schema/migrations (`001_initial.sql`, `002_extend_projects_tasks.sql`,
  `003_seed_minimum.sql`) exist; end-to-end smoke against a real DB **passed
  on 2026-05-18** via docker compose (postgres:16-alpine). One bug found and
  fixed: `PgProjectRepository.create` was passing `null` for the NOT NULL
  `sales_status` column — now defaults to `"preparing"`.
- Backend write CRUD implemented for: users, departments, projects (incl.
  members + soft-delete), tasks, message append, notice create + confirm +
  read-status.
- Backend write CRUD **not** implemented: rooms (create/update/members),
  message edit/delete/read/pin/search, files upload/delete, products
  create/update/delete + documents, decisions, refresh token, WebSocket
  events.
- Frontend UI status:
  - `/admin` calls user/department CRUD services end-to-end.
  - `/projects` has `+ 프로젝트 추가` modal wired to `createProject`.
  - `/projects/[id]` has `수정` (edit modal) + `프로젝트 취소` (soft delete)
    + members card (add via search modal, remove on hover).
  - `/projects/[id]/tasks` has inline status select + progress input + delete
    button per row + `+ 업무 추가` modal (group-aware default status).
  - `/projects/[id]/gantt` is read-only.
  - `/notices` has `+ 공지 작성` modal (admin) and per-card `확인 현황`
    modal (admin) listing confirmed vs unconfirmed active users.
  - `/chat`, `/products`, `/files` are read + the single existing write
    action each (message send only).
  - No `/dashboard` page exists; sidebar has no dashboard entry.
- `@` mentions and `/` AI commands are documented only and should remain P3
  until core P0/P1 work is complete.

This baseline must be rechecked after each Claude Code result.

