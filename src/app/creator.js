import * as THREE from 'three';
import GUI from 'lil-gui';
import { WorldViewer } from '../world/viewer.js';
import { Stage, BACKDROPS } from '../render/stage.js';
import { RETRO_PRESETS } from '../render/retro-pipeline.js';
import { buildCharacter, disposeCharacter } from '../character/build.js';
import { normalizeDefinition, serializeDefinition, parseDefinition, defaultsFor } from '../character/definition.js';
import { FACE_PRESETS } from '../character/faces.js';
import { DEFAULT_FACE } from '../geo/parts/head.js';
import { PRESETS, PRESETS_BY_ID, MAIN_PRESETS, NPC_PRESETS, roleOf } from '../character/presets/index.js';
import { MAIN_IDS, DEFAULT_PLAYER_ID } from '../character/saved.js';
import { randomizeOutfit } from '../character/randomize.js';
import { hashBytes } from '../core/rng.js';
import { CLIP_NAMES } from '../anim/clips.js';
import { exportCharacterGLB } from '../export/gltf.js';
import { createEditStore } from './edits.js';
import { planControls, labelFor } from './schema-controls.js';

const container = document.getElementById('view');
const hud = document.getElementById('hud');
const errorBox = document.getElementById('errors');
const saveBox = document.getElementById('save');
const stage = new Stage(container, { width: window.innerWidth, height: window.innerHeight, backdrop: 'menu', preserveDrawingBuffer: false });
stage.renderer.shadowMap.enabled = true;
const worldViewer = new WorldViewer(stage);

const clone = (o) => JSON.parse(JSON.stringify(o));
let storage = null;
try {
  storage = window.localStorage;
} catch {
  storage = null;
}
// Every edit is saved (debounced) through this store; see src/character/persistence.js.
const store = createEditStore(storage, PRESETS_BY_ID);
// Debounced writes are flushed whenever the page may go away (reload, tab close, tab switch).
window.addEventListener('pagehide', () => store.flush());
window.addEventListener('beforeunload', () => store.flush());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') store.flush(); });

const LINEUP = 'all 5 main characters (lineup)';
const NONE = '—';
const urlMode = new URLSearchParams(window.location.search).get('mode');
const urlLineup = urlMode === 'lineup';
const startId = store.activeId && store.get(store.activeId) ? store.activeId : MAIN_PRESETS[0].id;

const state = {
  def: normalizeDefinition(store.get(startId)).value,
  view: { mode: 'single', clip: 'idle', backdrop: 'menu', pipeline: 'ps2', turntable: false, yaw: 0, zoom: 1, ...store.view, ...(urlLineup ? { mode: 'lineup' } : {}), ...(urlMode === 'world' ? { mode: 'world' } : {}) },
  open: store.openFolders,
};

let entries = [];
let gui = null;
const startupWarnings = store.status.warnings.length ? [`Saved edits: ${store.status.warnings.length} problem(s) repaired, presets used where unreadable`] : [];

function showErrors(list) {
  const all = [...startupWarnings, ...list];
  errorBox.textContent = all.length ? `Definition warnings:\n${all.slice(0, 8).join('\n')}` : '';
}

/** Save indicator (bottom right): pending / saved / storage refused. */
let lastSaveText = '';
function updateSaveStatus() {
  const s = store.status;
  const text = s.error ? `NOT SAVED: ${s.error}` : s.pending ? 'saving…' : s.savedAt ? `saved locally ${new Date(s.savedAt).toLocaleTimeString()}` : 'all edits saved locally';
  if (text === lastSaveText || !saveBox) return;
  lastSaveText = text;
  saveBox.textContent = text;
  saveBox.classList.toggle('bad', !!s.error);
}

function rebuild() {
  clearTimeout(rebuildTimer);
  entries.forEach((e) => disposeCharacter(e.character));
  stage.clear();
  entries = [];
  try {
    const defs = state.view.mode === 'lineup' ? MAIN_PRESETS.map((p) => store.get(p.id)) : [state.def];
    defs.forEach((def, i) => {
      const character = buildCharacter(def);
      const entry = stage.add(character, { x: (i - (defs.length - 1) / 2) * 1.0 });
      stage.play(entry, state.view.clip);
      entries.push(entry);
      if (i === 0) showErrors(character.userData.errors);
    });
    if (state.view.mode === 'world') worldViewer.placeEntries(entries, worldViewer.ensureWorld().markers.spawn.pos);
  } catch (err) {
    errorBox.textContent = `Build failed: ${err.message}`;
    throw err;
  } finally {
    rebuildTimer = null;
  }
  updateHud();
}

