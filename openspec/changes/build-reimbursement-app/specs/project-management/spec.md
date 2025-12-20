## ADDED Requirements
### Requirement: Create and update projects
The system SHALL allow users to create and update projects with either a name or a code
(where at least one is required), and optionally set pinned and archived states.

#### Scenario: Create project with name
- **WHEN** a user submits a new project with a name
- **THEN** the project is created and returned in the project list

### Requirement: List, search, and filter projects
The system SHALL list projects for a user with search and filters for pinned and archived.

#### Scenario: Search by name or code
- **WHEN** a user searches with a query string
- **THEN** only projects whose name or code matches the query are returned

### Requirement: Archive hides projects by default
The system SHALL exclude archived projects from default lists unless explicitly requested.

#### Scenario: Default list excludes archived projects
- **WHEN** a user requests the project list without an archived filter
- **THEN** archived projects are not included in the response
