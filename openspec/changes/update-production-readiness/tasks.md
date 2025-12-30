## 1. Security Hardening
- [ ] 1.1 Audit API routes for ownership enforcement; enumerate endpoints needing changes.
- [ ] 1.2 Implement production CORS allowlist with environment configuration.
- [ ] 1.3 Add export ownership validation for project exports.
- [ ] 1.4 Add auth rate limiting and upload size/type validation.
- [ ] 1.5 Add security headers for web and API responses.

## 2. Observability
- [ ] 2.1 Add request ID middleware and structured JSON logs for API.
- [ ] 2.2 Add secret redaction for logs (tokens, passwords, keys).
- [ ] 2.3 Add worker job lifecycle logging with jobId/type/attempt/duration.

## 3. Quality Gates
- [ ] 3.1 Add root scripts for lint, typecheck, and test across workspaces.
- [ ] 3.2 Add CI workflow to run lint/typecheck/test on PRs and main.
- [ ] 3.3 Add baseline automated tests for auth and export authorization paths.

## 4. Deployment and Configuration
- [ ] 4.1 Add env validation for web, api, and worker; add apps/worker/.env.example.
- [ ] 4.2 Update deployment docs with the supported worker runtime and required env vars.
- [ ] 4.3 Validate: run lint/typecheck/tests and smoke-test the API/worker locally.
