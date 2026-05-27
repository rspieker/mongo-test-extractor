import { runBatch } from "./index.js";

const [jstestsRoot, ...flags] = process.argv.slice(2);

if (!jstestsRoot) {
  process.stderr.write("Usage: npx tsx src/collect.ts <jstests-root> [--output=<file>] [--verbose]\n");
  process.exit(1);
}

const output = flags.find(f => f.startsWith("--output="))?.slice("--output=".length);
const verbose = flags.includes("--verbose");

(async () => {
  const summary = await runBatch(jstestsRoot, { output, verbose });
  process.stdout.write(`total: ${summary.total}, useful: ${summary.useful}, errors: ${summary.errors}\n`);
})();
