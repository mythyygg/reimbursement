## ADDED Requirements

### Requirement: HTML Export Report

The system SHALL generate a self-contained HTML report when user requests an export.

#### Scenario: User downloads export from batch list
- **WHEN** user clicks "下载导出文件" button on a batch card
- **THEN** system creates an export job if none exists or is pending/running
- **THEN** system shows export progress inline on the batch card
- **WHEN** export completes
- **THEN** system shows download button on the batch card
- **WHEN** user clicks download button
- **THEN** system downloads the HTML file to user's device

#### Scenario: HTML report contains complete expense information
- **GIVEN** a batch with expenses and receipts
- **WHEN** HTML export is generated
- **THEN** the report includes batch header with name, creation date, and project name
- **THEN** the report includes expense table with columns: sequence, date, amount, category, note, status
- **THEN** each expense shows its associated receipt images inline
- **THEN** the report is styled for both screen viewing and printing

#### Scenario: Receipt images are displayed as thumbnails with click-to-enlarge
- **GIVEN** expenses with image receipts (jpg, png, etc.)
- **WHEN** HTML export is generated
- **THEN** receipt images are displayed as thumbnails (approximately 150px width)
- **THEN** clicking a thumbnail opens a modal showing the full-size image
- **THEN** the modal can be closed by clicking outside or pressing escape
- **THEN** all images are embedded as Base64 for offline viewing

#### Scenario: PDF receipts are displayed as thumbnails with click-to-view
- **GIVEN** expenses with PDF receipts
- **WHEN** HTML export is generated
- **THEN** PDF first page is rendered as a thumbnail image
- **THEN** clicking the thumbnail opens a modal showing the full PDF
- **THEN** the PDF content is embedded as Base64 data URL for offline viewing

### Requirement: Simplified Export Flow

The system SHALL provide export functionality directly from the batch list without requiring navigation to a detail page.

#### Scenario: No detail page navigation required
- **GIVEN** user is on the project's batch list page
- **WHEN** user wants to export a batch
- **THEN** all export actions are available on the list page
- **THEN** no navigation to a separate detail page is required

#### Scenario: Export status shown on batch card
- **GIVEN** user initiated an export for a batch
- **WHEN** export is in progress (pending or running)
- **THEN** the batch card shows the current status
- **WHEN** export completes successfully
- **THEN** the batch card shows download button
- **WHEN** export fails
- **THEN** the batch card shows error state with retry option

## REMOVED Requirements

### Requirement: ZIP and CSV Export Formats

**Reason**: Simplified to single HTML format that provides better user experience.

**Migration**: Users should use HTML export which includes all expense data and receipt images in a viewable format. For spreadsheet needs, users can copy data from the HTML table or request a future CSV export feature.

### Requirement: Export Detail Page

**Reason**: Export actions are now available directly on the batch list page.

**Migration**: Users access export functionality from the batch list page instead of navigating to a separate detail page.
