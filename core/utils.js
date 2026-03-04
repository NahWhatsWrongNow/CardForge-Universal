export const el = (selector, root = document) => root.querySelector(selector);
export const els = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export const uid = (prefix = 'id') => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

export const deepClone = (value) => JSON.parse(JSON.stringify(value));

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const toast = (message, type = 'info') => {
  const host = document.querySelector('#toast-host');
  if (!host) return;
  const item = document.createElement('div');
  item.className = `toast toast-${type}`;
  item.textContent = message;
  host.appendChild(item);
  setTimeout(() => item.classList.add('toast-show'), 10);
  setTimeout(() => {
    item.classList.remove('toast-show');
    setTimeout(() => item.remove(), 220);
  }, 2200);
};
