import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface GeminiResponse {
  determination: "AUTO_APPROVE" | "HUMAN_REVIEW";
  confidence: number;
  rationale: string;
  model_version: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
}

interface MockResponses {
  [scenarioId: string]: GeminiResponse;
}

let mockResponses: MockResponses | null = null;

function loadMockResponses(): MockResponses {
  if (!mockResponses) {
    const mockPath = join(__dirname, "../../data/mock-responses.json");
    const raw = readFileSync(mockPath, "utf-8");
    mockResponses = JSON.parse(raw) as MockResponses;
  }
  return mockResponses;
}

const GEMINI_INPUT_COST_PER_1K = 0.000075;  // gemini-2.0-flash input $/1K tokens
const GEMINI_OUTPUT_COST_PER_1K = 0.0003;    // gemini-2.0-flash output $/1K tokens

function estimateCost(promptTokens: number, completionTokens: number): number {
  return (
    (promptTokens / 1000) * GEMINI_INPUT_COST_PER_1K +
    (completionTokens / 1000) * GEMINI_OUTPUT_COST_PER_1K
  );
}

const CRITERIA_EVAL_SYSTEM_PROMPT = `You are a prior authorization determination engine for a healthcare payer.
Your task is to evaluate a prior authorization request against clinical criteria and produce a structured determination.

CLINICAL CRITERIA:
- CPT codes requiring prior auth: all surgical procedures (10000-69999), advanced imaging (70000-79999)
- Medical necessity requires documented diagnosis codes that clinically justify the procedure
- Commercial plans require 2+ documented failed conservative treatments for elective procedures
- Medicare Advantage follows CMS guidelines with additional documentation requirements
- Medicaid requires pre-authorization for all non-emergency procedures

CONFIDENCE SCORING RUBRIC:
- 0.90-1.00: Complete documentation, clear medical necessity, criteria fully met
- 0.80-0.89: Documentation adequate, minor gaps addressable, criteria substantially met
- 0.60-0.79: Documentation has notable gaps, ambiguous medical necessity, borderline criteria
- 0.00-0.59: Insufficient documentation, criteria not met, significant clinical concerns

ROUTING RULE:
- confidence >= 0.80 → AUTO_APPROVE
- confidence < 0.80 → HUMAN_REVIEW (determination is withheld; routed to human reviewer)

OUTPUT FORMAT (JSON only, no other text):
{
  "determination": "AUTO_APPROVE" | "HUMAN_REVIEW",
  "confidence": <float 0.0-1.0>,
  "rationale": "<concise clinical rationale, 1-3 sentences>"
}`;

export async function evaluateWithGemini(
  request: {
    cptCode: string;
    diagnosisCodes: string[];
    planType: string;
    clinicalNotes: string;
    scenarioId?: string;
  }
): Promise<GeminiResponse> {
  const mockLlm = process.env.MOCK_LLM === "true";

  if (mockLlm) {
    const responses = loadMockResponses();
    const scenarioId = request.scenarioId ?? "default";
    const response = responses[scenarioId] ?? responses["default"];
    if (!response) {
      throw new Error(`No mock response found for scenarioId '${scenarioId}' and no 'default' fallback`);
    }
    // Small simulated delay for realism in demo
    await new Promise((r) => setTimeout(r, 50));
    return response;
  }

  // Live Vertex AI Gemini path
  const { VertexAI } = await import("@google-cloud/vertexai");

  const projectId = process.env.GCP_PROJECT_ID;
  const location = process.env.VERTEX_AI_LOCATION ?? "us-central1";
  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

  if (!projectId) {
    throw new Error("GCP_PROJECT_ID environment variable is required for live Gemini calls");
  }

  const vertexAI = new VertexAI({ project: projectId, location });
  const generativeModel = vertexAI.getGenerativeModel({
    model,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0,
    },
  });

  const userPrompt = `PRIOR AUTHORIZATION REQUEST:
CPT Code: ${request.cptCode}
Diagnosis Codes: ${request.diagnosisCodes.join(", ")}
Plan Type: ${request.planType}
Clinical Notes: ${request.clinicalNotes}

Evaluate this request against the clinical criteria and return a JSON determination.`;

  const result = await generativeModel.generateContent({
    systemInstruction: { parts: [{ text: CRITERIA_EVAL_SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
  });

  const candidate = result.response.candidates?.[0];
  if (!candidate) throw new Error("No candidates returned from Gemini");

  const text = candidate.content.parts[0].text ?? "";
  const parsed = JSON.parse(text) as {
    determination: "AUTO_APPROVE" | "HUMAN_REVIEW";
    confidence: number;
    rationale: string;
  };

  const usage = result.response.usageMetadata;
  const promptTokens = usage?.promptTokenCount ?? 0;
  const completionTokens = usage?.candidatesTokenCount ?? 0;

  return {
    determination: parsed.determination,
    confidence: parsed.confidence,
    rationale: parsed.rationale,
    model_version: model,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    cost_usd: estimateCost(promptTokens, completionTokens),
  };
}
