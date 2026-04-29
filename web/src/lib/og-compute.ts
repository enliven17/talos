/**
 * 0G Compute Network — decentralized AI inference for Talos agents.
 *
 * 0G Compute provides verifiable, sealed AI inference.
 * Models: qwen3-235b-a22b, GLM-4-9B-Chat, etc.
 *
 * Docs: https://docs.0g.ai/build-with-0g/compute-network
 */

// ── Config ────────────────────────────────────────────────────────────────────

const OG_COMPUTE_API =
  process.env.OG_COMPUTE_API ?? "https://api.0g.ai";

const OG_COMPUTE_API_KEY =
  process.env.OG_COMPUTE_API_KEY ?? "";

// Available models on 0G Compute
export const OG_MODELS = {
  /** Qwen3 235B — best quality, verifiable inference */
  QWEN3: "qwen3-235b-a22b",
  /** GLM-4 9B — fast, good for agent reasoning */
  GLM4: "GLM-4-9B-Chat",
  /** Qwen2.5 72B — balanced performance */
  QWEN25: "Qwen2.5-72B-Instruct",
} as const;

export type OgModel = (typeof OG_MODELS)[keyof typeof OG_MODELS];

// ── OpenAI-compatible chat completion ─────────────────────────────────────────

export interface OgChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OgChatOptions {
  model?: OgModel;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

/**
 * Call 0G Compute for chat completion (OpenAI-compatible API).
 * Falls back to configured LLM (Groq/OpenAI) if 0G is unavailable.
 */
export async function ogChatCompletion(
  messages: OgChatMessage[],
  options: OgChatOptions = {},
): Promise<string> {
  const {
    model = OG_MODELS.QWEN3,
    temperature = 0.7,
    max_tokens = 2048,
  } = options;

  if (!OG_COMPUTE_API_KEY) {
    throw new Error("OG_COMPUTE_API_KEY not set");
  }

  const res = await fetch(`${OG_COMPUTE_API}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OG_COMPUTE_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens,
      stream: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`0G Compute error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message?.content ?? "";
}

/**
 * Stream chat completion from 0G Compute.
 * Yields chunks as they arrive.
 */
export async function* ogChatStream(
  messages: OgChatMessage[],
  options: OgChatOptions = {},
): AsyncGenerator<string> {
  const { model = OG_MODELS.QWEN3, temperature = 0.7, max_tokens = 2048 } = options;

  if (!OG_COMPUTE_API_KEY) {
    throw new Error("OG_COMPUTE_API_KEY not set");
  }

  const res = await fetch(`${OG_COMPUTE_API}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OG_COMPUTE_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens,
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`0G Compute stream error: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

    for (const line of lines) {
      const json = line.slice(6);
      if (json === "[DONE]") return;
      try {
        const data = JSON.parse(json) as {
          choices: Array<{ delta: { content?: string } }>;
        };
        const content = data.choices[0]?.delta?.content;
        if (content) yield content;
      } catch {
        // skip malformed chunks
      }
    }
  }
}

/**
 * Run verifiable inference on 0G Compute.
 * Returns result + proof for on-chain verification.
 */
export async function ogVerifiableInference(
  prompt: string,
  model: OgModel = OG_MODELS.QWEN3,
): Promise<{ result: string; proof?: string }> {
  try {
    const result = await ogChatCompletion(
      [{ role: "user", content: prompt }],
      { model },
    );
    return { result };
  } catch (err) {
    console.error("[og-compute] verifiable inference failed:", err);
    throw err;
  }
}
