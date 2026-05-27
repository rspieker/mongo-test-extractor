import { runTest } from "./runner.js";

export { runBatch } from "./batch.js";
export type { ExtractedTest, BatchResult, BatchSummary } from "./types.js";

export function extractFromFile(filePath: string) {
  return runTest(filePath);
}
