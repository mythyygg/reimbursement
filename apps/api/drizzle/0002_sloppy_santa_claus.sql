ALTER TABLE "export_records" ALTER COLUMN "batch_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "export_records" ADD COLUMN "project_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;