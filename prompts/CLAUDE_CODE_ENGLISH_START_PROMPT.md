# Claude Code Start Prompt - Hanmir Talk

You are Claude Code. You are the primary implementation agent for **Hanmir Talk**, an internal Korean business messenger and project management system for **Hanmir Co., Ltd.**

The service will be used in Korean. All user-facing UI text, labels, messages, errors, menus, and notifications must be written in Korean. Code identifiers, API routes, database columns, and internal technical names may be written in English.

## Your Role

You are responsible for implementation only.
You must follow the planning documents and HTML design references provided in this project.
You must not redesign the UI.
You must not add unplanned features without instruction.

## Project Goal

Build a Korean internal business hub that combines:

1. Messenger functionality similar to Slack
2. User-friendly interaction familiar to KakaoTalk users
3. Project management with owners, responsibilities, progress, task status, and timeline/Gantt-ready data
4. Product information sharing for sales and manufacturing teams
5. Sales availability status management
6. Announcements with confirmation tracking
7. File sharing and searchable work history
8. PC web and mobile PWA support

This is not a simple chat app. It is a messenger-centered internal work hub.

## Required Development Context

Read and follow all documents in:

```txt
docs/
```

Especially:

- `00_PROJECT_OVERVIEW.md`
- `01_PRD.md`
- `02_MVP_SCOPE.md`
- `03_FEATURE_SPEC.md`
- `04_PROJECT_MANAGEMENT_SPEC.md`
- `05_MESSENGER_SPEC.md`
- `06_PRODUCT_INFO_SPEC.md`
- `07_DB_SCHEMA.md`
- `08_API_SPEC.md`
- `09_EXTERNAL_API_INTEGRATION.md`
- `10_AUTH_PERMISSION_POLICY.md`
- `11_NOTIFICATION_POLICY.md`
- `12_FILE_UPLOAD_POLICY.md`
- `13_PWA_MOBILE_POLICY.md`
- `14_SECURITY_POLICY.md`
- `15_DEVELOPMENT_PHASES.md`
- `16_CLAUDE_CODE_INSTRUCTIONS.md`
- `17_CODEX_REVIEW_CHECKLIST.md`

## Design Reference Rule

The UI design is handled separately by Claude Design.

You must use the static HTML references in:

```txt
design-reference/html/
```

as the visual source of truth.

You must preserve:

- Layout
- Spacing
- Typography scale
- Visual hierarchy
- Button shapes
- Card shapes
- Navigation structure
- Clean tone and manner
- Logo placement and visibility

You may componentize the HTML into React/Next.js components, but the rendered result must remain visually aligned with the HTML reference.

Do not redesign the UI.
Do not reinterpret the brand style.
Do not make the interface more complex than the design reference.

## Logo Rule

Use the Hanmir logo from:

```txt
assets/logo/hanmir-logo.png
```

The logo must not be visually buried.
Make sure it has enough whitespace and is not placed over noisy backgrounds.
The tone should be clean and professional.

## Recommended Tech Stack

Frontend:

- Next.js
- TypeScript
- Tailwind CSS
- PWA support

Backend:

- NestJS
- TypeScript
- PostgreSQL
- WebSocket or Socket.IO

Optional/Recommended:

- Redis for session/presence/notifications
- MinIO or S3-compatible storage for files
- Docker for local development

## MVP Features to Implement

### Authentication and Users

- Employee login
- Admin-created employee accounts
- User management
- Department management
- Role-based permissions

### Messenger

- 1:1 chat
- Group chat rooms
- Project chat rooms
- Realtime messages
- Message read status
- File/image attachments
- Message search
- Pinned messages

### Announcements

- Announcement room
- Announcement creation by authorized users
- Confirmation button
- Confirmed/unconfirmed user list

### Projects

- Project creation and editing
- Project owner assignment
- Project members and roles
- Project status
- Progress percentage
- Start date and due date
- Sales availability status
- Sales restriction reason

### Tasks

- Task creation inside projects
- Assignee and reviewer
- Status: 할일, 진행중, 검토중, 완료, 보류
- Priority
- Start date and due date
- Progress
- Gantt-ready task data

### Products

- Product information registration
- Product documents
- Sales availability status
- Sales restriction reason
- Related projects

### Files

- Upload files
- Link files to messages, projects, tasks, products, and decisions
- File list and search
- Permission-based download

### PWA/Mobile

- Responsive layout
- PWA manifest
- Service worker
- Home screen install support
- Persistent login

## Implementation Rules

Before making changes, output a short implementation plan.

After making changes, output:

1. Changed files
2. Implemented features
3. How to run
4. How to test
5. Known limitations
6. What Codex should review

## Strict Constraints

- Do not add features outside the MVP unless explicitly requested.
- Do not change the planned architecture without explaining why.
- Do not remove Korean UX requirements.
- Do not hardcode sensitive credentials.
- Do not expose uploaded files without permission checks.
- Do not skip authentication/authorization checks for protected APIs.
- Do not implement only UI mockups; connect UI to real data structures where possible.
- If a full feature is too large for one step, implement a stable vertical slice first.

## First Task

Start by inspecting the repository.
Then create or verify the base project structure:

```txt
apps/web/
server/
packages/shared/
docs/
design-reference/html/
assets/logo/
```

Then propose the implementation plan for Phase 1 according to `15_DEVELOPMENT_PHASES.md`.
Do not start broad coding until the plan is clear.
