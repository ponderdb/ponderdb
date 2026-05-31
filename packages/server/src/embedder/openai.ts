import type { EmbeddingProvider } from "@ponderdb/core";

const OPENAI_EMBEDDING_URL = "https://api.openai.com/v1/embeddings";

/**
 * OpenAI embedding provider using text-embedding-3-small.
 * Generates 1536-dimensional embeddings via OpenAI API.
 * Requires OPENAI_API_KEY environment variable.
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private apiKey: string;
  private model: string;
  private dim: number;

  constructor(apiKey: string, model = "text-embedding-3-small", dimensions = 1536) {
    this.apiKey = apiKey;
    this.model = model;
    this.dim = dimensions;
  }

  dimensions(): number {
    return this.dim;
  }

  async embed(text: string): Promise<number[]> {
    const [result] = await this.fetchEmbeddings([text]);
    return result;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return this.fetchEmbeddings(texts);
  }

  private async fetchEmbeddings(inputs: string[]): Promise<number[][]> {
    const res = await fetch(OPENAI_EMBEDDING_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: inputs,
        model: this.model,
        dimensions: this.dim,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI embedding API error ${res.status}: ${body}`);
    }

    const json = await res.json() as {
      data: { embedding: number[]; index: number }[];
    };

    // Sort by index to preserve input order
    return json.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
}
