CREATE TABLE "knowledge_libraries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"library_type" varchar(32) NOT NULL,
	"workspace_id" uuid,
	"slug" varchar(160) NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"managed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workspace_library_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"library_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"search_enabled" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "citation_anchors" ALTER COLUMN "workspace_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "document_chunks" ALTER COLUMN "workspace_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "workspace_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "citation_anchors" ADD COLUMN "library_id" uuid;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "library_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "library_id" uuid;--> statement-breakpoint
ALTER TABLE "message_citations" ADD COLUMN "library_id" uuid;--> statement-breakpoint
ALTER TABLE "message_citations" ADD COLUMN "source_scope" varchar(32);--> statement-breakpoint
ALTER TABLE "message_citations" ADD COLUMN "library_title_snapshot" text;--> statement-breakpoint
ALTER TABLE "retrieval_runs" ADD COLUMN "searched_library_ids_json" jsonb;--> statement-breakpoint
ALTER TABLE "workspace_directories" ADD COLUMN "library_id" uuid;--> statement-breakpoint
ALTER TABLE "knowledge_libraries" ADD CONSTRAINT "knowledge_libraries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_libraries" ADD CONSTRAINT "knowledge_libraries_managed_by_user_id_users_id_fk" FOREIGN KEY ("managed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_library_subscriptions" ADD CONSTRAINT "workspace_library_subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_library_subscriptions" ADD CONSTRAINT "workspace_library_subscriptions_library_id_knowledge_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."knowledge_libraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_library_subscriptions" ADD CONSTRAINT "workspace_library_subscriptions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_libraries_slug_uid" ON "knowledge_libraries" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_libraries_workspace_type_uid" ON "knowledge_libraries" USING btree ("workspace_id","library_type");--> statement-breakpoint
CREATE INDEX "knowledge_libraries_workspace_idx" ON "knowledge_libraries" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "knowledge_libraries_type_status_idx" ON "knowledge_libraries" USING btree ("library_type","status");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_library_subscriptions_workspace_library_uid" ON "workspace_library_subscriptions" USING btree ("workspace_id","library_id");--> statement-breakpoint
CREATE INDEX "workspace_library_subscriptions_workspace_status_idx" ON "workspace_library_subscriptions" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "workspace_library_subscriptions_library_status_idx" ON "workspace_library_subscriptions" USING btree ("library_id","status");--> statement-breakpoint
ALTER TABLE "citation_anchors" ADD CONSTRAINT "citation_anchors_library_id_knowledge_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."knowledge_libraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_library_id_knowledge_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."knowledge_libraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_library_id_knowledge_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."knowledge_libraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_citations" ADD CONSTRAINT "message_citations_library_id_knowledge_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."knowledge_libraries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_directories" ADD CONSTRAINT "workspace_directories_library_id_knowledge_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."knowledge_libraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "citation_anchors_library_idx" ON "citation_anchors" USING btree ("library_id");--> statement-breakpoint
CREATE INDEX "document_chunks_library_idx" ON "document_chunks" USING btree ("library_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_library_path_uid" ON "documents" USING btree ("library_id","logical_path");--> statement-breakpoint
CREATE INDEX "documents_library_dir_idx" ON "documents" USING btree ("library_id","directory_path");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_directories_library_path_uid" ON "workspace_directories" USING btree ("library_id","path");