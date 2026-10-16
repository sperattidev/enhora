ALTER TYPE "public"."offer_status" ADD VALUE 'WITHDRAWN';--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "searching_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "assigned_at" timestamp with time zone;--> statement-breakpoint
UPDATE "jobs" SET "searching_since" = "created_at" WHERE "status" = 'SEARCHING';
