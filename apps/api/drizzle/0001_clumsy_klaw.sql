CREATE TABLE "backend_jobs" (
	"job_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "code";--> statement-breakpoint
ALTER TABLE "receipts" DROP COLUMN "ocr_status";--> statement-breakpoint
ALTER TABLE "receipts" DROP COLUMN "ocr_source";--> statement-breakpoint
ALTER TABLE "receipts" DROP COLUMN "ocr_confidence";--> statement-breakpoint
ALTER TABLE "receipts" DROP COLUMN "ocr_amount";--> statement-breakpoint
ALTER TABLE "receipts" DROP COLUMN "ocr_date";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN "ocr_enabled";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN "ocr_fallback_enabled";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN "ocr_provider_preference";