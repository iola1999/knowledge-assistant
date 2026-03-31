CREATE TABLE "llm_model_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_type" varchar(32) DEFAULT 'anthropic' NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"model_name" varchar(160) NOT NULL,
	"base_url" text NOT NULL,
	"api_key" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "model_profile_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "llm_model_profiles_single_default_uid" ON "llm_model_profiles" USING btree ("is_default") WHERE "llm_model_profiles"."is_default" = true;--> statement-breakpoint
CREATE INDEX "llm_model_profiles_enabled_default_idx" ON "llm_model_profiles" USING btree ("enabled","is_default");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_model_profile_id_llm_model_profiles_id_fk" FOREIGN KEY ("model_profile_id") REFERENCES "public"."llm_model_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_model_profile_idx" ON "conversations" USING btree ("model_profile_id");