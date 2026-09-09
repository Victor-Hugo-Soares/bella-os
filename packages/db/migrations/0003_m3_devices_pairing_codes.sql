CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"station_ids" jsonb,
	"cash_register_id" uuid,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_kind_check" CHECK ("devices"."kind" in ('kds', 'cashier', 'floor', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "pairing_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"device_kind" text NOT NULL,
	"device_name" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pairing_codes_device_kind_check" CHECK ("pairing_codes"."device_kind" in ('kds', 'cashier', 'floor', 'admin'))
);
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD CONSTRAINT "pairing_codes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "devices_token_hash_key" ON "devices" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "devices_tenant_id_idx" ON "devices" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pairing_codes_code_key" ON "pairing_codes" USING btree ("code") WHERE "pairing_codes"."used_at" is null;--> statement-breakpoint
CREATE INDEX "pairing_codes_tenant_id_idx" ON "pairing_codes" USING btree ("tenant_id");