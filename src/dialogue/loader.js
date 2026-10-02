import { NODE_TYPES } from './graph.js';
import neighbour from './data/trees/neighbour.json';
import clerk from './data/trees/clerk.json';
import thug from './data/trees/thug.json';

/**
 * Dialogue tree registry: built-in placeholder trees plus anything registered at runtime or fetched
 * as JSON. Every tree is validated on registration (dangling links, unknown node types, empty choices,
 * unreachable nodes), so broken content fails loudly at load time, not mid-conversation.
 */
const REGISTRY = new Map();

const targets = (n) => {
  switch (n.type) {
    case 'line':
    case 'action':
      return [n.next];
    case 'jump':
      return n.tree ? [] : [n.next];
    case 'condition':
      return n.branches ? [...n.branches.map((b) => b.next), n.else] : [n.then, n.else];
    case 'choice':
      return n.options.flatMap((o) => [o.next, o.check?.fail]);
    default:
      return [];
  }
};

/** Returns { errors: [], warnings: [] }. */
export function validateTree(tree) {
  const errors = [];
  const warnings = [];
  if (!tree?.id) errors.push('tree has no id');
  if (!tree?.nodes || typeof tree.nodes !== 'object') return { errors: [...errors, 'tree has no nodes'], warnings };
  if (!tree.nodes[tree.start]) errors.push(`start node "${tree.start}" missing`);
  for (const [id, n] of Object.entries(tree.nodes)) {
    if (!NODE_TYPES.includes(n.type)) errors.push(`${id}: unknown type ${n.type}`);
    if (n.type === 'choice' && !n.options?.length) errors.push(`${id}: choice without options`);
    if (n.type === 'line' && typeof n.text !== 'string') errors.push(`${id}: line without text`);
    if (n.type === 'line' && n.speaker && tree.speakers && !tree.speakers[n.speaker]) warnings.push(`${id}: speaker ${n.speaker} not in speakers`);
    for (const t of targets(n)) if (t !== undefined && t !== null && !tree.nodes[t]) errors.push(`${id}: links to missing node "${t}"`);
    if (['line', 'action'].includes(n.type) && !n.next) warnings.push(`${id}: no next (conversation ends here)`);
  }
  // Reachability from start.
  const seen = new Set();
  const stack = [tree.start];
  while (stack.length) {
    const id = stack.pop();
    if (!id || seen.has(id) || !tree.nodes[id]) continue;
    seen.add(id);
    stack.push(...targets(tree.nodes[id]));
  }
  for (const id of Object.keys(tree.nodes)) if (!seen.has(id)) warnings.push(`${id}: unreachable`);
  return { errors, warnings };
}

export function registerTree(tree) {
  const { errors } = validateTree(tree);
  if (errors.length) throw new Error(`Dialogue tree ${tree?.id ?? '?'} invalid:\n  ${errors.join('\n  ')}`);
  REGISTRY.set(tree.id, tree);
  return tree;
}

export function getTree(id) {
  return REGISTRY.get(id) ?? null;
}

export function treeIds() {
  return [...REGISTRY.keys()];
}

/** Fetches a JSON tree (browser) and registers it. */
export async function loadTree(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`loadTree ${url}: ${res.status}`);
  return registerTree(await res.json());
}

export const BUILTIN_TREES = [neighbour, clerk, thug];
BUILTIN_TREES.forEach(registerTree);
