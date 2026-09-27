CREATE SCHEMA "rekod";
--> statement-breakpoint
CREATE TABLE "rekod"."account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rekod"."comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"report_id" uuid NOT NULL,
	"workspace_id" text NOT NULL,
	"author_id" text,
	"body" text NOT NULL,
	"timestamp_ms" integer,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rekod"."invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rekod"."member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rekod"."organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"created_at" timestamp NOT NULL,
	"metadata" text,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "rekod"."report_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"report_id" uuid NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"size_bytes" bigint,
	"mime_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rekod"."reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"created_by" text,
	"title" text DEFAULT '' NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"page_url" text,
	"project" text,
	"t0" bigint NOT NULL,
	"duration_ms" integer,
	"env" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"share_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_share_token_unique" UNIQUE("share_token")
);
--> statement-breakpoint
CREATE TABLE "rekod"."session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "rekod"."user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "rekod"."verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rekod"."account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "rekod"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rekod"."comments" ADD CONSTRAINT "comments_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "rekod"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rekod"."comments" ADD CONSTRAINT "comments_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "rekod"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rekod"."comments" ADD CONSTRAINT "comments_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "rekod"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rekod"."invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "rekod"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rekod"."invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "rekod"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rekod"."member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "rekod"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rekod"."member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "rekod"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rekod"."report_assets" ADD CONSTRAINT "report_assets_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "rekod"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rekod"."report_assets" ADD CONSTRAINT "report_assets_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "rekod"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rekod"."reports" ADD CONSTRAINT "reports_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "rekod"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rekod"."reports" ADD CONSTRAINT "reports_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "rekod"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rekod"."session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "rekod"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "rekod"."account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "comments_report_created_idx" ON "rekod"."comments" USING btree ("report_id","created_at");--> statement-breakpoint
CREATE INDEX "invitation_organization_id_idx" ON "rekod"."invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "rekod"."invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_organization_id_idx" ON "rekod"."member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_user_id_idx" ON "rekod"."member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "report_assets_report_idx" ON "rekod"."report_assets" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "reports_workspace_created_idx" ON "rekod"."reports" USING btree ("workspace_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "rekod"."session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "rekod"."verification" USING btree ("identifier");