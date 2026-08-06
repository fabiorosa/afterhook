ALTER TABLE "destinations" ADD COLUMN "demo_key" text;--> statement-breakpoint
ALTER TABLE "endpoints" ADD COLUMN "demo_key" text;--> statement-breakpoint
ALTER TABLE "destinations" ADD CONSTRAINT "destinations_demo_key_unique" UNIQUE("demo_key");--> statement-breakpoint
ALTER TABLE "endpoints" ADD CONSTRAINT "endpoints_demo_key_unique" UNIQUE("demo_key");