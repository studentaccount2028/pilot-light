ALTER TABLE "alerts_sent" ADD COLUMN "eta_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "alerts_sent" ADD COLUMN "arrived_at" timestamp with time zone;