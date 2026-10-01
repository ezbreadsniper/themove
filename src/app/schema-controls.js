/**
 * Turns the character schema into a flat list of UI controls so the creator always exposes every
 * field the data format supports. Pure (no DOM) so tests can prove nothing is missing.
 */
import { SCHEMA, ACCESSORY_SCHEMAS } from '../character/definition.js';

const HIDDEN = new Set(['version', 'id']);

export function labelFor(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toLowerCase());
}

/**
 * Control descriptors: { kind: 'folder' | 'toggle' | 'number' | 'color' | 'enum' | 'boolean' | 'string',
 * path: string[], folder: string[], label, schema, min, max, step, values }.
 * `value` is the current definition; nullable slots that are off only produce their toggle.
 */
export function planControls(value, schema = SCHEMA, path = [], folder = []) {
  const out = [];
  for (const [key, sub] of Object.entries(schema.fields)) {
    if (HIDDEN.has(key) && path.length === 0) continue;
    const p = [...path, key];
    const v = value?.[key];
    if (sub.type === 'object') {
      const f = [...folder, key];
      out.push({ kind: 'folder', path: p, folder, label: labelFor(key) });
      if (sub.nullable) {
        out.push({ kind: 'toggle', path: p, folder: f, label: `wear ${labelFor(key)}`, schema: sub });
        if (v === null || v === undefined) continue;
      }
      out.push(...planControls(v, sub, p, f));
    } else if (sub.type === 'array') {
      const f = [...folder, key];
      out.push({ kind: 'folder', path: p, folder, label: labelFor(key) });
      for (const [type, accSchema] of Object.entries(ACCESSORY_SCHEMAS)) {
        const af = [...f, type];
        out.push({ kind: 'folder', path: [...p, type], folder: f, label: type });
        out.push({ kind: 'accessory', path: [...p, type], folder: af, label: `wear ${type}`, accessory: type, schema: accSchema });
        const item = (v ?? []).find((a) => a.type === type);
        if (!item) continue;
        for (const [ak, as] of Object.entries(accSchema.fields)) {
          if (ak === 'type') continue;
          out.push(leaf(as, [...p, type, ak], af, ak, { accessory: type }));
        }
      }
    } else {
      out.push(leaf(sub, p, folder, key));
    }
  }
  return out;
}

function leaf(sub, path, folder, key, extra = {}) {
  const base = { path, folder, label: labelFor(key), schema: sub, ...extra };
  if (sub.type === 'number') {
    const range = sub.max - sub.min;
    const step = range > 20 ? 1 : range > 2 ? 0.01 : 0.001;
    return { ...base, kind: 'number', min: sub.min, max: sub.max, step };
  }
  if (sub.type === 'enum') return { ...base, kind: 'enum', values: sub.values };
  return { ...base, kind: sub.type };
}

/** Every leaf path the schema defines (with accessories expanded), for coverage tests. */
export function allLeafPaths(schema = SCHEMA, path = []) {
  const out = [];
  for (const [key, sub] of Object.entries(schema.fields)) {
    if (HIDDEN.has(key) && path.length === 0) continue;
    if (sub.type === 'object') out.push(...allLeafPaths(sub, [...path, key]));
    else if (sub.type === 'array') {
      for (const [type, as] of Object.entries(ACCESSORY_SCHEMAS)) {
        for (const ak of Object.keys(as.fields)) if (ak !== 'type') out.push([...path, key, type, ak].join('.'));
      }
    } else out.push([...path, key].join('.'));
  }
  return out;
}
