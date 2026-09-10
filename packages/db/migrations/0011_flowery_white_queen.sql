CREATE TABLE "cash_divergences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"cash_session_id" uuid NOT NULL,
	"method" text NOT NULL,
	"expected_cents" bigint NOT NULL,
	"counted_cents" bigint NOT NULL,
	"difference_cents" bigint NOT NULL,
	"reason" text,
	"acknowledged_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_divergences_method_check" CHECK ("cash_divergences"."method" in ('cash', 'debit', 'credit', 'pix', 'voucher', 'other'))
);
--> statement-breakpoint
ALTER TABLE "cash_divergences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"cash_session_id" uuid NOT NULL,
	"type" text NOT NULL,
	"method" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"reason" text NOT NULL,
	"by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_movements_type_check" CHECK ("cash_movements"."type" in ('withdrawal', 'deposit', 'adjustment')),
	CONSTRAINT "cash_movements_method_check" CHECK ("cash_movements"."method" in ('cash', 'debit', 'credit', 'pix', 'voucher', 'other')),
	CONSTRAINT "cash_movements_amount_cents_check" CHECK ("cash_movements"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "cash_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cash_divergences" ADD CONSTRAINT "cash_divergences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_divergences" ADD CONSTRAINT "cash_divergences_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_divergences" ADD CONSTRAINT "cash_divergences_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_by_user_id_users_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "cash_divergences" AS PERMISSIVE FOR ALL TO "bella_app" USING ("cash_divergences"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("cash_divergences"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "cash_movements" AS PERMISSIVE FOR ALL TO "bella_app" USING ("cash_movements"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("cash_movements"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);