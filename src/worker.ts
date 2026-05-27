import { extractFromFile } from "./index.js";

const file = process.argv[2];
if (!file) process.exit(1);

try {
  const result = extractFromFile(file);
  process.stdout.write(JSON.stringify({ ok: true, result }) + "\n");
} catch (e) {
  process.stdout.write(JSON.stringify({ ok: false, error: (e as Error).message }) + "\n");
}
