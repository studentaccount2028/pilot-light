CREATE TYPE "public"."user_role" AS ENUM('member', 'ems', 'coordinator', 'admin');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"action" text NOT NULL,
	"actor" text NOT NULL,
	"household_id" uuid,
	"detail" text,
	"ip_hash" text
);
--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "heartbeat_token_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "staff_town" text;--> statement-breakpoint
CREATE INDEX "audit_household_at" ON "audit_log" USING btree ("household_id","at");--> statement-breakpoint
CREATE INDEX "audit_at" ON "audit_log" USING btree ("at");