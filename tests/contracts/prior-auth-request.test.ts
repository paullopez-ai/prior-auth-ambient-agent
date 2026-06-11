import { describe, it, expect } from "vitest";
import { PriorAuthRequestSchema } from "../../src/contracts/prior-auth-request.js";

const validPayload = {
  messageId: "msg-001",
  requestId: "11111111-1111-1111-1111-111111111111",
  cptCode: "99213",
  diagnosisCodes: ["J06.9"],
  planType: "commercial" as const,
  payerId: "PAYER-001",
  clinicalNotes: "Patient presents with acute upper respiratory symptoms.",
  submittedAt: "2026-06-08T10:00:00.000Z",
  schemaVersion: "1.0" as const,
};

describe("PriorAuthRequestSchema", () => {
  it("accepts a valid payload", () => {
    const result = PriorAuthRequestSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("accepts payload with optional scenarioId", () => {
    const result = PriorAuthRequestSchema.safeParse({
      ...validPayload,
      scenarioId: "scenario-1-auto-approve",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing requestId", () => {
    const { requestId: _omit, ...rest } = validPayload;
    const result = PriorAuthRequestSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID requestId", () => {
    const result = PriorAuthRequestSchema.safeParse({ ...validPayload, requestId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid CPT code (non-5-digit)", () => {
    const result = PriorAuthRequestSchema.safeParse({ ...validPayload, cptCode: "1234" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid CPT code (letters)", () => {
    const result = PriorAuthRequestSchema.safeParse({ ...validPayload, cptCode: "9921A" });
    expect(result.success).toBe(false);
  });

  it("rejects empty diagnosisCodes array", () => {
    const result = PriorAuthRequestSchema.safeParse({ ...validPayload, diagnosisCodes: [] });
    expect(result.success).toBe(false);
  });

  it("rejects invalid ICD-10 code format", () => {
    const result = PriorAuthRequestSchema.safeParse({
      ...validPayload,
      diagnosisCodes: ["not-an-icd10"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid planType", () => {
    const result = PriorAuthRequestSchema.safeParse({
      ...validPayload,
      planType: "hmo",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing clinicalNotes", () => {
    const { clinicalNotes: _omit, ...rest } = validPayload;
    const result = PriorAuthRequestSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects clinicalNotes that are too short", () => {
    const result = PriorAuthRequestSchema.safeParse({
      ...validPayload,
      clinicalNotes: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects wrong schemaVersion", () => {
    const result = PriorAuthRequestSchema.safeParse({
      ...validPayload,
      schemaVersion: "2.0",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid ISO timestamp", () => {
    const result = PriorAuthRequestSchema.safeParse({
      ...validPayload,
      submittedAt: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("accepts multiple valid ICD-10 codes", () => {
    const result = PriorAuthRequestSchema.safeParse({
      ...validPayload,
      diagnosisCodes: ["M17.11", "Z96.641", "M79.3"],
    });
    expect(result.success).toBe(true);
  });
});
