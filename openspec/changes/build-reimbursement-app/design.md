## Context
This change delivers the full reimbursement prep application described in the PRD and UI prototypes.
Implementation follows the documented stack (Next.js, Hono, Drizzle, BullMQ, Postgres, S3).
WeChat OAuth is removed from scope and must be deleted from docs and APIs.

## Goals / Non-Goals
- Goals:
  - Ship the complete workflow: projects, expenses, receipts, matching, batches, exports.
  - Support PWA offline queue for expense creation and receipt uploads.
  - Provide OCR with a frontend parser and a pluggable cloud fallback adapter.
- Non-Goals:
  - WeChat OAuth login.
  - Auto-matching without user confirmation.

## Decisions
- Monorepo layout: `apps/web`, `apps/api`, `apps/worker`, `packages/shared`.
- Auth: password-only login with access/refresh tokens and server-side sessions.
- OCR: frontend OCR writes `ocr_*` fields; worker fallback uses provider adapters
  with a default placeholder configuration.
- Exports: worker generates CSV/ZIP/PDF, stores results in object storage,
  and enforces 3-day retention.
- Offline queue: IndexedDB-backed queue with idempotency keys for retries.

## Alternatives considered
- Single-process API + cron jobs for OCR/export (rejected; needs durable queues).
- Server-side OCR only (rejected; must prefer frontend OCR per PRD).

## Risks / Trade-offs
- Offline queue synchronization adds complexity; mitigate with clear queue states and
  idempotent endpoints.
- OCR provider uncertainty; mitigate with adapter interface and feature flags.

## Migration Plan
- No data migrations beyond initial schema creation.
- Environment variables for storage, JWT, and OCR providers are required for runtime.

## Open Questions
- Final cloud OCR provider selection and credentials.
- Deployment target for Postgres, Redis, and S3-compatible storage.
