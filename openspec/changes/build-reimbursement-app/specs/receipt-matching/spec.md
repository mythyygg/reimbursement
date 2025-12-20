## ADDED Requirements
### Requirement: Manual receipt matching with integrity rules
The system SHALL allow users to manually match a receipt to an expense,
ensuring one receipt matches at most one expense while an expense may have many receipts.

#### Scenario: Match receipt to expense
- **WHEN** a user confirms a match between a receipt and an expense
- **THEN** the receipt is linked to the expense and cannot be matched elsewhere

### Requirement: Unmatch restores state
The system SHALL allow users to unmatch receipts and recalculate expense status.

#### Scenario: Unmatch receipt
- **WHEN** a user unmatches a receipt from an expense
- **THEN** the association is removed and the expense status is recalculated

### Requirement: Candidate suggestions
The system SHALL provide up to three candidate expenses for a receipt
based on amount, date proximity, and category hints with confidence labels.

#### Scenario: Suggestions available
- **WHEN** OCR or receipt fields are present for a receipt
- **THEN** up to three candidate expenses with confidence labels are returned
