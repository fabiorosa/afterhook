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

export type CreateEndpointInput = z.infer<typeof createEndpointInputSchema>;
export type CreateDestinationInput = z.infer<
  typeof createDestinationInputSchema
>;
export type EndpointResponse = z.infer<typeof endpointResponseSchema>;
export type CreatedEndpointResponse = z.infer<
  typeof createdEndpointResponseSchema
>;
export type DestinationResponse = z.infer<typeof destinationResponseSchema>;
