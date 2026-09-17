const m = new Map<string, string>();
export default {
  async getItem(k: string) { return m.has(k) ? (m.get(k) as string) : null; },
  async setItem(k: string, v: string) { m.set(k, v); },
  async removeItem(k: string) { m.delete(k); },
};
