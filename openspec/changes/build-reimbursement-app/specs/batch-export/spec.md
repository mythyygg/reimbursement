## ADDED Requirements
### Requirement: Batch creation and issue checks
The system SHALL create batches from project filters and compute issues
including missing receipts, duplicate hashes, and amount mismatches.

#### Scenario: Batch check returns issue summary
- **WHEN** a batch check is executed
- **THEN** the system returns issue counts and grouped issue lists

### Requirement: Export records and file generation
The system SHALL generate CSV, ZIP, and optional PDF exports via worker jobs,
store export records with status, and retain files for 3 days.

#### Scenario: Export generation succeeds
- **WHEN** an export job completes
- **THEN** the export record is updated with file URL, size, and expiry

### Requirement: CSV and ZIP naming rules
The system SHALL generate CSV with UTF-8 BOM, RFC4180 escaping, and
ZIP filenames aligned to CSV sequence numbers including sub-letter suffixes
for multiple receipts per expense.

#### Scenario: Multiple receipts in one expense
- **WHEN** an expense has multiple receipts
- **THEN** ZIP filenames include sequence suffixes (e.g., 001a, 001b) and CSV lists filenames

### Requirement: Export and download logging
The system SHALL log export creation and download requests with user and device metadata.

#### Scenario: Export download requested
- **WHEN** a user requests a download URL
- **THEN** a download log entry is recorded
