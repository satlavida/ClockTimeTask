import { SessionDO } from '../src/SessionDO.js';
import type { Env } from '../src/types.js';

class MockStorage {
  private data = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.data.get(key)) as T;
  }
  async put<T>(key: string, value: T): Promise<void> {
    this.data.set(key, structuredClone(value));
  }
  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
  async deleteAll(): Promise<void> {
    this.data.clear();
  }
  async setAlarm(_ts: number): Promise<void> {}
}

class MockDurableObjectState {
  readonly storage = new MockStorage();
  acceptWebSocket(_ws: unknown): void {}
  getWebSockets(): WebSocket[] { return []; }
}

class MockDOStub {
  private readonly do_: SessionDO;

  constructor(env: Env) {
    const ctx = new MockDurableObjectState() as unknown as DurableObjectState;
    this.do_ = new SessionDO(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    return this.do_.fetch!(request);
  }
}

export function makeMockSessionDO(env: Env): DurableObjectNamespace {
  const registry = new Map<string, MockDOStub>();
  return {
    idFromName: (name: string) => ({ name } as unknown as DurableObjectId),
    get: (id: DurableObjectId) => {
      const key = (id as unknown as { name: string }).name;
      if (!registry.has(key)) registry.set(key, new MockDOStub(env));
      return registry.get(key)! as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}
