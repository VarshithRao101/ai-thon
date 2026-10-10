/**
 * Minimal circuit breaker (docs/07): opens when at least `minimumCalls` of the
 * last `windowMs` calls happened and the failure ratio reached `failureRatio`;
 * after `openMs` it lets one probe through (half-open). A success closes it.
 */
export type BreakerOptions = {
  windowMs: number;
  minimumCalls: number;
  failureRatio: number;
  openMs: number;
  now?: () => number;
};

type Circuit = {
  calls: { at: number; ok: boolean }[];
  openedAt: number | null;
  probing: boolean;
};

export type BreakerDecision = { allowed: true } | { allowed: false; retryAfterMs: number };

export class CircuitBreaker {
  private readonly circuits = new Map<string, Circuit>();
  private readonly options: Required<BreakerOptions>;

  constructor(options: Partial<BreakerOptions> = {}) {
    this.options = {
      windowMs: options.windowMs ?? 30_000,
      minimumCalls: options.minimumCalls ?? 10,
      failureRatio: options.failureRatio ?? 0.5,
      openMs: options.openMs ?? 30_000,
      now: options.now ?? Date.now,
    };
  }

  private circuit(key: string): Circuit {
    let circuit = this.circuits.get(key);
    if (!circuit) {
      circuit = { calls: [], openedAt: null, probing: false };
      this.circuits.set(key, circuit);
    }
    return circuit;
  }

  /** Ask before calling the integration. */
  check(key: string): BreakerDecision {
    const circuit = this.circuit(key);
    if (circuit.openedAt === null) {
      return { allowed: true };
    }
    const elapsed = this.options.now() - circuit.openedAt;
    if (elapsed >= this.options.openMs && !circuit.probing) {
      circuit.probing = true; // half-open: exactly one probe
      return { allowed: true };
    }
    return { allowed: false, retryAfterMs: Math.max(1, this.options.openMs - elapsed) };
  }

  /** Report the outcome of a call that was allowed. */
  record(key: string, ok: boolean): void {
    const circuit = this.circuit(key);
    const now = this.options.now();
    if (circuit.probing) {
      circuit.probing = false;
      if (ok) {
        circuit.openedAt = null;
        circuit.calls = [];
      } else {
        circuit.openedAt = now;
      }
      return;
    }
    circuit.calls.push({ at: now, ok });
    circuit.calls = circuit.calls.filter((c) => now - c.at <= this.options.windowMs);
    const failures = circuit.calls.filter((c) => !c.ok).length;
    if (
      circuit.calls.length >= this.options.minimumCalls &&
      failures / circuit.calls.length >= this.options.failureRatio
    ) {
      circuit.openedAt = now;
    }
  }

  state(key: string): "closed" | "open" | "half-open" {
    const circuit = this.circuits.get(key);
    if (!circuit || circuit.openedAt === null) {
      return "closed";
    }
    return circuit.probing ? "half-open" : "open";
  }
}
