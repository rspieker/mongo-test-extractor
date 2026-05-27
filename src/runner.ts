import * as vm from "node:vm";
import * as fs from "node:fs";
import { create } from "flugrekorder";
import { createStub, createAssertStub } from "./stub.js";
import type { ExtractedTest } from "./types.js";

const BSON_GLOBALS: Record<string, unknown> = {
  ObjectId: class ObjectId {
    constructor(public id = Math.random().toString(36).slice(2)) {}
    toString() { return this.id; }
  },
  ISODate: (s?: string) => s ? new Date(s) : new Date(),
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
};

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
  });

  const context = vm.createContext({
    ...BSON_GLOBALS,
    db: recorded.db,
    assert: recorded.assert,
    TestData: {},
    load: () => {},
    print: () => {},
    printjson: () => {},
    tojson: JSON.stringify,
    jsTest: { options: () => ({}) },
    jsTestName: () => filePath,
    Random: { rand: Math.random, setRandomSeed: () => {} },
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
