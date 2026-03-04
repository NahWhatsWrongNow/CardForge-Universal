import { validateSchema } from './schema.js';

async function loadManifest(manifestPath) {
  const response = await fetch(manifestPath);
  if (!response.ok) throw new Error(`Missing manifest ${manifestPath}`);
  return response.json();
}

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Missing file ${path}`);
  return response.json();
}

export async function loadPlugins(registry, definitions, report = console.log) {
  const errors = [];

  for (const definition of definitions) {
    try {
      const manifest = await loadManifest(definition.manifest);
      for (const relPath of manifest.entries ?? []) {
        const path = `${definition.base}/${relPath}`;
        try {
          const plugin = await loadJson(path);
          const validation = validateSchema(plugin, definition.type);
          if (!validation.ok) {
            errors.push(`${path}: missing ${validation.missing.join(', ')}`);
            continue;
          }
          registry.register(definition.kind, plugin);
          report(`Loaded ${plugin.id} from ${path}`);
        } catch (error) {
          errors.push(`${path}: ${error.message}`);
        }
      }
    } catch (error) {
      errors.push(`${definition.manifest}: ${error.message}`);
    }
  }

  return errors;
}
