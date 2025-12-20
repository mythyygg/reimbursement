## ADDED Requirements
### Requirement: Receipt upload flow with signed URLs
The system SHALL create receipt placeholders, issue signed upload URLs,
and complete uploads with file metadata (hash, size, type).

#### Scenario: Complete receipt upload
- **WHEN** a client uploads to a signed URL and posts completion metadata
- **THEN** the receipt is marked uploaded with file metadata stored

### Requirement: Receipt listing and soft deletion
The system SHALL list receipts by project with filters (matched status, OCR status)
and support soft deletion with recoverable records.

#### Scenario: Filter receipts by OCR status
- **WHEN** a user requests receipts with an OCR status filter
- **THEN** only receipts with the requested OCR status are returned

### Requirement: Duplicate detection by hash
The system SHALL detect duplicate receipts within a project by file hash and
surface a non-blocking duplicate flag.

#### Scenario: Duplicate hash detected
- **WHEN** a receipt is completed with a hash matching an existing receipt
- **THEN** the receipt is created and marked as a potential duplicate
