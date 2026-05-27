import type { Rekording } from "flugrekorder";

export interface ExtractedTest {
  source: string;
  sequence: Rekording[];
}

export interface BatchResult {
  file: string;
  result: ExtractedTest | null;
  error: string | null;
}

export interface BatchSummary {
  total: number;
  useful: number;
  errors: number;
}
