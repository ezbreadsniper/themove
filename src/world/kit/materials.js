import * as THREE from 'three';
import { Raster } from '../../tex/raster.js';
import { createRng } from '../../core/rng.js';
import { ARCH_TEXTURES } from './tex-arch.js';
import { PROP_TEXTURES } from './tex-props.js';
import { DECAL_TEXTURES } from './tex-decals.js';

export const TEXTURE_SPECS = { ...ARCH_TEXTURES, ...PROP_TEXTURES, ...DECAL_TEXTURES };

/**
 * Material catalogue. kind: 'baked' (prelit Lambert, default), 'decal' (baked + blended, polygon
 * offset), 'cutout' (baked + alphaTest, double sided), 'glass', 'emissive' (unlit, for lamps,
 * screens and lit signs). `cast: false` keeps a material out of the sun shadow map.
 */
export const MATERIALS = {
  brick: { tex: 'brickRed' },
  brickTan: { tex: 'brickTan' },
  cmu: { tex: 'cmuPainted' },
  drywall: { tex: 'drywall' },
  concreteFloor: { tex: 'concretePolished' },
  concreteRough: { tex: 'concreteRough' },
  stoneTrim: { tex: 'stoneTrim' },
  deck: { tex: 'deckBlack' },
  steelBlack: { tex: 'steelBlack' },
  steelGray: { tex: 'steelGray' },
  galvanized: { tex: 'galvanized' },
  asphalt: { tex: 'asphalt' },
  asphaltPatch: { tex: 'asphaltPatch' },
  sidewalk: { tex: 'sidewalk' },
  curb: { tex: 'curb' },
  roof: { tex: 'roofMembrane' },
  dirt: { tex: 'dirt' },
  hedge: { tex: 'hedge' },
  bark: { tex: 'bark' },
  tileWhite: { tex: 'tileWhite' },
  lobbyFloor: { tex: 'floorTileLobby' },
  woodFloor: { tex: 'woodFloor' },
  windowShade: { tex: 'windowShade' },
  leather: { tex: 'leatherBlack' },
  maple: { tex: 'woodMaple' },
  laminate: { tex: 'laminateWhite' },
  cabinet: { tex: 'cabinetDark' },
  stainless: { tex: 'stainless' },
  knit: { tex: 'fabricKnit' },
  sage: { tex: 'fabricSage' },
  mustard: { tex: 'fabricMustard' },
  rainbow: { tex: 'pillowRainbow' },
  kilim: { tex: 'pillowKilim' },
  stripeBW: { tex: 'pillowStripeBW' },
  rug: { tex: 'rugPersian' },
  terracotta: { tex: 'terracotta' },
  ceramic: { tex: 'ceramicWhite' },
  redPaint: { tex: 'redPaint' },
  leafPalm: { tex: 'leafPalm', kind: 'cutout' },
  leafSpider: { tex: 'leafSpider', kind: 'cutout' },
  leafPothos: { tex: 'leafPothos', kind: 'cutout' },
  leafSnake: { tex: 'leafSnake', kind: 'cutout' },
  treeLeaves: { tex: 'treeLeaves', kind: 'cutout' },
  artGun: { tex: 'artGun' },
  artHands: { tex: 'artHands' },
  artAbstract: { tex: 'artAbstract' },
  artPrint: { tex: 'artPrint' },
  case48: { tex: 'case48' },
  mirror: { tex: 'mirror' },
  bedding: { tex: 'bedding' },
  books: { tex: 'books' },
  magazines: { tex: 'magazines' },
  signStop: { tex: 'signStop', kind: 'cutout' },
  signNoParking: { tex: 'signNoParking' },
  signLoading: { tex: 'signLoading' },
  signStreetName: { tex: 'signStreetName' },
  signStreetName2: { tex: 'signStreetName2' },
  signOneWay: { tex: 'signOneWay' },
  signBuilding: { tex: 'signBuilding' },
  ghostSign: { tex: 'ghostSign', kind: 'decal' },
  houseNumber: { tex: 'houseNumber' },
  graffiti: { tex: 'graffiti', kind: 'decal' },
  archWindow: { tex: 'archWindow', kind: 'cutout' },
  carWindow: { tex: 'carWindow' },
  tire: { tex: 'tire' },
  mailboxes: { tex: 'mailboxes' },
  dumpster: { tex: 'dumpsterSide' },
  trashBag: { tex: 'trashBag' },
  electricPanel: { tex: 'electricPanel' },
  perfHex: { tex: 'perfHex', kind: 'cutout' },
  crack: { tex: 'crack', kind: 'decal' },
  oilStain: { tex: 'oilStain', kind: 'decal' },
  rainStreak: { tex: 'rainStreak', kind: 'decal' },
  grime: { tex: 'grimeBase', kind: 'decal' },
  soot: { tex: 'soot', kind: 'decal' },
  paintWhite: { tex: 'paintWhite', kind: 'decal' },
  paintYellow: { tex: 'paintYellow', kind: 'decal' },
  curbYellow: { tex: 'curbYellow', kind: 'decal' },
  stencilLoading: { tex: 'stencilLoading', kind: 'decal' },
  leafLitter: { tex: 'leafLitter', kind: 'decal' },
  floorSheen: { tex: 'floorSheen', kind: 'decal', additive: true },
  gum: { tex: 'gumSpots', kind: 'decal' },
  manhole: { tex: 'manhole', kind: 'cutout' },
  drainGrate: { tex: 'drainGrate' },
  paintBlack: { color: '#1e1e1e' },
  paintWhiteGloss: { color: '#e2e0d8' },
  plasticBlack: { color: '#141415' },
  plasticWhite: { color: '#e8e8e4' },
  rubber: { color: '#1a1a1a' },
  chrome: { color: '#b9bec2' },
  brass: { color: '#a8843a' },
  woodDark: { color: '#3b2a1e' },
  concreteGray: { color: '#8c887f' },
  greenPaint: { color: '#2e5a3a' },
  yellowPaint: { color: '#d4a51c' },
  bluePaint: { color: '#1d4f9a' },
  hydrantRed: { color: '#a3201f' },
  carRed: { color: '#7a1c1c' },
  carBlue: { color: '#2a3d5a' },
  carWhite: { color: '#c9c6bd' },
  wire: { color: '#151515', cast: false },
  glass: { kind: 'glass', color: '#9fb4bf', opacity: 0.22 },
  glassDark: { kind: 'glass', color: '#2b3338', opacity: 0.78 },
  tv: { tex: 'tvScreen', kind: 'emissive' },
  bulbWarm: { color: '#ffd59a', kind: 'emissive' },
  bulbCool: { color: '#e8f0ff', kind: 'emissive' },
  sodium: { color: '#ffb35a', kind: 'emissive' },
  lavaLamp: { color: '#ff4a6a', kind: 'emissive' },
  worldIsYours: { tex: 'worldIsYours', kind: 'emissive', alphaTest: 0.5 },
  signExit: { tex: 'signExit', kind: 'emissive' },
  fakeInterior: { tex: 'fakeInterior', kind: 'emissive', dim: 0.55 },
  skyBlack: { color: '#000000', kind: 'emissive' },
};

