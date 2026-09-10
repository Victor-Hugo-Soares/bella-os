ALTER TABLE "order_items" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "cancel_stage" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "charge_on_cancel" boolean;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_cancel_stage_check" CHECK ("order_items"."cancel_stage" is null or "order_items"."cancel_stage" in ('before_production', 'after_production'));