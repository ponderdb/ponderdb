import type { EmbeddingProvider } from "@ponderdb/core";

/**
 * Placeholder local embedding provider.
 * Uses simple TF-IDF-like hashing for MVP — replace with real model later.
 * This allows the system to work without any API keys.
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  private dim: number;

  constructor(dimensions = 384) {
    this.dim = dimensions;
  }

  dimensions(): number {
    return this.dim;
  }

  async embed(text: string): Promise<number[]> {
    return this.hashEmbed(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.hashEmbed(t));
  }

  /**
   * Simple hash-based embedding for MVP.
   * NOT real semantic embeddings — just deterministic vectors from text.
   * Good enough for basic similarity (same words = similar vectors).
   * Will be replaced with BGE/nomic model or OpenAI API.
   */
  private hashEmbed(text: string): number[] {
    const vec = new Float32Array(this.dim);
    const words = text.toLowerCase().split(/\W+/).filter(Boolean);

    for (const word of words) {
      let hash = 0;
      for (let i = 0; i < word.length; i++) {
        hash = ((hash << 5) - hash + word.charCodeAt(i)) | 0;
      }
      // Spread word influence across multiple dimensions
      for (let j = 0; j < 3; j++) {
        const idx = Math.abs((hash + j * 7919) % this.dim);
        vec[idx] += 1.0 / words.length;
      }
    }

    // Normalize to unit vector
    let norm = 0;
    for (let i = 0; i < this.dim; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < this.dim; i++) vec[i] /= norm;
    }

    return Array.from(vec);
  }
}