let rebuildTimer = null;
/** Every edit ends here: normalize, save (debounced write), rebuild the character. */
function commit({ refreshGui = false } = {}) {
  state.def = normalizeDefinition(state.def).value;
  store.save(state.def);
  store.activeId = state.def.id;
  if (refreshGui) buildGui();
  else updateCharacterTitle();
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(rebuild, 120);
}

/** Saves an in-progress edit (slider drag, typing) without rebuilding, so a reload never loses it. */
function saveDraft() {
  store.save(state.def);
  updateCharacterTitle();
}

/** Switches the edited character. Edits are saved as they happen, so nothing is lost by switching. */
function selectCharacter(id) {
  if (id === LINEUP) {
    state.view.mode = 'lineup';
    state.view.yaw = 0;
  } else {
    if (state.view.mode === 'lineup') state.view.mode = 'single';
    state.def = normalizeDefinition(store.get(id) ?? store.get(MAIN_PRESETS[0].id)).value;
    store.activeId = state.def.id;
  }
  saveView();
  buildGui();
  rebuild();
}

function saveView() {
  store.setView(state.view);
}

function updateHud() {
  const s = entries[0]?.character.userData.stats;
  if (!s) return;
  const edited = state.view.mode !== 'lineup' && store.isEdited(state.def.id) ? '  (edited, saved locally)' : '';
  const role = { main: 'main character', npc: 'NPC', test: 'test character' }[roleOf(state.def.id)] ?? 'custom character';
  const name = state.view.mode === 'lineup' ? 'Lineup (local edits applied)' : `${state.def.name}  [${PRESETS_BY_ID[state.def.id] ? role : 'custom character'}]`;
  hud.textContent = `${name}${edited}\n${s.triangles} tris  ${s.drawCalls} draws  ${s.textures} tex (${Math.round(s.textureBytes / 1024)} KB)\nclip: ${state.view.clip}   ${state.view.mode === 'world' ? 'WASD fly  Q/E down/up  Shift fast  drag look  wheel speed  F drop character' : 'drag = orbit, wheel = zoom'}`;
}

function download(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function pickFile(onText) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (file) onText(await file.text());
  };
  input.click();
}

const getPath = (obj, path) => path.reduce((o, k) => (o == null ? undefined : o[k]), obj);

function setPath(obj, path, value) {
  let o = obj;
  for (const k of path.slice(0, -1)) o = o[k];
  o[path[path.length - 1]] = value;
}

/** What a control shows when its field is unset: the value the build actually uses. */
function displayValue(c) {
  const [root, key] = c.path;
  const dotted = c.path.join('.');
  if (root === 'face') {
    const preset = FACE_PRESETS[state.def.face.preset] ?? {};
    if (preset[key] !== undefined) return preset[key];
    if (DEFAULT_FACE[key] !== undefined) return DEFAULT_FACE[key];
    if (key === 'facialHairColor') return state.def.hair.color;
  }
  if (dotted === 'top.trim' || dotted === 'top.cuff') return state.def.top?.color;
  if (dotted === 'hair.rootColor') return state.def.hair.color;
  if (dotted === 'hair.recession') return 0;
  if (c.schema.default !== undefined) return c.schema.default;
  if (c.kind === 'color') return '#808080';
  if (c.kind === 'number') return c.min;
  if (c.kind === 'enum') return c.values[0];
  if (c.kind === 'string') return '';
  return false;
}

function accessoryItem(c) {
  return state.def.accessories.find((a) => a.type === c.accessory);
}

function folderFor(map, path) {
  if (!path.length) return gui;
  const key = path.join('/');
  if (map.has(key)) return map.get(key);
  const parent = folderFor(map, path.slice(0, -1));
  const f = parent.addFolder(labelFor(path[path.length - 1]));
  if (state.open.has(key)) f.open();
  else f.close();
  f.onOpenClose((folder) => {
    if (folder !== f) return;
    if (f._closed) state.open.delete(key);
    else state.open.add(key);
    store.setOpenFolders(state.open);
  });
  map.set(key, f);
  return f;
}

/** Fields whose change alters other controls' labels or defaults (re-builds the menu). */
const REFRESH_ON = new Set(['face.preset', 'name']);

function updateCharacterTitle() {
  if (!gui) return;
  const name = state.view.mode === 'lineup' ? 'Lineup' : `${state.def.name}${store.isEdited(state.def.id) ? ' *' : ''}`;
  gui.title(`Character Creator: ${name}`);
}

