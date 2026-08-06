CREATE TABLE "delivery_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"response_status" integer,
	"error_code" text,
	"safe_error_message" text,
	"response_headers_redacted" jsonb
);
--> statement-breakpoint
ALTER TABLE "activity_events" ADD COLUMN "attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "destination_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "payload_encrypted" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_attempts_event_id_attempt_number_unique" ON "delivery_attempts" USING btree ("event_id","attempt_number");--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_attempt_id_delivery_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."delivery_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_destination_id_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."destinations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION protect_completed_delivery_attempt() RETURNS trigger AS $$
BEGIN
	IF OLD.status <> 'RUNNING' THEN
		RAISE EXCEPTION 'completed delivery attempts are append-only';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER delivery_attempts_append_only
BEFORE UPDATE ON "delivery_attempts"
FOR EACH ROW EXECUTE FUNCTION protect_completed_delivery_attempt();
