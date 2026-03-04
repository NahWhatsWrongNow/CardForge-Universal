export class EventBus {
  #events = new Map();

  on(eventName, handler) {
    const handlers = this.#events.get(eventName) ?? [];
    handlers.push(handler);
    this.#events.set(eventName, handlers);
    return () => this.off(eventName, handler);
  }

  off(eventName, handler) {
    const handlers = this.#events.get(eventName) ?? [];
    this.#events.set(eventName, handlers.filter((h) => h !== handler));
  }

  emit(eventName, payload) {
    const handlers = this.#events.get(eventName) ?? [];
    handlers.forEach((handler) => handler(payload));
  }
}
