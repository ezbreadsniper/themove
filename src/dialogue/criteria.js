/**
 * Shared fact matching for barks and dialogue conditions. A criterion compares one fact:
 *   literal            equal (true / 'resident' / 3)
 *   [a, b, c]          fact is one of the values
 *   { gte, gt, lte, lt, ne, eq, in, exists }   any combination, all must hold
 * Facts are looked up by dotted path ('npc.met', 'rank', 'traits.bravery').
 */
export function getPath(obj, path) {
  if (!obj) return undefined;
  if (path in obj) return obj[path];
  let cur = obj;
  for (const part of path.split('.')) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

export function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts.slice(0, -1)) cur = cur[p] ??= {};
  cur[parts.at(-1)] = value;
}

export function testValue(value, crit) {
  if (Array.isArray(crit)) return crit.includes(value);
  if (crit !== null && typeof crit === 'object') {
    if ('exists' in crit && (value !== undefined && value !== null) !== crit.exists) return false;
    if ('eq' in crit && value !== crit.eq) return false;
    if ('ne' in crit && value === crit.ne) return false;
    if ('in' in crit && !crit.in.includes(value)) return false;
    if ('gte' in crit && !(value >= crit.gte)) return false;
    if ('gt' in crit && !(value > crit.gt)) return false;
    if ('lte' in crit && !(value <= crit.lte)) return false;
    if ('lt' in crit && !(value < crit.lt)) return false;
    return true;
  }
  return value === crit;
}

/** True when every criterion matches the facts. */
export function matchAll(criteria = {}, facts = {}) {
  for (const [path, crit] of Object.entries(criteria)) if (!testValue(getPath(facts, path), crit)) return false;
  return true;
}
