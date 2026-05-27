import type { Rekording, Serialized } from "flugrekorder";

const WRITE_METHODS = new Set([
  "drop", "insert", "insertOne", "insertMany", "save",
  "update", "updateOne", "updateMany", "replaceOne",
  "remove", "deleteOne", "deleteMany", "findAndModify",
  "createIndex", "createIndexes", "ensureIndex",
  "dropIndex", "dropIndexes",
]);

const QUERY_METHODS = new Set([
  "find", "findOne", "aggregate",
  "count", "countDocuments", "estimatedDocumentCount",
  "distinct", "findAndModify",
]);

export type ClassifiedCall =
  | { kind: "write"; collection: string; method: string; args: Serialized[] }
  | { kind: "query"; collection: string; method: string; args: Serialized[]; resultId: string }
  | { kind: "assert"; method: string; args: Serialized[] }
  | { kind: "ignore" };

export function classify(r: Rekording, paths: Map<string, string>): ClassifiedCall {
  if (r.trap !== "apply" || !r.origin || !("source" in r.origin)) return { kind: "ignore" };

  const path = paths.get(r.origin.source);
  if (!path) return { kind: "ignore" };

  const callArgs = Array.isArray(r.args[2]) ? (r.args[2] as Serialized[]) : [];

  // assert.<method>
  const assertMatch = path.match(/^assert\.(\w+)$/);
  if (assertMatch) {
    return { kind: "assert", method: assertMatch[1], args: callArgs };
  }

  // bare assert()
  if (path === "assert()") {
    return { kind: "assert", method: "assert", args: callArgs };
  }

  // db.<collection>.<method>
  const dbMatch = path.match(/^db\.([^.]+)\.(\w+)$/);
  if (dbMatch) {
    const [, collection, method] = dbMatch;
    if (QUERY_METHODS.has(method)) {
      const resultId = typeof r.result === "object" && r.result !== null && "$proxy" in r.result
        ? (r.result as { $proxy: string }).$proxy
        : null;
      if (resultId) return { kind: "query", collection, method, args: callArgs, resultId };
    }
    if (WRITE_METHODS.has(method)) {
      return { kind: "write", collection, method, args: callArgs };
    }
  }

  return { kind: "ignore" };
}
