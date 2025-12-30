## 1. Security Hardening
- [x] 1.1 Audit API routes for ownership enforcement; enumerate endpoints needing changes.
- [x] 1.2 Implement production CORS allowlist with environment configuration.
- [x] 1.3 Add export ownership validation for project exports.
- [x] 1.4 Add auth rate limiting and upload size/type validation.
- [x] 1.5 Add security headers for web and API responses.

## 2. Observability
- [x] 2.1 Add request ID middleware and structured JSON logs for API.
- [x] 2.2 Add secret redaction for logs (tokens, passwords, keys).
- [x] 2.3 Add worker job lifecycle logging with jobId/type/attempt/duration.

## 3. Quality Gates
- [x] 3.1 Add root scripts for lint, typecheck, and test across workspaces.
- [x] 3.2 Add CI workflow to run lint/typecheck/test on PRs and main.
- [x] 3.3 Add baseline automated tests for auth and export authorization paths.

## 4. Deployment and Configuration
- [x] 4.1 Add env validation for web and api+worker; update env examples.
- [x] 4.2 Update deployment docs with the supported API+worker runtime (Clawcloud) and required env vars.
- [x] 4.3 Validate: run lint/typecheck/tests and smoke-test the API/worker locally.
