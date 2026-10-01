import * as THREE from 'three';
import GUI from 'lil-gui';
import { Stage, BACKDROPS } from '../render/stage.js';
import { RETRO_PRESETS } from '../render/retro-pipeline.js';
import { buildCharacter, disposeCharacter } from '../character/build.js';
import { normalizeDefinition, serializeDefinition, parseDefinition, defaultsFor } from '../character/definition.js';
import { FACE_PRESETS } from '../character/faces.js';
import { DEFAULT_FACE } from '../geo/parts/head.js';
import { PRESETS, PRESETS_BY_ID, MAIN_PRESETS } from '../character/presets/index.js';
import { CLIP_NAMES } from '../anim/clips.js';
import { exportCharacterGLB } from '../export/gltf.js';
import { createEditStore } from './edits.js';
import { planControls, labelFor } from './schema-controls.js';

const container = document.getElementById('view');
const hud = document.getElementById('hud');
const errorBox = document.getElementById('errors');
const stage = new Stage(container, { width: window.innerWidth, height: window.innerHeight, backdrop: 'menu', preserveDrawingBuffer: false });

const clone = (o) => JSON.parse(JSON.stringify(o));
let storage = null;
try {
  storage = window.localStorage;
} catch {
  storage = null;
}
const store = createEditStore(storage, PRESETS_BY_ID);
const LINEUP = 'all characters (lineup)';
const urlLineup = new URLSearchParams(window.location.search).get('mode') === 'lineup';
const startId = store.activeId && store.get(store.activeId) ? store.activeId : PRESETS[0].id;

const state = {
  def: normalizeDefinition(store.get(startId)).value,
  view: { mode: 'single', clip: 'idle', backdrop: 'menu', pipeline: 'ps2', turntable: false, yaw: 0, zoom: 1, ...store.view, ...(urlLineup ? { mode: 'lineup' } : {}) },
  open: store.openFolders,
};

let entries = [];
let gui = null;

function showErrors(list) {
  errorBox.textContent = list.length ? `Definition warnings:\n${list.slice(0, 8).join('\n')}` : '';
}

function rebuild() {
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
  } catch (err) {
    errorBox.textContent = `Build failed: ${err.message}`;
    throw err;
  }
  updateHud();
}

let rebuildTimer = null;
function commit({ refreshGui = false } = {}) {
  state.def = normalizeDefinition(state.def).value;
  store.save(state.def);
  store.activeId = state.def.id;
  if (refreshGui) buildGui();
  else updateCharacterTitle();
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(rebuild, 120);
}

function saveView() {
  store.setView(state.view);
}

function updateHud() {
  const s = entries[0]?.character.userData.stats;
  if (!s) return;
  const edited = state.view.mode !== 'lineup' && store.isEdited(state.def.id) ? '  (edited, saved locally)' : '';
  const name = state.view.mode === 'lineup' ? 'Lineup (local edits applied)' : state.def.name;
  hud.textContent = `${name}${edited}\n${s.triangles} tris  ${s.drawCalls} draws  ${s.textures} tex (${Math.round(s.textureBytes / 1024)} KB)\nclip: ${state.view.clip}   drag = orbit, wheel = zoom`;
}

