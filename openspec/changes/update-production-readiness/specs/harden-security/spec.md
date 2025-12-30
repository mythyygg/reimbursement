## ADDED Requirements
### Requirement: Production CORS allowlist
The API SHALL enforce an explicit CORS allowlist in production and MUST NOT return permissive CORS headers for disallowed origins.

#### Scenario: Disallowed origin in production
- **WHEN** NODE_ENV is "production" and the request Origin is not in the configured allowlist
- **THEN** the response MUST NOT include Access-Control-Allow-Origin and MUST NOT allow credentials

#### Scenario: Allowed origin in production
- **WHEN** NODE_ENV is "production" and the request Origin is in the configured allowlist
- **THEN** the response MUST include Access-Control-Allow-Origin for that origin

### Requirement: Export ownership verification
The API SHALL verify that all project IDs supplied to export creation belong to the authenticated user before creating export records or jobs.

#### Scenario: Foreign project in export request
- **WHEN** an export request includes a projectId not owned by the current user
- **THEN** the API MUST return an authorization error and MUST NOT create an export or backend job

### Requirement: Authentication rate limiting
The API SHALL rate-limit authentication endpoints and token refresh to mitigate brute-force attacks.

#### Scenario: Excessive login attempts
- **WHEN** a client exceeds the configured rate limit for /api/v1/auth/password/login
- **THEN** the API MUST return HTTP 429 and MUST NOT attempt credential verification

### Requirement: Security headers baseline
The web app and API MUST set a baseline of security headers in production.

#### Scenario: Browser request to web app
- **WHEN** a browser requests an HTML page in production
- **THEN** the response MUST include Content-Security-Policy, Referrer-Policy, X-Content-Type-Options, and frame-ancestors restrictions

### Requirement: Upload validation
The API MUST validate receipt uploads for size and mime type before storing objects.

#### Scenario: Oversized upload
- **WHEN** a receipt upload exceeds the configured maximum size
- **THEN** the API MUST reject the request and MUST NOT store the object
