import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const endpoints = pgTable("endpoints", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  secretEncrypted: text("secret_encrypted").notNull(),
  secretFingerprint: text("secret_fingerprint").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const destinations = pgTable("destinations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  authorizationEncrypted: text("authorization_encrypted"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => endpoints.id, { onDelete: "restrict" }),
    destinationId: uuid("destination_id").references(() => destinations.id, {
      onDelete: "restrict",
    }),
    idempotencyKey: text("idempotency_key").notNull(),
    payloadDigest: text("payload_digest").notNull(),
    payloadRedacted: jsonb("payload_redacted").notNull(),
    payloadEncrypted: text("payload_encrypted"),
    status: text("status").notNull().default("RECEIVED"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("events_endpoint_id_idempotency_key_unique").on(
      table.endpointId,
      table.idempotencyKey,
    ),
  ],
);

export const deliveryAttempts = pgTable(
  "delivery_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    trigger: text("trigger").notNull(),
    status: text("status").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    responseStatus: integer("response_status"),
    errorCode: text("error_code"),
    safeErrorMessage: text("safe_error_message"),
    responseHeadersRedacted: jsonb("response_headers_redacted"),
  },
  (table) => [
    uniqueIndex("delivery_attempts_event_id_attempt_number_unique").on(
      table.eventId,
      table.attemptNumber,
    ),
  ],
);

export const activityEvents = pgTable("activity_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  attemptId: uuid("attempt_id").references(() => deliveryAttempts.id, {
    onDelete: "cascade",
  }),
  type: text("type").notNull(),
  metadata: jsonb("metadata").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
