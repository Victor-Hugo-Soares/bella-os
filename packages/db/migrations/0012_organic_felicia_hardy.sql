CREATE TABLE "tab_closures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tab_id" uuid NOT NULL,
	"items_total_cents" bigint NOT NULL,
	"discounts_cents" bigint NOT NULL,
	"service_fee_cents" bigint NOT NULL,
	"couvert_cents" bigint NOT NULL,
	"adjustments_cents" bigint NOT NULL,
	"grand_total_cents" bigint NOT NULL,
	"paid_total_cents" bigint NOT NULL,
	"closed_by" uuid NOT NULL,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tab_closures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tab_closures" ADD CONSTRAINT "tab_closures_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tab_closures" ADD CONSTRAINT "tab_closures_tab_id_tabs_id_fk" FOREIGN KEY ("tab_id") REFERENCES "public"."tabs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tab_closures" ADD CONSTRAINT "tab_closures_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tab_closures_tab_id_key" ON "tab_closures" USING btree ("tab_id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tab_closures" AS PERMISSIVE FOR ALL TO "bella_app" USING ("tab_closures"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tab_closures"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);