CREATE TYPE "public"."ems_status" AS ENUM('assigned', 'en_route', 'on_scene', 'sheltered', 'transported', 'cleared');--> statement-breakpoint
CREATE TABLE "ems_updates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"incident_at" timestamp with time zone NOT NULL,
	"status" "ems_status" NOT NULL,
	"unit" text,
	"note" text,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "link_key" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "access_notes" text;--> statement-breakpoint
ALTER TABLE "ems_updates" ADD CONSTRAINT "ems_updates_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ems_updates_household" ON "ems_updates" USING btree ("household_id","incident_at","id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_link_key_unique" UNIQUE("link_key");