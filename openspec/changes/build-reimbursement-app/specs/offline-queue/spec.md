## ADDED Requirements
### Requirement: Offline queue for critical actions
The system SHALL provide a client-side offline queue for expense creation
and receipt uploads with durable persistence.

#### Scenario: Queue while offline
- **WHEN** a user creates an expense while offline
- **THEN** the request is queued locally and sent when connectivity returns

### Requirement: Retry and idempotency support
The system SHALL retry queued items with backoff and use idempotency keys
so retries do not create duplicates.

#### Scenario: Retry queued expense
- **WHEN** a queued expense request is retried after reconnect
- **THEN** the server processes it once and returns the created expense
