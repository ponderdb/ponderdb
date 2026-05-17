import { pipeline, env, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { resolve } from "node:path";
import type { EmbeddingProvider } from "@ponderdb/core";

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const DIMENSIONS = 384;

/**
 * Real semantic embedding provider using all-MiniLM-L6-v2 via Transformers.js.
 * Downloads model on first use (~80MB), cached locally.
 * Generates 384-dimensional embeddings with mean pooling + normalization.
 */
export class TransformerEmbeddingProvider implements EmbeddingProvider {
  private extractor: FeatureExtractionPipeline | null = null;
  private loading: Promise<FeatureExtractionPipeline> | null = null;

  constructor(cacheDir?: string) {
    // Cache models in data dir or default location
    if (cacheDir) {
      env.cacheDir = resolve(cacheDir, "models");
    }
    // Disable remote model fetching warning
    env.allowLocalModels = true;
  }

  dimensions(): number {
    return DIMENSIONS;
  }

  private async getExtractor(): Promise<FeatureExtractionPipeline> {
    if (this.extractor) return this.extractor;
    if (this.loading) return this.loading;

    this.loading = pipeline("feature-extraction", MODEL_ID, {
      dtype: "q8",
      progress_callback: (event: { status: string; progress?: number; file?: string }) => {
        if (event.status === "progress" && event.progress !== undefined) {
          process.stderr.write(
            `\r  Downloading model: ${event.file ?? ""} ${Math.round(event.progress)}%`,
          );
        } else if (event.status === "done") {
          process.stderr.write("\n");
        }
      },
    });

    this.extractor = await this.loading;
    this.loading = null;
    return this.extractor;
  }

  async embed(text: string): Promise<number[]> {
    const extractor = await this.getExtractor();
    const output = await extractor(text, { pooling: "mean", normalize: true });
    return Array.from(output.data as Float32Array);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const extractor = await this.getExtractor();
    const output = await extractor(texts, { pooling: "mean", normalize: true });
    const data = output.data as Float32Array;
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i++) {
      results.push(Array.from(data.slice(i * DIMENSIONS, (i + 1) * DIMENSIONS)));
    }
    return results;
  }
}
