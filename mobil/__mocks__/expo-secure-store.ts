/** Bellekte tutan SecureStore; gerçeğiyle aynı API. */
const bellek = new Map<string, string>();
export async function getItemAsync(a: string): Promise<string | null> {
  return bellek.has(a) ? (bellek.get(a) as string) : null;
}
export async function setItemAsync(a: string, d: string): Promise<void> { bellek.set(a, d); }
export async function deleteItemAsync(a: string): Promise<void> { bellek.delete(a); }
