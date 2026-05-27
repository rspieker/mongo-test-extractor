import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import type { BatchResult, BatchSummary } from "./types.js";

const QUERY_FOLDERS = [
  "all", "and", "array", "collation", "count", "date",
  "dbref", "distinct", "elemmatch", "exists", "expr",
  "find", "geo", "in", "json_schema", "mod", "ne", "nin",
  "not", "number", "objid", "or", "project", "regex",
  "sort", "type", "where",
];

const tsx = path.join(__dirname, "../node_modules/.bin/tsx");
const workerSrc = path.join(__dirname, "worker.ts");

function runWorker(file: string): Promise<BatchResult> {
  return new Promise((resolve) => {
    const child = spawn(tsx, [workerSrc, file], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk: Buffer) => { out += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { err += chunk.toString(); });
    child.on("close", () => {
      try {
        const { ok, result, error } = JSON.parse(out.trim());
        resolve(ok ? { file, result, error: null } : { file, result: null, error });
      } catch {
        resolve({ file, result: null, error: err.trim().split("\n").find(l => l.trim()) || "worker produced no output" });
      }
    });
  });
}

export async function runBatch(
  jstestsRoot: string,
  options: { verbose?: boolean; output?: string } = {},
): Promise<BatchSummary> {
  const files: string[] = [];

  for (const folder of QUERY_FOLDERS) {
    const dir = path.join(jstestsRoot, folder);
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir, { recursive: true }) as string[];
    for (const entry of entries) {
      if (entry.endsWith(".js")) files.push(path.join(dir, entry));
    }
  }

  if (options.output) fs.mkdirSync(path.dirname(options.output), { recursive: true });

  let useful = 0;
  let errors = 0;

  for (const file of files) {
    const rel = path.relative(jstestsRoot, file);
    const entry = await runWorker(file);

    if (entry.error) {
      errors++;
      if (options.verbose) process.stdout.write(`✗ ${rel} (${entry.error})\n`);
    } else {
      const hasContent = (entry.result?.sequence.length ?? 0) > 0;
      if (!hasContent) entry.result = null;
      if (hasContent) useful++;
      if (options.verbose) {
        process.stdout.write(hasContent
          ? `✓ ${rel} (${entry.result?.sequence.length} recordings)\n`
          : `- ${rel} (no recordings)\n`);
      }
    }

    if (options.output) fs.appendFileSync(options.output, JSON.stringify(entry) + "\n");
  }

  process.stdout.write(`\n${files.length} files processed, ${useful} produced output\n`);
  return { total: files.length, useful, errors };
}