function characterActions() {
  return {
    revert: () => {
      if (!PRESETS_BY_ID[state.def.id]) {
        if (!window.confirm(`Delete the custom character "${state.def.name}"? Export a backup first if you want to keep it.`)) return;
        store.remove(state.def.id);
        selectCharacter(MAIN_PRESETS[0].id);
        return;
      }
      const restored = store.revert(state.def.id);
      if (restored) state.def = normalizeDefinition(restored).value;
      buildGui();
      rebuild();
    },
    revertAll: () => {
      if (!window.confirm('Revert ALL characters to their shipped presets? All local edits will be lost (export a backup first to keep them).')) return;
      store.revertAll();
      const id = PRESETS_BY_ID[state.def.id] ? state.def.id : MAIN_PRESETS[0].id;
      state.def = normalizeDefinition(store.get(id)).value;
      store.activeId = id;
      buildGui();
      rebuild();
    },
    duplicate: () => {
      const id = `${state.def.id}-copy-${Math.random().toString(36).slice(2, 6)}`;
      state.def = { ...clone(state.def), id, name: `${state.def.name} (copy)` };
      commit({ refreshGui: true });
    },
    randomSeed: () => {
      state.def.seed = Math.random().toString(36).slice(2, 10);
      commit({ refreshGui: true });
    },
    randomOutfit: () => {
      state.def = randomizeOutfit(state.def, Math.random().toString(36).slice(2, 10));
      commit({ refreshGui: true });
    },
    exportAll: () => {
      store.flush();
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      download(`themove-characters-${stamp}.json`, JSON.stringify(store.exportBundle(), null, 2), 'application/json');
    },
    importAll: () => pickFile((text) => {
      const res = store.importBundle(text);
      store.flush();
      if (!res.ids.length) {
        errorBox.textContent = `Import failed:\n${res.errors.slice(0, 8).join('\n') || 'no characters in file'}`;
        return;
      }
      const id = store.has(state.def.id) ? state.def.id : res.ids[0];
      state.def = normalizeDefinition(store.get(id)).value;
      store.activeId = id;
      buildGui();
      rebuild();
      if (res.errors.length) errorBox.textContent = `Imported ${res.ids.length} character(s) with warnings:\n${res.errors.slice(0, 8).join('\n')}`;
    }),
    saveJSON: () => download(`${state.def.id}.json`, serializeDefinition(state.def), 'application/json'),
    loadJSON: () => pickFile((text) => {
      const parsed = parseDefinition(text);
      if (!parsed.value) {
        errorBox.textContent = parsed.errors.join('\n');
        return;
      }
      state.def = parsed.value;
      if (state.view.mode === 'lineup') state.view.mode = 'single';
      saveView();
      commit({ refreshGui: true });
      showErrors(parsed.errors);
    }),
    exportGLB: async () => {
      const glb = await exportCharacterGLB(buildCharacter(state.def));
      download(`${state.def.id}.glb`, glb, 'model/gltf-binary');
    },
  };
}

/** Display name for the roster menus; '*' marks characters with saved edits. */
function rosterLabel(id) {
  const name = PRESETS_BY_ID[id]?.name ?? `${store.get(id)?.name ?? id} (${id})`;
  return `${name}${store.isEdited(id) ? ' *' : ''}`;
}

/** A roster select; shows '—' when the current character is in another list. */
function rosterSelect(folder, ids, extra = {}) {
  const options = { [NONE]: NONE, ...extra };
  for (const id of ids) options[rosterLabel(id)] = id;
  const lineup = state.view.mode === 'lineup';
  const current = lineup && LINEUP in extra ? LINEUP : !lineup && ids.includes(state.def.id) ? state.def.id : NONE;
  const ctrl = folder.add({ v: current }, 'v', options).name('character').onChange((id) => {
    if (id !== NONE) selectCharacter(id);
  });
  return ctrl;
}

