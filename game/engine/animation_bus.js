const listeners = new Map();

export function onVfx(eventName, handler) {
  const bucket = listeners.get(eventName) ?? [];
  bucket.push(handler);
  listeners.set(eventName, bucket);
  return () => {
    listeners.set(eventName, (listeners.get(eventName) ?? []).filter((entry) => entry !== handler));
  };
}

export function emitVfx(eventName, payload = {}) {
  const event = { eventName, payload, at: Date.now() };
  (listeners.get(eventName) ?? []).forEach((handler) => handler(event));
  return event;
}
