import * as fs from "node:fs";
import * as readline from "node:readline";
import { buildTimeline } from "./timeline.js";

const [inputFile, outputFile] = process.argv.slice(2);

if (!inputFile || !outputFile) {
  process.stderr.write("Usage: npx tsx src/interpret.ts <results.ndjson> <test-cases.ndjson>\n");
  process.exit(1);
}

const input = fs.createReadStream(inputFile);
const out = fs.createWriteStream(outputFile);
const rl = readline.createInterface({ input, crlfDelay: Infinity });

let files = 0;
let cases = 0;

rl.on("line", (line) => {
  if (!line.trim()) return;
  const { result } = JSON.parse(line);
  if (!result?.sequence) return;

  const testCases = buildTimeline(result.source, result.sequence);
  for (const tc of testCases) {
    out.write(JSON.stringify(tc) + "\n");
    cases++;
  }
  files++;
});

rl.on("close", () => {
  out.end();
  process.stdout.write(`${files} files → ${cases} test cases written to ${outputFile}\n`);
});