function download(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
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

function updateCharacterTitle() {
  if (!gui) return;
  const name = state.view.mode === 'lineup' ? 'Lineup' : `${state.def.name}${store.isEdited(state.def.id) ? ' *' : ''}`;
  gui.title(`Character Creator: ${name}`);
}

function characterActions() {
  return {
    revert: () => {
      const restored = store.revert(state.def.id);
      if (restored) state.def = normalizeDefinition(restored).value;
      buildGui();
      rebuild();
    },
    revertAll: () => {
      if (!window.confirm('Revert ALL characters to their shipped presets? All local edits will be lost.')) return;
      store.revertAll();
      const id = PRESETS_BY_ID[state.def.id] ? state.def.id : PRESETS[0].id;
      state.def = normalizeDefinition(store.get(id)).value;
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
    saveJSON: () => download(`${state.def.id}.json`, serializeDefinition(state.def), 'application/json'),
    loadJSON: () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.onchange = async () => {
        const parsed = parseDefinition(await input.files[0].text());
        if (!parsed.value) {
          errorBox.textContent = parsed.errors.join('\n');
          return;
        }
        state.def = parsed.value;
        state.view.mode = 'single';
        commit({ refreshGui: true });
        showErrors(parsed.errors);
      };
      input.click();
    },
    exportGLB: async () => {
      const glb = await exportCharacterGLB(buildCharacter(state.def));
      download(`${state.def.id}.glb`, glb, 'model/gltf-binary');
    },
  };
}

function buildCharactersFolder() {
  const chars = gui.addFolder('Characters');
  const options = [LINEUP, ...PRESETS.map((p) => p.id), ...store.customIds()];
  const pick = { character: state.view.mode === 'lineup' ? LINEUP : state.def.id };
  chars.add(pick, 'character', options).name('load').onChange((id) => {
    if (id === LINEUP) {
      state.view.mode = 'lineup';
      state.view.yaw = 0;
    } else {
      state.view.mode = 'single';
      state.def = normalizeDefinition(store.get(id)).value;
      store.activeId = id;
    }
    saveView();
    buildGui();
    rebuild();
  });
  if (state.view.mode === 'lineup') {
    const editing = { id: MAIN_PRESETS.some((p) => p.id === state.def.id) ? state.def.id : MAIN_PRESETS[0].id };
    chars.add(editing, 'id', MAIN_PRESETS.map((p) => p.id)).name('editing').onChange((id) => {
      state.def = normalizeDefinition(store.get(id)).value;
      store.activeId = id;
      buildGui();
    });
    if (!MAIN_PRESETS.some((p) => p.id === state.def.id)) {
      state.def = normalizeDefinition(store.get(editing.id)).value;
      store.activeId = editing.id;
    }
  }
  const a = characterActions();
  chars.add(a, 'revert').name('revert this character');
  chars.add(a, 'revertAll').name('revert ALL characters');
  chars.add(a, 'duplicate').name('duplicate as new character');
  chars.add(a, 'randomSeed').name('new random seed');
  chars.add(a, 'saveJSON').name('save definition (.json)');
  chars.add(a, 'loadJSON').name('load definition (.json)');
  chars.add(a, 'exportGLB').name('export .glb');
  chars.open();
}

function buildViewFolder() {
  const view = gui.addFolder('View');
  view.add(state.view, 'mode', ['single', 'lineup']).onChange(() => { saveView(); buildGui(); rebuild(); });
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
      parent.add(model, 'on').name(c.label).onChange((on) => {
        setPath(state.def, c.path, on ? defaultsFor(c.schema) : null);
        commit({ refreshGui: true });
      });
      continue;
    }
    if (c.kind === 'accessory') {
      const model = { on: !!accessoryItem(c) };
      parent.add(model, 'on').name(c.label).onChange((on) => {
        state.def.accessories = on ? [...state.def.accessories, { type: c.accessory }] : state.def.accessories.filter((x) => x.type !== c.accessory);
        commit({ refreshGui: true });
      });
      continue;
    }
    const field = c.path[c.path.length - 1];
    const current = c.accessory ? accessoryItem(c)?.[field] : getPath(state.def, c.path);
    const auto = current === undefined;
    const model = { v: auto ? displayValue(c) : current };
    const write = (v) => {
      if (c.accessory) accessoryItem(c)[field] = v;
      else setPath(state.def, c.path, v);
      commit({ refreshGui: auto || c.path.join('.') === 'face.preset' });
    };
    let ctrl;
    if (c.kind === 'number') ctrl = parent.add(model, 'v', c.min, c.max, c.step);
    else if (c.kind === 'color') ctrl = parent.addColor(model, 'v');
    else if (c.kind === 'enum') ctrl = parent.add(model, 'v', c.values);
    else ctrl = parent.add(model, 'v');
    ctrl.name(auto ? `${c.label} (auto)` : c.label);
    if (c.kind === 'string' || c.kind === 'number') ctrl.onFinishChange(write);
    else ctrl.onChange(write);
  }
}

function buildGui() {
  if (gui) gui.destroy();
  gui = new GUI({ title: 'Character Creator' });
  updateCharacterTitle();
  buildCharactersFolder();
  buildViewFolder();
  buildDefinitionFolders();
}

let dragging = null;
container.addEventListener('pointerdown', (e) => { dragging = { x: e.clientX, yaw: state.view.yaw }; });
window.addEventListener('pointerup', () => {
  if (dragging) saveView();
  dragging = null;
});
window.addEventListener('pointermove', (e) => {
  if (dragging) state.view.yaw = dragging.yaw - (e.clientX - dragging.x) * 0.4;
});
container.addEventListener('wheel', (e) => {
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

function loop() {
  if (state.view.turntable && !dragging) state.view.yaw += 0.3;
  frameView();
  stage.update();
  stage.render();
  requestAnimationFrame(loop);
}

stage.setBackdrop(state.view.backdrop);
stage.setPreset(state.view.pipeline);
buildGui();
rebuild();
loop();
window.__ready = true;
