## ADDED Requirements
### Requirement: Structured request logging
The API SHALL emit structured JSON logs for each request including requestId, method, path, status, and durationMs.

#### Scenario: Successful request
- **WHEN** a request completes successfully
- **THEN** a log entry MUST include requestId, method, path, status, and durationMs

### Requirement: Secret redaction
Logs MUST NOT include secrets or tokens.

#### Scenario: Login failure
- **WHEN** a login request fails due to invalid credentials
- **THEN** logs MUST NOT include the password or refresh token

### Requirement: Worker job lifecycle logs
The worker SHALL log job start and completion with jobId, type, attempt, and durationMs.

#### Scenario: Export job completes
- **WHEN** an export job completes successfully
- **THEN** the worker MUST log a completion entry with jobId, type, attempt, and durationMs
