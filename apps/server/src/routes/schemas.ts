import { z } from "zod";

/** Numeric path parameter ({id}) shared by most resource routes. */
export const IdParamsSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/u, "id must be a positive integer")
    .openapi({ example: "42" }),
});

/**
 * Free-form path parameter ({id}) for resources addressed by public ids
 * (e.g. stubs), where the value is not a database integer.
 */
export const PublicIdParamsSchema = z.object({
  id: z.string().min(1).openapi({ example: "stub_abc123" }),
});

/** String path parameter ({discountId}) for Polar discount ids. */
export const DiscountIdParamsSchema = z.object({
  discountId: z.string().min(1).openapi({ example: "dsc_4242" }),
});

/**
 * Generic `{ error }` JSON error body — the ported gigstax routes kept
 * the legacy `error` key in their error responses.
 */
export const errorObjectSchema = z.object({ error: z.string() });

/**
 * `{ error }` JSON error body with an optional `details` payload
 * (e.g. a serialized ZodError), matching the legacy gigstax validation
 * error shape.
 */
export const errorDetailsObjectSchema = z.object({
  details: z.unknown().optional(),
  error: z.string(),
});
