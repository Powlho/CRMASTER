// Génération de texte (résumé, compte rendu mis en forme) via le LLM Gateway d'AssemblyAI,
// qui remplace LeMUR (arrêté le 31 mars 2026). Même clé API que la transcription.

const LLM_GATEWAY_URL = "https://llm-gateway.assemblyai.com/v1/chat/completions";
// Modifiable sans toucher au code (ex. ASSEMBLYAI_LLM_MODEL=gpt-4.1 dans .env.local).
const DEFAULT_MODEL = "claude-sonnet-4-6";

export async function generateText(opts: {
  apiKey: string;
  instructions: string;
  content: string;
  maxTokens: number;
}): Promise<{ text: string } | { error: string; status: number }> {
  let res: Response;
  try {
    res = await fetch(LLM_GATEWAY_URL, {
      method: "POST",
      headers: { authorization: opts.apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ASSEMBLYAI_LLM_MODEL || DEFAULT_MODEL,
        messages: [
          { role: "system", content: opts.instructions },
          { role: "user", content: opts.content },
        ],
        max_tokens: opts.maxTokens,
      }),
    });
  } catch {
    return { error: "Impossible de joindre AssemblyAI depuis le serveur.", status: 502 };
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    return { error: `Échec de la génération (${res.status}) : ${body}`, status: 502 };
  }
  let data: { choices?: { message?: { content?: unknown } }[] };
  try {
    data = await res.json();
  } catch {
    return { error: "Réponse illisible du service de génération.", status: 502 };
  }
  // Format OpenAI (texte) ; certains modèles renvoient une liste de blocs { type, text }.
  const content = data.choices?.[0]?.message?.content;
  const text = (
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((b) => (typeof b?.text === "string" ? b.text : "")).join("")
        : ""
  ).trim();
  if (!text) return { error: "Réponse vide du service de génération.", status: 502 };
  return { text };
}
