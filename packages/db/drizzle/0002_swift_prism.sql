CREATE TABLE "conversation_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"conversation_id" uuid,
	"draft_upload_id" varchar(64),
	"document_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "conversation_attachments" ADD CONSTRAINT "conversation_attachments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_attachments" ADD CONSTRAINT "conversation_attachments_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_attachments" ADD CONSTRAINT "conversation_attachments_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_attachments" ADD CONSTRAINT "conversation_attachments_document_version_id_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_attachments_conversation_idx" ON "conversation_attachments" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "conversation_attachments_draft_idx" ON "conversation_attachments" USING btree ("draft_upload_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_attachments_version_uid" ON "conversation_attachments" USING btree ("document_version_id");