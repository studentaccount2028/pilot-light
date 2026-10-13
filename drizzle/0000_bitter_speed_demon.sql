CREATE TYPE "public"."alert_kind" AS ENUM('h6', 'h2', 'h0', 'help', 'all_clear');--> statement-breakpoint
CREATE TYPE "public"."contact_channel" AS ENUM('sms', 'voice', 'both');--> statement-breakpoint
CREATE TYPE "public"."device_type" AS ENUM('o2_concentrator', 'cpap', 'power_chair', 'home_dialysis', 'fridge_meds', 'electric_heat');--> statement-breakpoint
CREATE TYPE "public"."heartbeat_source" AS ENUM('pwa', 'replay');--> statement-breakpoint
CREATE TYPE "public"."send_channel" AS ENUM('sms', 'voice');--> statement-breakpoint
CREATE TYPE "public"."household_status" AS ENUM('normal', 'warning_active', 'probable_outage', 'countdown', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."utility" AS ENUM('eversource', 'unitil', 'liberty', 'nhec', 'other');--> statement-breakpoint
CREATE TABLE "alerts_sent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"outage_inferred_at" timestamp with time zone NOT NULL,
	"threshold" "alert_kind" NOT NULL,
	"contact_id" uuid NOT NULL,
	"channel" "send_channel" NOT NULL,
	"body" text NOT NULL,
	"twilio_sid" text,
	"attempt_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"ack_at" timestamp with time zone,
	"ack_body" text
);
--> statement-breakpoint
CREATE TABLE "app_clock" (
	"id" integer PRIMARY KEY NOT NULL,
	"replay_active" boolean DEFAULT false NOT NULL,
	"multiplier" double precision DEFAULT 1 NOT NULL,
	"anchor_real" timestamp with time zone DEFAULT now() NOT NULL,
	"anchor_sim" timestamp with time zone DEFAULT now() NOT NULL,
	"scenario_id" text,
	"household_id" uuid,
	"prev_last_heartbeat_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"channel" "contact_channel" NOT NULL,
	"priority" integer NOT NULL,
	"is_town_volunteer" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"type" "device_type" NOT NULL,
	"label" text NOT NULL,
	"backup_hours" double precision,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"household_id" uuid,
	"at" timestamp with time zone NOT NULL,
	"real_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"data" jsonb
);
--> statement-breakpoint
CREATE TABLE "heartbeats" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"battery_pct" integer,
	"source" "heartbeat_source" DEFAULT 'pwa' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household_state" (
	"household_id" uuid PRIMARY KEY NOT NULL,
	"status" "household_status" DEFAULT 'normal' NOT NULL,
	"outage_inferred_at" timestamp with time zone,
	"countdown_zero_at" timestamp with time zone,
	"last_heartbeat_at" timestamp with time zone,
	"active_alert_id" text,
	"resolved_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"address" text NOT NULL,
	"town" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"nws_zone" text NOT NULL,
	"zone_name" text,
	"utility" "utility" NOT NULL,
	"registered_with_utility" boolean DEFAULT false NOT NULL,
	"share_with_town" boolean DEFAULT false NOT NULL,
	"owner_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nws_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"zones" text[] NOT NULL,
	"onset" timestamp with time zone NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	"severity" text,
	"headline" text,
	"raw" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"replay" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replay_scenarios" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"alert_json" jsonb NOT NULL,
	"heartbeat_script" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerts_sent" ADD CONSTRAINT "alerts_sent_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts_sent" ADD CONSTRAINT "alerts_sent_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heartbeats" ADD CONSTRAINT "heartbeats_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_state" ADD CONSTRAINT "household_state_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_sent_idempotency" ON "alerts_sent" USING btree ("household_id","outage_inferred_at","threshold","contact_id","channel");--> statement-breakpoint
CREATE INDEX "events_household_id" ON "events" USING btree ("household_id","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "heartbeats_household_at" ON "heartbeats" USING btree ("household_id","at" DESC NULLS LAST);