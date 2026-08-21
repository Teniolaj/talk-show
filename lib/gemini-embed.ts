export const EMBED_DIMENSIONS = 1536;

export async function embedText(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        outputDimensionality: EMBED_DIMENSIONS,
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini embedding request failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.embedding.values as number[];
}
