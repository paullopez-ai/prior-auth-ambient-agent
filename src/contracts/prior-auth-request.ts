import { z } from "zod";

/**
 * Versioned Zod contract for Pub/Sub prior authorization request messages.
 * This schema is the machine-readable contract for every event the system accepts.
 * Validation failures return HTTP 400 (terminal — Pub/Sub will not retry).
 */
export const PriorAuthRequestSchema = z.object({
  messageId: z
    .string()
    .min(1)
    .describe("Pub/Sub message ID assigned by the broker"),

  requestId: z
    .string()
    .uuid()
    .describe("Unique prior authorization request identifier (UUID)"),

  cptCode: z
    .string()
    .regex(/^\d{5}$/, "CPT code must be exactly 5 digits")
    .describe("CPT procedure code (e.g. '27447' for total knee arthroplasty)"),

  diagnosisCodes: z
    .array(z.string().regex(/^[A-Z]\d{2}(\.\d{1,4})?$/, "Must be a valid ICD-10 code"))
    .min(1, "At least one diagnosis code is required")
    .describe("ICD-10 diagnosis codes supporting the procedure"),

  planType: z
    .enum(["commercial", "medicare_advantage", "medicaid"])
    .describe("Health plan type governing coverage rules"),

  payerId: z
    .string()
    .min(1)
    .describe("Payer profile identifier for coverage lookup"),

  clinicalNotes: z
    .string()
    .min(10)
    .max(4000)
    .describe(
      "Synthetic clinical notes supporting medical necessity. NO PHI — all notes must be synthetic."
    ),

  submittedAt: z
    .string()
    .datetime()
    .describe("ISO 8601 timestamp when the request was submitted upstream"),

  schemaVersion: z
    .literal("1.0")
    .describe("Payload schema version; must be '1.0' for this contract"),

  scenarioId: z
    .string()
    .optional()
    .describe("Optional scenario identifier for mock mode fixture routing"),
});

export type PriorAuthRequestMessage = z.infer<typeof PriorAuthRequestSchema>;
