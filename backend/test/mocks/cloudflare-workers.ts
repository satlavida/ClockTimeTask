// Stub for cloudflare:workers — used by vitest only
export abstract class DurableObject<E = unknown> {
  protected ctx: DurableObjectState;
  protected env: E;
  constructor(ctx: DurableObjectState, env: E) {
    this.ctx = ctx;
    this.env = env;
  }
}
