ALTER TABLE "household_state" ADD COLUMN "prompt_alert_id" text;--> statement-breakpoint
ALTER TABLE "household_state" ADD COLUMN "prompt_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "household_state" ADD COLUMN "prompt_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "household_state" ADD COLUMN "prompt_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "resident_name" text;--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "resident_phone" text;--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "resident_channel" "contact_channel";--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "resident_birth_year" integer;--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "lives_alone" boolean;--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "can_leave_unassisted" boolean;--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "can_reach_backup" boolean;