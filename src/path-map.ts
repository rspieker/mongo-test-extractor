import type { Rekording } from "flugrekorder";

/**
 * Builds a map from proxy ID to dotted path string by walking the sequence.
 *
 * - Root proxy (origin: null) → "root"
 * - get trap → parent_path.key
 * - apply/construct trap → source_path()
 */
export function buildPathMap(sequence: Rekording[]): Map<string, string> {
  const paths = new Map<string, string>();

  // The root proxy is never emitted as a recording result — it's created
  // implicitly by create(). Find it: any ID referenced as a parent/source
  // that never appears as a result.
  const resultIds = new Set<string>();
  const referencedIds = new Set<string>();

  for (const r of sequence) {
    if (typeof r.result === "object" && r.result !== null && "$proxy" in r.result) {
      resultIds.add((r.result as { $proxy: string }).$proxy);
    }
    if (r.origin) {
      if ("parent" in r.origin) referencedIds.add(r.origin.parent);
      if ("source" in r.origin) referencedIds.add(r.origin.source);
    }
  }

  for (const id of referencedIds) {
    if (!resultIds.has(id)) paths.set(id, "root");
  }

  for (const r of sequence) {
    const resultId = typeof r.result === "object" && r.result !== null && "$proxy" in r.result
      ? (r.result as { $proxy: string }).$proxy
      : null;

    if (!resultId) continue;

    if (!r.origin) {
      paths.set(resultId, "root");
      continue;
    }

    if ("key" in r.origin) {
      const parent = paths.get(r.origin.parent);
      if (parent !== undefined) {
        paths.set(resultId, parent === "root" ? r.origin.key : `${parent}.${r.origin.key}`);
      }
      continue;
    }

    if ("source" in r.origin) {
      const source = paths.get(r.origin.source);
      if (source !== undefined) {
        paths.set(resultId, `${source}()`);
      }
    }
  }

  return paths;
}
