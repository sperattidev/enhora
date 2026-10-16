CREATE TABLE "pricing_rules" (
	"city_id" uuid PRIMARY KEY NOT NULL,
	"extra_stop_fee_cents" bigint NOT NULL,
	"errand_fee_cents" bigint NOT NULL,
	"surcharge_bps" integer DEFAULT 0 NOT NULL,
	"round_to_cents" integer DEFAULT 0 NOT NULL,
	"free_wait_minutes" integer NOT NULL,
	"wait_fee_per_minute_cents" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_merchant_idempotency_uq" ON "jobs" USING btree ("merchant_id","idempotency_key") WHERE "jobs"."idempotency_key" is not null;