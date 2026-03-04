import { Registry } from '../core/registry.js';
import { loadPlugins } from '../core/loader.js';

const registry = new Registry();

async function boot() {
  const host = document.querySelector('#plugin-list');
  const logs = [];
  const errors = await loadPlugins(registry, [
    { manifest: './plugins/index.json', base: './plugins', type: 'card-pack', kind: 'creatorCardPacks' },
    { manifest: '../packs/index.json', base: '../packs', type: 'card-pack', kind: 'sharedCardPacks' },
  ], (line) => logs.push(line));

  [...logs, ...errors.map((e) => `Error: ${e}`)].forEach((line) => {
    const card = document.createElement('article');
    card.textContent = line;
    host.appendChild(card);
  });

  const form = document.querySelector('#card-form');
  const preview = document.querySelector('#preview');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const card = {
      type: 'card',
      id: data.get('id'),
      name: data.get('name'),
      cost: Number(data.get('cost')),
      attack: Number(data.get('attack')),
      health: Number(data.get('health')),
      cardType: 'minion',
      taunt: data.get('taunt') === 'on',
    };
    preview.textContent = JSON.stringify(card, null, 2);
  });
}

boot();
