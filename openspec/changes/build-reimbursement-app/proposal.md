# Change: Build reimbursement prep application (remove WeChat login)

## Why
The project needs a full end-to-end implementation aligned with the PRD and UI prototypes.
WeChat login is out of scope, so documentation and implementation must reflect password-only auth.

## What Changes
- Scaffold the fullstack app: Next.js web, Hono API, BullMQ worker, shared types.
- Implement password auth with access/refresh tokens, session tracking, and logout flows.
- Implement projects, expenses, receipts, matching, batches, exports, and settings.
- Implement OCR frontend parsing plus a configurable cloud OCR fallback adapter.
- Implement PWA offline queue for expense creation and receipt uploads.
- Update docs and OpenAPI to remove WeChat login references.

## Impact
- Affected specs: auth-session, project-management, expense-management, receipt-management,
  receipt-matching, ocr-processing, batch-export, user-settings, offline-queue.
- Affected code: apps/web, apps/api, apps/worker, packages/shared, docs/*, docs/openapi/*.
