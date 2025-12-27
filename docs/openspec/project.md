# Project Context

## Purpose
Build a mobile-first reimbursement prep tool that lets users capture expenses and receipts per project, match them, surface issues, and export a clean reimbursement package (CSV/ZIP/PDF).

Key goals:
- Fast on-the-go entry (PWA, one-hand use).
- Reduce missing/duplicate/mismatched receipts before export.
- Manual confirmation for matching to avoid errors.

## Tech Stack

### Frontend
- Framework: Next.js (React 18) + TypeScript.
- Styling: Tailwind CSS (align with existing UI prototypes).
- Data/state: TanStack Query for server state; Zustand for local UI state.
- PWA: Service Worker (Workbox), offline queue, IndexedDB (Dexie).
- Icons: Material Symbols (used in prototypes).

### Backend
- Runtime: Node.js + TypeScript.
- API framework: Hono (REST, `/api/v1`).
- ORM/Migrations: Drizzle ORM + drizzle-kit.
- Validation: drizzle-zod for schema-derived validation.
- Auth: JWT access + refresh tokens; password-based login.
- Queue/Jobs: Database-based Job Table (export/check).

### Data & Storage
- Database: PostgreSQL.
- Object storage: S3-compatible, direct upload via signed URLs.


### Key UI Components (from prototype)
- Project List (pinned/recent/search).
- Project Detail: Expenses tab, Receipts Inbox tab, Batches tab.
- Expense Drawer (edit/match/attachments).
- Receipt Card (suggestions, match/replace/unmatch).
- Batch List + Batch Detail (issue summary, export actions).
- Bottom Composer (fast expense entry).

## Project Conventions

### Code Style
- API payloads and DB fields use snake_case (e.g., `project_id`).
- Status values are explicit enums (e.g., `missing_receipt`, `matched`).
- Keep code changes minimal, reuse existing patterns, avoid over-engineering.

### Architecture Patterns
- Monolithic API service + async worker for export/check.
- RESTful endpoints under `/api/v1`.
- Direct-to-storage upload with server-issued signed URLs.
- PWA supports offline queue and retries for uploads.

**Worker 说明**
- Worker 是独立的后台任务进程，用于执行批次检查、导出等耗时任务。
- API 只负责投递任务到队列，Worker 拉取执行并写回结果。

### Testing Strategy
- Unit tests: matching rules, export naming, error handling.
- Integration tests: upload → match → export pipelines.
- E2E tests: critical mobile flows (quick entry, batch export).

### Git Workflow
- Small team workflow; short-lived branches or direct-to-main as needed.
- Clear, descriptive commit messages; no strict convention defined.

## Domain Context
- A **Project** groups related expenses and receipts.
- An **Expense** is a user-entered cost with date/amount/category/note.
- A **Receipt** is an uploaded file (image/PDF).
- Matching is **manual confirm**; 1 receipt → 1 expense by default; 1 expense can have many receipts.
- **Batch** is a filtered set of expenses for export with issue checks.
- Issues include missing receipts, duplicate receipts, and amount mismatches.

## Important Constraints
- Mobile-first experience; PWA must be fast and reliable on 4G.
- Export files are retained for 3 days and then deleted.
- Downloads and exports must be logged for audit.
- No auto-binding receipts without user confirmation.
- Documentation files should stay under 500 LOC; prefer modular docs.

## External Dependencies
- S3-compatible object storage (provider TBD).

