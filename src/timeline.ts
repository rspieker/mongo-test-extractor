import type { Rekording, Serialized } from "flugrekorder";
import { buildPathMap } from "./path-map.js";
import { classify } from "./classify.js";

export interface TestCase {
  source: string;
  collection: string;
  method: string;
  filter: Serialized[];
  context: Serialized[];
  assertion: { method: string; expected: Serialized } | null;
}

export function buildTimeline(source: string, sequence: Rekording[]): TestCase[] {
  const paths = buildPathMap(sequence);

  // collection name → current documents
  const state = new Map<string, Serialized[]>();
  // query resultId → test case (filled in, awaiting assertion)
  const pending = new Map<string, TestCase>();
  // all completed test cases
  const cases: TestCase[] = [];

  // proxy ID → the query result it was derived from (for assertion correlation)
  const resultChain = new Map<string, string>();

  for (const r of sequence) {
    const call = classify(r, paths);

    if (call.kind === "write") {
      if (call.method === "drop") {
        state.set(call.collection, []);
      } else if (call.method === "insert" || call.method === "insertOne" || call.method === "save") {
        const docs = state.get(call.collection) ?? [];
        const arg = call.args[0];
        if (Array.isArray(arg)) {
          docs.push(...arg);
        } else if (arg !== undefined) {
          docs.push(arg);
        }
        state.set(call.collection, docs);
      } else if (call.method === "insertMany") {
        const docs = state.get(call.collection) ?? [];
        const arg = call.args[0];
        if (Array.isArray(arg)) docs.push(...arg);
        state.set(call.collection, docs);
      }
      continue;
    }

    if (call.kind === "query") {
      const tc: TestCase = {
        source,
        collection: call.collection,
        method: call.method,
        filter: call.args,
        context: [...(state.get(call.collection) ?? [])],
        assertion: null,
      };
      pending.set(call.resultId, tc);
      // track the result proxy itself
      resultChain.set(call.resultId, call.resultId);
      continue;
    }

    if (call.kind === "assert") {
      // find which query result this assertion references
      const proxyArg = call.args.find(
        (a): a is { $proxy: string } =>
          typeof a === "object" && a !== null && "$proxy" in (a as object),
      );
      if (!proxyArg) continue;

      // walk the result chain to find the originating query
      const queryId = resultChain.get(proxyArg.$proxy);
      const tc = queryId ? pending.get(queryId) : undefined;
      if (!tc) continue;

      const plainArgs = call.args.filter(
        (a) => !(typeof a === "object" && a !== null && "$proxy" in (a as object)),
      );
      tc.assertion = {
        method: call.method,
        expected: plainArgs.length === 1 ? plainArgs[0] : (plainArgs as Serialized),
      };

      pending.delete(queryId!);
      cases.push(tc);
      continue;
    }

    // Track derived proxies (e.g. cursor.count) back to their source query
    if (r.trap === "apply" && r.origin && "source" in r.origin) {
      const sourceQuery = resultChain.get(r.origin.source);
      if (sourceQuery && typeof r.result === "object" && r.result !== null && "$proxy" in r.result) {
        resultChain.set((r.result as { $proxy: string }).$proxy, sourceQuery);
      }
    }
    if (r.trap === "get" && r.origin && "parent" in r.origin) {
      const sourceQuery = resultChain.get(r.origin.parent);
      if (sourceQuery && typeof r.result === "object" && r.result !== null && "$proxy" in r.result) {
        resultChain.set((r.result as { $proxy: string }).$proxy, sourceQuery);
      }
    }
  }

  // include queries that had no assertion
  for (const tc of pending.values()) {
    cases.push(tc);
  }

  return cases;
}