function buildCharactersFolder() {
  const chars = gui.addFolder('Characters');
  const mainIds = MAIN_PRESETS.map((p) => p.id);
  const npcIds = NPC_PRESETS.map((p) => p.id);
  const otherIds = [...PRESETS.filter((p) => !['main', 'npc'].includes(roleOf(p.id))).map((p) => p.id), ...store.customIds()];

  const main = chars.addFolder('main characters');
  main.domElement.dataset.roster = 'main';
  rosterSelect(main, mainIds, { [LINEUP]: LINEUP });
  if (state.view.mode === 'lineup') {
    if (!mainIds.includes(state.def.id)) {
      state.def = normalizeDefinition(store.get(mainIds[0])).value;
      store.activeId = mainIds[0];
    }
    main.add({ id: state.def.id }, 'id', Object.fromEntries(mainIds.map((id) => [rosterLabel(id), id]))).name('editing').onChange((id) => {
      state.def = normalizeDefinition(store.get(id)).value;
      store.activeId = id;
      buildGui();
    });
  }
  const player = { id: MAIN_IDS.includes(store.playerId) ? store.playerId : DEFAULT_PLAYER_ID };
  main.add(player, 'id', Object.fromEntries(mainIds.map((id) => [PRESETS_BY_ID[id].name, id]))).name('play as (game)').onChange((id) => {
    store.playerId = id;
    store.flush();
  });

  const npcs = chars.addFolder('NPCs');
  npcs.domElement.dataset.roster = 'npc';
  rosterSelect(npcs, npcIds);

  const other = chars.addFolder('test & custom');
  other.domElement.dataset.roster = 'other';
  rosterSelect(other, otherIds);
  other.close();

  const a = characterActions();
  const custom = !PRESETS_BY_ID[state.def.id];
  chars.add(a, 'revert').name(custom ? 'delete this custom character' : 'revert this character');
  chars.add(a, 'revertAll').name('revert ALL characters');
  chars.add(a, 'randomOutfit').name('randomise outfit');
  chars.add(a, 'randomSeed').name('new random seed');
  chars.add(a, 'duplicate').name('duplicate as new character');
  chars.add(a, 'exportAll').name('export all edits (backup .json)');
  chars.add(a, 'importAll').name('import backup (.json)');
  chars.add(a, 'saveJSON').name('save this definition (.json)');
  chars.add(a, 'loadJSON').name('load definition (.json)');
  chars.add(a, 'exportGLB').name('export .glb');
  chars.open();
}

function buildViewFolder() {
  const view = gui.addFolder('View');
  view.add(state.view, 'mode', ['single', 'lineup', 'world']).onChange(() => { saveView(); buildGui(); rebuild(); syncWorld(); });
  view.add(state.view, 'clip', CLIP_NAMES).onChange((name) => { saveView(); entries.forEach((e) => stage.play(e, name)); });
  view.add(state.view, 'backdrop', Object.keys(BACKDROPS)).onChange((b) => { saveView(); stage.setBackdrop(b); });
  view.add(state.view, 'pipeline', Object.keys(RETRO_PRESETS)).onChange((p) => { saveView(); stage.setPreset(p); });
  view.add(state.view, 'turntable').onChange(saveView);
  view.close();
}

/** One control per schema field (see schema-controls.js); unset fields show their effective value as "(auto)". */
function buildDefinitionFolders() {
  const folders = new Map();
  for (const c of planControls(state.def)) {
    if (c.kind === 'folder') {
      folderFor(folders, [...c.folder, c.path[c.path.length - 1]]);
      continue;
    }
    const parent = folderFor(folders, c.folder);
    if (c.kind === 'toggle') {
      const model = { on: getPath(state.def, c.path) != null };
      const ctrl = parent.add(model, 'on').name(c.label).onChange((on) => {
        setPath(state.def, c.path, on ? defaultsFor(c.schema) : null);
        commit({ refreshGui: true });
      });
      ctrl.domElement.dataset.path = c.path.join('.');
      continue;
    }
    if (c.kind === 'accessory') {
      const model = { on: !!accessoryItem(c) };
      const ctrl = parent.add(model, 'on').name(c.label).onChange((on) => {
        const others = state.def.accessories.filter((x) => x.type !== c.accessory);
        state.def.accessories = on ? [...others, { type: c.accessory }] : others;
        commit({ refreshGui: true });
      });
      ctrl.domElement.dataset.path = c.path.join('.');
      continue;
    }
    const field = c.path[c.path.length - 1];
    const current = c.accessory ? accessoryItem(c)?.[field] : getPath(state.def, c.path);
    const auto = current === undefined;
    const model = { v: auto ? displayValue(c) : current };
    const assign = (v) => {
      if (c.accessory) {
        const item = accessoryItem(c);
        if (item) item[field] = v;
      } else setPath(state.def, c.path, v);
    };
    const refreshGui = auto || REFRESH_ON.has(c.path.join('.'));
    let ctrl;
    if (c.kind === 'number') ctrl = parent.add(model, 'v', c.min, c.max, c.step);
    else if (c.kind === 'color') ctrl = parent.addColor(model, 'v');
    else if (c.kind === 'enum') ctrl = parent.add(model, 'v', c.values);
    else ctrl = parent.add(model, 'v');
    ctrl.name(auto ? `${c.label} (auto)` : c.label);
    ctrl.domElement.dataset.path = c.path.join('.');
    if (c.kind === 'string' || c.kind === 'number') {
      // Dragging / typing saves every step (no rebuild); release, Enter or blur rebuilds.
      ctrl.onChange((v) => { assign(v); saveDraft(); });
      ctrl.onFinishChange((v) => { assign(v); commit({ refreshGui }); });
    } else {
      ctrl.onChange((v) => { assign(v); commit({ refreshGui }); });
    }
  }
  // A dress replaces top and bottom at build time; say so instead of silently ignoring edits there.
  if (state.def.dress) for (const key of ['top', 'bottom']) folders.get(key)?.title(`${key} (hidden under dress)`);
}

