import { randomBytes, createHash } from "node:crypto";

/** Generate a unique memory ID */
export function generateId(): string {
  return randomBytes(12).toString("hex");
}

/** Generate an API key with prefix */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const prefix = "pndr";
  const secret = randomBytes(24).toString("base64url");
  const key = `${prefix}_${secret}`;
  const hash = hashApiKey(key);
  return { key, prefix: key.slice(0, 12), hash };
}

/** Hash an API key for storage */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Resolve ~ to home directory */
export function expandPath(path: string): string {
  if (path.startsWith("~")) {
    const home = process.env.HOME || process.env.USERPROFILE || "";
    return path.replace("~", home);
  }
  return path;
}

/** Cosine similarity between two vectors */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** Auto-detect memory category from content */
export function detectCategory(content: string, key: string): string {
  const text = `${key} ${content}`.toLowerCase();
  if (/bug|fix|error|issue|crash|exception/.test(text)) return "bug";
  if (/architect|design|structure|diagram|system/.test(text)) return "architecture";
  if (/pattern|convention|style|naming|format/.test(text)) return "pattern";
  if (/config|env|setting|option|flag/.test(text)) return "config";
  if (/decision|chose|decided|tradeoff|why/.test(text)) return "decision";
  if (/snippet|code|function|class|template/.test(text)) return "snippet";
  if (/debug|log|trace|inspect|breakpoint/.test(text)) return "debug";
  if (/workflow|process|step|pipeline|deploy/.test(text)) return "workflow";
  if (/dependency|package|library|version|upgrade/.test(text)) return "dependency";
  return "custom";
}
