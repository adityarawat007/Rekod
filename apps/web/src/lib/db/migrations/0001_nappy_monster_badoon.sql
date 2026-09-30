ALTER TABLE "rekod"."user" ADD COLUMN "plan" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "rekod"."user" ADD COLUMN "video_limit" integer DEFAULT 20 NOT NULL;