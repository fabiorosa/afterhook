import { z } from "zod";

export const endpointNameSchema = z
  .string()
  .trim()
  .min(3, "Endpoint name must be at least 3 characters.")
  .max(80, "Endpoint name must be at most 80 characters.");

export const endpointSlugSchema = z
  .string()
  .min(3)
  .max(80)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug must use lowercase letters, numbers, and hyphens.",
  );

export const destinationNameSchema = z
  .string()
  .trim()
  .min(3, "Destination name must be at least 3 characters.")
  .max(80, "Destination name must be at most 80 characters.");

export const destinationUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .pipe(z.url("Destination URL must be a valid URL."))
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Destination URL must use HTTP or HTTPS.");

export const authorizationValueSchema = z
  .string()
  .trim()
  .min(1, "Authorization cannot be empty.")
  .max(4096, "Authorization must be at most 4096 characters.")
  .regex(/^[^\r\n]+$/, "Authorization cannot contain line breaks.");

export const createEndpointInputSchema = z.object({
  name: endpointNameSchema,
});

export const createDestinationInputSchema = z.object({
  name: destinationNameSchema,
  url: destinationUrlSchema,
  authorization: authorizationValueSchema.optional(),
});

export const endpointResponseSchema = z.object({
  id: z.uuid(),
  name: endpointNameSchema,
  slug: endpointSlugSchema,
  enabled: z.boolean(),
  secretFingerprint: z.string().regex(/^sha256:[a-f0-9]{16}$/),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const createdEndpointResponseSchema = endpointResponseSchema.extend({
  signingSecret: z.string().startsWith("ahsec_"),
});

export const destinationResponseSchema = z.object({
  id: z.uuid(),
  name: destinationNameSchema,
  url: destinationUrlSchema,
  enabled: z.boolean(),
  hasAuthorization: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const webhookTimestampSchema = z
  .string()
  .regex(/^\d{10}$/, "Webhook timestamp must use Unix seconds.")
  .transform(Number)
  .refine(Number.isSafeInteger, "Webhook timestamp is invalid.");

export const webhookSignatureSchema = z
  .string()
  .regex(
    /^sha256=[a-f0-9]{64}$/,
    "Webhook signature must use the sha256=<hex> format.",
  );

export const idempotencyKeySchema = z
  .string()
  .min(1, "Idempotency key is required.")
  .max(128, "Idempotency key must be at most 128 characters.")
  .regex(
    /^[A-Za-z0-9._:-]+$/,
    "Idempotency key contains unsupported characters.",
  );

export const webhookHeadersSchema = z.object({
  timestamp: webhookTimestampSchema,
  signature: webhookSignatureSchema,
  idempotencyKey: idempotencyKeySchema,
});

export const webhookPayloadSchema = z.record(z.string(), z.unknown());

export const ingestionReceiptSchema = z.object({
  accepted: z.literal(true),
  eventId: z.uuid(),
  endpointId: z.uuid(),
  idempotencyKey: idempotencyKeySchema,
  payloadDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  duplicate: z.boolean(),
});

export const ingestionErrorSchema = z.object({
  error: z.enum([
    "INVALID_REQUEST",
    "ENDPOINT_NOT_FOUND",
    "SIGNATURE_REJECTED",
    "PAYLOAD_TOO_LARGE",
    "IDEMPOTENCY_CONFLICT",
    "INTERNAL_ERROR",
  ]),
  message: z.string(),
});

export type CreateEndpointInput = z.infer<typeof createEndpointInputSchema>;
export type CreateDestinationInput = z.infer<
  typeof createDestinationInputSchema
>;
export type EndpointResponse = z.infer<typeof endpointResponseSchema>;
export type CreatedEndpointResponse = z.infer<
  typeof createdEndpointResponseSchema
>;
export type DestinationResponse = z.infer<typeof destinationResponseSchema>;
export type WebhookHeaders = z.infer<typeof webhookHeadersSchema>;
export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
export type IngestionReceipt = z.infer<typeof ingestionReceiptSchema>;
export type IngestionError = z.infer<typeof ingestionErrorSchema>;
