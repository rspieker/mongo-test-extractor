import * as vm from "node:vm";
import * as fs from "node:fs";
import { create } from "flugrekorder";
import { createStub, createAssertStub } from "./stub.js";
import type { ExtractedTest } from "./types.js";

// Deterministic per-file "randomness": values must be stable across extraction
// runs (so unchanged jstest source yields byte-identical output for fingerprinting)
// while still varying between call sites/files rather than collapsing to one
// static value. Both seed and sequence are derived from content (file path +
// purpose), never from wall-clock time or run order.

// FNV-1a (32-bit): turns a string into a 32-bit seed. 2166136261 is the FNV
// offset basis, 16777619 the FNV prime — both fixed constants from the spec,
// not tunable. Math.imul keeps the multiply as true 32-bit int math (regular
// `*` loses precision above 2^53 and would break the wraparound this depends on).
function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32: turns a 32-bit seed into a repeatable stream of floats in
// [0, 1). Public-domain algorithm by Tommy Ettinger, copied verbatim — the
// shift amounts (15, 7, 61, 14) and increment (0x6d2b79f5) are fixed magic
// constants from that algorithm, not derived here. 4294967296 is 2^32, used
// to scale the final 32-bit int down to a float.
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ISO_ANCHOR_MS = Date.parse("2000-01-01T00:00:00.000Z");
const ISO_RANGE_MS = 20 * 365 * 24 * 60 * 60 * 1000; // +/- ~20 years of spread

function buildGlobals(filePath: string): Record<string, unknown> {
  const objectIdRand = seededRandom(hashSeed(`${filePath}:ObjectId`));
  const isoDateRand = seededRandom(hashSeed(`${filePath}:ISODate`));
  let randomRand = seededRandom(hashSeed(`${filePath}:Random`));

  return {
    ObjectId: class ObjectId {
      constructor(public id = Array.from({ length: 24 }, () => Math.floor(objectIdRand() * 16).toString(16)).join("")) {}
      toString() { return this.id; }
    },
    ISODate: (s?: string) => s ? new Date(s) : new Date(ISO_ANCHOR_MS + Math.floor(isoDateRand() * ISO_RANGE_MS)),
    Timestamp: class Timestamp {
      constructor(public t = 0, public i = 0) {}
    },
    NumberInt: (n: number) => n,
    NumberLong: (n: number) => n,
    NumberDecimal: (n: number) => n,
    BinData: (subtype: number, base64: string) => ({ subtype, base64 }),
    UUID: (s = "") => ({ uuid: s }),
    HexData: (subtype: number, hex: string) => ({ subtype, hex }),
    MinKey: class MinKey {},
    MaxKey: class MaxKey {},
    DBRef: class DBRef {
      constructor(public ns: string, public id: unknown) {}
    },
    Random: {
      rand: () => randomRand(),
      setRandomSeed: (seed?: number) => {
        randomRand = seededRandom(seed === undefined ? hashSeed(`${filePath}:Random`) : seed);
      },
    },
  };
}

function stripImports(code: string): string {
  return code
    .replace(/import\s*\{[^}]*\}\s*from\s*['"][^'"]*['"]\s*;?/gs, "")
    .replace(/import\s+\w+\s+from\s*['"][^'"]*['"]\s*;?/g, "")
    .replace(/export\s+(default\s+)?/g, "");
}

export function runTest(filePath: string): ExtractedTest {
  const sequence: ExtractedTest["sequence"] = [];
  const source = stripImports(fs.readFileSync(filePath, "utf-8"));

  const root = {
    db: createStub(),
    assert: createAssertStub(),
  };

  const recorded = create(root, {
    callback: (r) => sequence.push(r),
    only: ["get", "apply"],
    truncate: 500,
  });

  const context = vm.createContext({
    ...buildGlobals(filePath),
    db: recorded.db,
    assert: recorded.assert,
    TestData: {},
    load: () => {},
    print: () => {},
    printjson: () => {},
    tojson: JSON.stringify,
    jsTest: { options: () => ({}) },
    jsTestName: () => filePath,
    ErrorCodes: new Proxy({}, { get: (_, prop) => prop }),
    isReplSet: false,
    isMongos: false,
    gc: () => {},
  });

  try {
    vm.runInContext(source, context, { filename: filePath, timeout: 5000 });
  } catch {
    // partial recordings are still useful
  }

  return { source: filePath, sequence };
}