const BAKE_UNIFORMS = { uBakeScale: { value: 1 } };

/** Shared uniform: scales every prelit material's baked light (exposure / time-of-day dimmer). */
export const bakeUniforms = BAKE_UNIFORMS;

function paintTexture(name) {
  const spec = TEXTURE_SPECS[name];
  if (!spec) throw new Error(`Unknown world texture ${name}`);
  const [w, h] = spec.size;
  const r = new Raster(w, h);
  const rng = createRng(`world:${name}`);
  spec.paint(r, rng);
  const cutout = spec.alpha || spec.decal;
  if (cutout) unpremultiply(r);
  else {
    r.grain(rng, 0.05);
    r.blocks(rng, 4, 0.035);
  }
  r.posterize(32);
  if (!cutout) for (let i = 3; i < r.data.length; i += 4) r.data[i] = 255;
  return r;
}

/** Painting onto a transparent raster blends colour toward black; restore straight alpha. */
function unpremultiply(r) {
  const d = r.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a === 0 || a === 255) continue;
    const k = 255 / a;
    d[i] = Math.min(255, d[i] * k);
    d[i + 1] = Math.min(255, d[i + 1] * k);
    d[i + 2] = Math.min(255, d[i + 2] * k);
  }
}

function toTexture(raster, name) {
  const tex = new THREE.DataTexture(raster.data, raster.width, raster.height, THREE.RGBAFormat);
  tex.name = name;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapNearestFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const LIGHTS_BAKED = THREE.ShaderChunk.lights_fragment_begin
  .replace('#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )', '#if 0')
  .replace('#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )', '#if 0')
  .replace('vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );', 'vec3 irradiance = vBake * PI * uBakeScale;')
  .replace('#if ( NUM_HEMI_LIGHTS > 0 )', '#if 0');

/**
 * Prelit Lambert: per-vertex `bake` (ambient sky, bounce, AO and every static light) replaces the
 * ambient/hemisphere term; the sun stays a live shadowed light; point/spot lights are ignored
 * because they are already in the bake (they exist only to light characters).
 */
function prelit(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBakeScale = BAKE_UNIFORMS.uBakeScale;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 bake;\nvarying vec3 vBake;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBake = bake;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBake;\nuniform float uBakeScale;')
      .replace('#include <lights_fragment_begin>', LIGHTS_BAKED);
  };
  material.customProgramCacheKey = () => 'world-prelit';
  material.userData.prelit = true;
  return material;
}

