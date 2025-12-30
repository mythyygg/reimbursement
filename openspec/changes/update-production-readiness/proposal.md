# Change: Update production readiness baseline

## Why
The system ships core functionality but lacks several production-ready safeguards (CORS allowlist, export ownership checks, CI quality gates, and clear worker deployment guidance). This change establishes a minimal, modern baseline so the app can be safely deployed and operated.

## What Changes
- Add security hardening requirements (CORS allowlist, rate limiting, export ownership checks, security headers, upload validation).
- Add observability requirements (structured request logs, secret redaction, worker job lifecycle logs).
- Add quality gates (repo scripts and CI for lint/typecheck/tests, baseline automated tests).
- Standardize deployment and configuration validation (env validation, worker .env.example, updated deployment docs).

## Impact
- Affected specs: harden-security, improve-observability, add-quality-gates, standardize-deployment
- Affected code: apps/api, apps/web, apps/worker, packages/shared, docs, CI pipeline
