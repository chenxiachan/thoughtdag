// Rough token estimate (~4 chars per token).
export function countTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

let idCounter = 0;
export function generateId(): string {
  return `node-${Date.now()}-${idCounter++}`;
}