function buildGui() {
  if (gui) gui.destroy();
  gui = new GUI({ title: 'Character Creator' });
  updateCharacterTitle();
  buildCharactersFolder();
  buildViewFolder();
  if (state.view.mode === 'world') worldViewer.buildFolder(gui);
  buildDefinitionFolders();
}

/** Enters or leaves the world location (View → mode → world). */
function syncWorld() {
  if (state.view.mode === 'world') worldViewer.enter(entries);
  else {
    worldViewer.exit();
    stage.setBackdrop(state.view.backdrop);
    stage.camera.fov = 25;
    stage.camera.updateProjectionMatrix();
  }
}

let dragging = null;
container.addEventListener('pointerdown', (e) => { if (state.view.mode !== 'world') dragging = { x: e.clientX, yaw: state.view.yaw }; });
window.addEventListener('pointerup', () => {
  if (dragging) saveView();
  dragging = null;
});
window.addEventListener('pointermove', (e) => {
  if (dragging) state.view.yaw = dragging.yaw - (e.clientX - dragging.x) * 0.4;
});
container.addEventListener('wheel', (e) => {
  if (state.view.mode === 'world') return;
  state.view.zoom = THREE.MathUtils.clamp(state.view.zoom * (e.deltaY > 0 ? 1.1 : 0.9), 0.2, 2.5);
  saveView();
}, { passive: true });
window.addEventListener('resize', () => stage.setSize(window.innerWidth, window.innerHeight));

function frameView() {
  const lineup = state.view.mode === 'lineup';
  const aspect = window.innerWidth / window.innerHeight;
  const width = lineup ? MAIN_PRESETS.length * 1.0 + 0.4 : 0;
  const panel = 280 / window.innerWidth;
  const height = Math.max(lineup ? 2.3 : 2.1, width / (aspect * (1 - panel))) * state.view.zoom;
  const shiftX = (height * aspect * panel) / 2;
  const targetY = THREE.MathUtils.lerp(1.55, 0.95, THREE.MathUtils.clamp((state.view.zoom - 0.2) / 0.8, 0, 1));
  stage.frame({ target: new THREE.Vector3(shiftX, targetY, 0), height, yaw: state.view.yaw, pitch: 4 });
}

let lastFrame = performance.now();
function loop() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (state.view.mode === 'world') worldViewer.update(dt);
  else {
    if (state.view.turntable && !dragging) state.view.yaw += 0.3;
    frameView();
  }
  stage.update(dt);
  stage.render();
  updateSaveStatus();
  requestAnimationFrame(loop);
}

stage.setBackdrop(state.view.backdrop);
stage.setPreset(state.view.pipeline);
if (state.view.mode === 'world') worldViewer.ensureWorld();
buildGui();
rebuild();
syncWorld();
loop();
window.worldViewer = worldViewer;

/** Stable hash of every built mesh (bind-pose geometry + texture bytes): "the rendered character". */
function characterFingerprint(group) {
  let h = 2166136261;
  const parts = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    parts.push(o.name);
    const pos = o.geometry.attributes.position.array;
    h = hashBytes(new Uint8Array(pos.buffer, pos.byteOffset, pos.byteLength), h);
    if (o.material.map) h = hashBytes(o.material.map.image.data, h);
  });
  return { hash: h.toString(16), parts };
}

/** Test / debugging handle (the e2e scripts read it; nothing in the app depends on it). */
window.creator = {
  store,
  get def() {
    return clone(state.def);
  },
  get mode() {
    return state.view.mode;
  },
  get settled() {
    return rebuildTimer === null && !store.status.pending;
  },
  fingerprints: () => entries.map((e) => ({ id: e.character.userData.definition.id, ...characterFingerprint(e.character) })),
  select: selectCharacter,
};
window.__ready = true;
