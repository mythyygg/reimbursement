## ADDED Requirements
### Requirement: Create expenses with defaults and idempotency
The system SHALL allow users to create expenses under a project with amount and note,
set default date to today, default status to `missing_receipt`, and honor `client_request_id` idempotency.

#### Scenario: Create expense defaults
- **WHEN** a user creates an expense with amount and note only
- **THEN** the expense is stored with today's date and status `missing_receipt`

#### Scenario: Idempotent create
- **WHEN** a duplicate request with the same `client_request_id` is submitted
- **THEN** the system returns the existing expense without creating a new record

### Requirement: Update expense fields and status
The system SHALL allow users to update date, amount, category, note, and status,
including setting `no_receipt_required` with a manual flag.

#### Scenario: Mark expense as no receipt required
- **WHEN** a user sets status to `no_receipt_required`
- **THEN** the expense status is updated and marked as manual

### Requirement: List and filter expenses
The system SHALL list expenses with filters for status, category, and date range,
and sort by date with a stable secondary order.

#### Scenario: Filter by status and date range
- **WHEN** a user requests expenses filtered by status and date range
- **THEN** only matching expenses are returned
