/** In-memory KVNamespace stub for tests */
export class MockKV implements KVNamespace {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null>;
  async get(key: string, type: 'text'): Promise<string | null>;
  async get(key: string, type: 'json'): Promise<unknown>;
  async get(key: string, type: 'arrayBuffer'): Promise<ArrayBuffer | null>;
  async get(key: string, type: 'stream'): Promise<ReadableStream | null>;
  async get(key: string, options: KVNamespaceGetOptions<'text'>): Promise<string | null>;
  async get(key: string, options: KVNamespaceGetOptions<'json'>): Promise<unknown>;
  async get(key: string, options: KVNamespaceGetOptions<'arrayBuffer'>): Promise<ArrayBuffer | null>;
  async get(key: string, options: KVNamespaceGetOptions<'stream'>): Promise<ReadableStream | null>;
  async get(key: string, _?: unknown): Promise<unknown> {
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string | ReadableStream | ArrayBuffer): Promise<void> {
    this.store.set(key, value as string);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(opts?: { prefix?: string; limit?: number; cursor?: string }): Promise<KVNamespaceListResult<unknown, string>> {
    const prefix = opts?.prefix ?? '';
    const keys = [...this.store.keys()]
      .filter(k => k.startsWith(prefix))
      .map(name => ({ name, expiration: undefined, metadata: undefined }));
    return { keys, list_complete: true, cursor: '' };
  }

  async getWithMetadata<Meta>(key: string): Promise<KVNamespaceGetWithMetadataResult<string, Meta>> {
    return { value: this.store.get(key) ?? null, metadata: null };
  }
}
