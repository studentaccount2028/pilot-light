CREATE TABLE "sensor_readings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"sensor_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"mains" boolean,
	"mains_volts" double precision,
	"charging" boolean,
	"battery_pct" double precision,
	"battery_volts" double precision,
	"capacity_wh" double precision,
	"health_pct" double precision,
	"cycles" integer,
	"output_watts" double precision,
	"temp_c" double precision,
	"signal_dbm" integer,
	"simulated" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sensors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"label" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "sensors_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "sensor_readings" ADD CONSTRAINT "sensor_readings_sensor_id_sensors_id_fk" FOREIGN KEY ("sensor_id") REFERENCES "public"."sensors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensors" ADD CONSTRAINT "sensors_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sensor_readings_sensor_at" ON "sensor_readings" USING btree ("sensor_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sensors_household" ON "sensors" USING btree ("household_id");