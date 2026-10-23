CREATE TABLE "approval_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL,
  "requester_id" text NOT NULL,
  "requester_reason" text NOT NULL,
  "state" text DEFAULT 'PENDING' NOT NULL,
  "approver_id" text,
  "decision_reason" text,
  "expires_at" timestamp with time zone NOT NULL,
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "approval_requests_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "approval_requests_one_pending_per_event" ON "approval_requests" USING btree ("event_id") WHERE "approval_requests"."state" = 'PENDING';
