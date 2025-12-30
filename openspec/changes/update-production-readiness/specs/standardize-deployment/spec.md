## ADDED Requirements
### Requirement: Environment configuration validation
Each runtime (web, api, worker) SHALL validate required environment variables at startup or build time and fail fast with clear errors.

#### Scenario: Missing database URL
- **WHEN** DATABASE_URL is missing in the api or worker runtime
- **THEN** the process MUST exit with a clear error before accepting traffic or processing jobs

### Requirement: Environment examples and docs
Each runtime SHALL provide an .env.example and documentation listing required variables and startup commands.

#### Scenario: New developer setup
- **WHEN** a developer follows the setup documentation for the worker
- **THEN** an .env.example and the docs MUST describe required variables and the start command

### Requirement: Production deployment baseline
The project SHALL document a supported production deployment path for web/api and the worker.

#### Scenario: Production setup
- **WHEN** an operator reads the deployment guide
- **THEN** it MUST describe how to deploy web/api and the worker separately and how to run migrations
