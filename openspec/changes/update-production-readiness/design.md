## Context
- The repo includes a Next.js web app, a Hono API, and a long-running worker that polls the database for jobs.
- Current CORS is permissive, export creation has a known ownership TODO, and there is no CI quality gate.
- Deployment docs favor Vercel but do not define a supported runtime for the worker.

## Goals / Non-Goals
- Goals:
  - Establish a production-ready baseline for security, observability, quality gates, and configuration.
  - Keep changes minimal and incremental while covering must-fix items.
  - Provide a clear, documented deployment path for web/api and the worker.
- Non-Goals:
  - Major architecture changes (e.g., queue system migration, auth token redesign).
  - Full compliance programs (SOC2/ISO), unless requested later.

## Decisions
- Deployment baseline: Use Vercel for web+api (serverless) and a long-running Node host (Railway/Render) for the worker. This matches existing docs and the worker polling model.
- Security baseline: Enforce production CORS allowlist, add rate limits on auth endpoints, verify export ownership, add security headers, and validate upload size/type.
- Observability baseline: Adopt structured JSON logs with request IDs and secret redaction; log worker job lifecycle events.
- Quality baseline: Add root scripts and CI for lint/typecheck/test; add minimal automated tests for auth and export authorization.

## Risks / Trade-offs
- CORS allowlist could break existing clients if misconfigured; mitigate with environment-configured allowlist and staged rollout.
- Structured logging adds overhead; mitigate with log levels and sampling where needed.
- Keeping tokens in localStorage retains XSS risk; mitigate with CSP and input sanitization, and revisit cookie-based auth later.

## Migration Plan
- Introduce new env vars for CORS allowlist, rate limit settings, and log level.
- Deploy changes to staging first and validate API/web/worker behavior.
- Roll out CI gating for main after the initial test suite passes.

## Open Questions
- Confirm the preferred worker hosting platform (default: Railway or Render).
- Decide the minimum breadth of automated tests beyond the baseline.
