## ADDED Requirements
### Requirement: Frontend OCR field ingestion
The system SHALL accept OCR fields from the client and store them with
`ocr_status=ready` and `ocr_source=frontend`.

#### Scenario: Client submits OCR fields
- **WHEN** a client submits OCR amount or date for a receipt
- **THEN** the receipt stores the OCR fields and marks OCR as ready

### Requirement: Cloud OCR fallback via adapter
The system SHALL process receipts with pending OCR via a pluggable adapter
that honors provider preference and records source and confidence.

#### Scenario: Worker processes pending OCR
- **WHEN** the worker processes a receipt with OCR pending
- **THEN** OCR fields are stored and the source provider is recorded

### Requirement: OCR failure is non-blocking
The system SHALL allow receipts to proceed when OCR fails and enable manual edits.

#### Scenario: OCR failure
- **WHEN** OCR processing fails
- **THEN** the receipt OCR status is set to failed and manual editing remains available
