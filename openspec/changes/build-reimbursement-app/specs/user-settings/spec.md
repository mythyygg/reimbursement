## ADDED Requirements
### Requirement: User settings storage
The system SHALL store per-user settings for OCR enablement, match rules,
and export templates.

#### Scenario: Update OCR settings
- **WHEN** a user updates OCR settings
- **THEN** the settings are stored and returned on subsequent reads

### Requirement: Settings validation
The system SHALL validate settings fields such as date window and amount tolerance.

#### Scenario: Invalid settings rejected
- **WHEN** a user submits an invalid amount tolerance
- **THEN** the system rejects the update with a validation error
