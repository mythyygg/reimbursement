CREATE TABLE IF NOT EXISTS "auth_sessions" (
	"session_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"device_info" text,
	"user_agent" text,
	"ip" text,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "batch_issues" (
	"issue_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"expense_id" uuid,
	"receipt_id" uuid,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "batches" (
	"batch_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"filter_json" jsonb NOT NULL,
	"issue_summary_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "download_logs" (
	"download_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"file_type" text NOT NULL,
	"file_id" uuid NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "expense_receipts" (
	"expense_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "expenses" (
	"expense_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"category" text,
	"note" text NOT NULL,
	"status" text DEFAULT 'missing_receipt' NOT NULL,
	"manual_status" boolean DEFAULT false NOT NULL,
	"client_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "export_records" (
	"export_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"file_url" text,
	"storage_key" text,
	"file_size" integer,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"project_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text,
	"code" text,
	"pinned" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "receipts" (
	"receipt_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"file_url" text,
	"storage_key" text,
	"file_ext" text,
	"file_size" integer,
	"hash" text,
	"client_request_id" text,
	"upload_status" text DEFAULT 'pending' NOT NULL,
	"ocr_status" text DEFAULT 'pending' NOT NULL,
	"ocr_source" text DEFAULT 'none' NOT NULL,
	"ocr_confidence" numeric(4, 2),
	"ocr_amount" numeric(12, 2),
	"ocr_date" timestamp with time zone,
	"merchant_keyword" text,
	"receipt_amount" numeric(12, 2),
	"receipt_date" timestamp with time zone,
	"receipt_type" text,
	"matched_expense_id" uuid,
	"duplicate_flag" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"ocr_enabled" boolean DEFAULT true NOT NULL,
	"ocr_fallback_enabled" boolean DEFAULT true NOT NULL,
	"ocr_provider_preference" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"match_rules_json" jsonb NOT NULL,
	"export_template_json" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "upload_sessions" (
	"upload_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"signed_url" text NOT NULL,
	"expire_at" timestamp with time zone NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"max_size" integer NOT NULL,
	"status" text DEFAULT 'created' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"user_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_or_phone" text NOT NULL,
	"password_hash" text NOT NULL,
	"session_version" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "expense_receipts_receipt_id_key" ON "expense_receipts" USING btree ("receipt_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_or_phone_key" ON "users" USING btree ("email_or_phone");