CREATE TABLE "service_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"table_session_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by_guest_id" uuid,
	"handled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_requests_kind_check" CHECK ("service_requests"."kind" in ('call_waiter', 'request_bill', 'other')),
	CONSTRAINT "service_requests_status_check" CHECK ("service_requests"."status" in ('open', 'acknowledged', 'done'))
);
--> statement-breakpoint
ALTER TABLE "service_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_table_session_id_table_sessions_id_fk" FOREIGN KEY ("table_session_id") REFERENCES "public"."table_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "service_requests" AS PERMISSIVE FOR ALL TO "bella_app" USING ("service_requests"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("service_requests"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);