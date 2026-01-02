## 1. Backend - HTML Export Job

- [x] 1.1 Create HTML template for export report
  - Include batch info header (name, date, project)
  - Include expense table with all fields
  - Include receipt thumbnails per expense with click-to-enlarge
  - Add modal/lightbox component for viewing full-size images and PDFs
  - Add print-friendly CSS styles

- [x] 1.2 Implement image processing for receipts
  - Fetch receipt files from S3
  - Generate thumbnails (150px width) for images
  - Generate PDF first-page thumbnails using pdf-lib or similar
  - Convert both thumbnails and originals to Base64
  - Compress images if needed

- [x] 1.3 Update `apps/api/src/worker/jobs/export.ts`
  - Add `processHtmlExport()` function
  - Remove CSV/ZIP specific code paths
  - Generate self-contained HTML file
  - Upload to S3 with `.html` extension

## 2. Backend - API Routes

- [x] 2.1 Update `apps/api/src/routes/exports.ts`
  - Change export type enum from `csv|zip|pdf` to `html` only
  - Update validation schema
  - Keep existing status polling and download URL logic

- [x] 2.2 Add batch exports list endpoint (if not exists)
  - `GET /batches/:batchId/exports` - list exports for a batch
  - Already exists in `apps/api/src/routes/batches.ts`

## 3. Frontend - UI Changes

- [x] 3.1 Update `apps/web/app/projects/[projectId]/batches/page.tsx`
  - Add export creation button on each batch card
  - Add download button when export is ready
  - Show export status inline (pending/running/done)
  - Remove link to detail page

- [x] 3.2 Remove `apps/web/app/batches/[batchId]/page.tsx`
  - Delete the file
  - Ensure no broken links

- [x] 3.3 Update export-related API calls
  - Change export type from `zip|csv` to `html`
  - Simplify UI to single export action

## 4. Cleanup

- [x] 4.1 Remove unused code
  - Remove CSV generation functions
  - Remove ZIP archive functions
  - Remove YAML index generation
  - Update `packages/shared/src/utils/exportNaming.ts` if needed

- [x] 4.2 Update tests
  - Update `apps/api/tests/export-authorization.test.ts` - no changes needed
  - Update `packages/shared/tests/exportNaming.test.ts` - no changes needed

## 5. Validation

- [ ] 5.1 Test HTML export end-to-end
  - Create batch with expenses and receipts
  - Trigger export
  - Download and verify HTML content
  - Test print preview

- [ ] 5.2 Test edge cases
  - Export with no receipts
  - Export with PDF receipts
  - Export with many items (performance)
