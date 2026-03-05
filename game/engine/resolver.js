export function resolveQueue(queue = []) {
  return queue.map((item) => ({ ...item, resolved: true }));
}
