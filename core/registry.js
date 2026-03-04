export class Registry {
  constructor() {
    this.data = new Map();
  }

  register(kind, item) {
    const bucket = this.data.get(kind) ?? new Map();
    bucket.set(item.id, item);
    this.data.set(kind, bucket);
  }

  get(kind, id) {
    return this.data.get(kind)?.get(id) ?? null;
  }

  list(kind) {
    return Array.from(this.data.get(kind)?.values() ?? []);
  }

  snapshot() {
    const out = {};
    for (const [kind, bucket] of this.data.entries()) {
      out[kind] = Array.from(bucket.values());
    }
    return out;
  }
}
