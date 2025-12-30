## ADDED Requirements
### Requirement: Repository quality scripts
The repository SHALL provide root scripts for lint, typecheck, and test across all workspaces.

#### Scenario: Developer runs lint
- **WHEN** `npm run lint` is executed from the repo root
- **THEN** linting MUST run for all workspaces and exit non-zero on failures

### Requirement: CI quality gate
The project SHALL run lint, typecheck, and tests in CI on pull requests and main branch merges.

#### Scenario: Pull request with failing test
- **WHEN** a pull request introduces a failing test
- **THEN** CI MUST fail and block the merge

### Requirement: Baseline automated tests
The project SHALL include automated tests covering at least authentication, export authorization, and shared matching logic.

#### Scenario: Export authorization regression
- **WHEN** a test attempts to create an export with a foreign projectId
- **THEN** the test MUST assert the request is rejected
