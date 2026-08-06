ALTER TABLE "delivery_attempts" ALTER COLUMN "started_at" DROP NOT NULL;--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_completed_delivery_attempt() RETURNS trigger AS $$
BEGIN
	IF OLD.status = 'SCHEDULED' THEN
		IF NEW.status <> 'RUNNING'
			OR NEW.started_at IS NULL
			OR NEW.id IS DISTINCT FROM OLD.id
			OR NEW.event_id IS DISTINCT FROM OLD.event_id
			OR NEW.attempt_number IS DISTINCT FROM OLD.attempt_number
			OR NEW.trigger IS DISTINCT FROM OLD.trigger
			OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
		THEN
			RAISE EXCEPTION 'scheduled delivery attempts may only start';
		END IF;
	ELSIF OLD.status <> 'RUNNING' THEN
		RAISE EXCEPTION 'completed delivery attempts are append-only';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
