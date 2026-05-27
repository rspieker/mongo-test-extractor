/**
 * Creates a recursive "yes-machine": any property access returns another stub,
 * any call returns another stub. Never throws, never requires real backing data.
 *
 * The one exception: `.then` returns undefined so stubs are never treated as
 * thenables by the JS engine or by flugrekorder's Promise detection.
 */
export function createStub(): object {
  const children = new Map<string, object>();

  const stub: object = new Proxy(function () {} as object, {
    get(_, prop) {
      if (prop === "then") return undefined;
      if (typeof prop === "symbol") return undefined;
      const key = String(prop);
      if (!children.has(key)) children.set(key, createStub());
      return children.get(key)!;
    },
    apply() {
      // Each call returns a fresh stub — results are independent across calls.
      return createStub();
    },
    construct() {
      return createStub();
    },
  });
  return stub;
}

/**
 * A permissive assert stub: every method returns true, except commandWorked /
 * commandFailed which pass their argument through so tests can chain on the result.
 */
export function createAssertStub(): object {
  const passThrough = (...args: unknown[]) => args[0];
  const ok = () => true;

  const stub: Record<string, unknown> = {
    commandWorked: passThrough,
    commandFailed: passThrough,
    commandFailedWithCode: passThrough,
    throws: (fn: () => unknown) => { try { fn(); } catch {} },
    doesNotThrow: (fn: () => unknown) => { try { return fn(); } catch {} },
  };

  return new Proxy(function () {} as object, {
    get(_, prop) {
      if (prop === "then") return undefined;
      if (typeof prop === "symbol") return undefined;
      return prop in stub ? stub[prop as string] : ok;
    },
    apply() {
      return true;
    },
  });
}
