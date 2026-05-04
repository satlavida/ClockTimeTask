import * as Y from 'yjs';

export function mergeUpdate(base64State: string, base64Update: string): string {
  const doc = new Y.Doc();
  if (base64State) {
    const stateBytes = Uint8Array.from(atob(base64State), c => c.charCodeAt(0));
    Y.applyUpdate(doc, stateBytes);
  }
  const updateBytes = Uint8Array.from(atob(base64Update), c => c.charCodeAt(0));
  Y.applyUpdate(doc, updateBytes);
  return encodeState(doc);
}

export function encodeState(doc: Y.Doc): string {
  const state = Y.encodeStateAsUpdate(doc);
  return btoa(String.fromCharCode(...state));
}

export function emptyState(): string {
  const doc = new Y.Doc();
  return encodeState(doc);
}