export class MaterialLibrary {
  constructor() {
    this.textures = new Map();
    this.materials = new Map();
  }

  texture(name) {
    if (!this.textures.has(name)) this.textures.set(name, toTexture(paintTexture(name), name));
    return this.textures.get(name);
  }

  /** Metres covered by one texture repeat for `materialName` ([1,1] when untextured). */
  tile(materialName) {
    const def = MATERIALS[materialName];
    if (!def) throw new Error(`Unknown world material ${materialName}`);
    return def.tex ? TEXTURE_SPECS[def.tex].tile : [1, 1];
  }

  def(name) {
    const def = MATERIALS[name];
    if (!def) throw new Error(`Unknown world material ${name}`);
    return def;
  }

  get(name) {
    if (this.materials.has(name)) return this.materials.get(name);
    const def = this.def(name);
    const map = def.tex ? this.texture(def.tex) : null;
    const color = new THREE.Color(def.color ?? '#ffffff');
    let m;
    if (def.kind === 'emissive') {
      m = new THREE.MeshBasicMaterial({ map, color: color.multiplyScalar(def.dim ?? 1), alphaTest: def.alphaTest ?? 0, side: THREE.DoubleSide });
    } else if (def.kind === 'glass') {
      m = prelit(new THREE.MeshLambertMaterial({ color, transparent: true, opacity: def.opacity, depthWrite: false, side: THREE.DoubleSide }));
    } else {
      m = prelit(new THREE.MeshLambertMaterial({ map, color }));
      if (def.kind === 'cutout') {
        m.alphaTest = 0.5;
        m.side = THREE.DoubleSide;
      }
      if (def.kind === 'decal') {
        m.transparent = true;
        m.depthWrite = false;
        m.polygonOffset = true;
        m.polygonOffsetFactor = -2;
        m.polygonOffsetUnits = -4;
        if (def.additive) m.blending = THREE.AdditiveBlending;
      }
    }
    m.name = name;
    m.userData.kind = def.kind ?? 'baked';
    m.userData.cast = def.cast ?? !['decal', 'glass', 'emissive'].includes(def.kind);
    this.materials.set(name, m);
    return m;
  }
}
