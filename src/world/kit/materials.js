import * as THREE from 'three';
import { Raster } from '../../tex/raster.js';
import { createRng } from '../../core/rng.js';
import { ARCH_TEXTURES } from './tex-arch.js';
import { PROP_TEXTURES } from './tex-props.js';
import { DECAL_TEXTURES } from './tex-decals.js';
import { ATLAS_TEXTURES } from './decal-atlas.js';

export const TEXTURE_SPECS = { ...ARCH_TEXTURES, ...PROP_TEXTURES, ...DECAL_TEXTURES, ...ATLAS_TEXTURES };

/**
 * Material catalogue. kind: 'baked' (prelit Lambert, default), 'decal' (baked + blended, polygon
 * offset), 'cutout' (baked + alphaTest, double sided), 'glass', 'emissive' (unlit, for lamps,
 * screens and lit signs). `cast: false` keeps a material out of the sun shadow map.
 */
export const MATERIALS = {
  brick: { tex: 'brickRed' },
  brickTan: { tex: 'brickTan' },
  cmu: { tex: 'cmuPainted' },
  cmuDark: { tex: 'cmuPainted', color: '#7f8c8a' },
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
  rug: { tex: 'rugPersian' },
  marbleBlack: { tex: 'marbleBlack' },
  cardboard: { tex: 'cardboard' },
  doormat: { tex: 'doormat' },
  ceilingTile: { tex: 'ceilingTile' },
  plasterWhite: { tex: 'plasterWhite' },
  decals: { tex: 'decalAtlas', kind: 'decal' },
  decalsCut: { tex: 'decalAtlas', kind: 'cutout', cast: false },
  terracotta: { tex: 'terracotta' },
  ceramic: { tex: 'ceramicWhite' },
  redPaint: { tex: 'redPaint' },
  leafPalm: { tex: 'leafPalm', kind: 'cutout' },
  leafSpider: { tex: 'leafSpider', kind: 'cutout' },
  leafPothos: { tex: 'leafPothos', kind: 'cutout' },
  leafSnake: { tex: 'leafSnake', kind: 'cutout' },
  treeLeaves: { tex: 'treeLeaves', kind: 'cutout' },
  artPop: { tex: 'artPop' },
  artPhoto: { tex: 'artPhoto' },
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
  denim: { color: '#3b4f6e' },
  plasticGrey: { color: '#6e6c68' },
  paintRadiator: { color: '#8d8a80' },
  copper: { color: '#9a5a36' },
  sprinklerRed: { color: '#8e2420' },
  bronze: { color: '#4a4036' },
  trimDark: { color: '#2b2926' },
  paper: { color: '#e8e4da' },
  bottleGreen: { color: '#24442c' },
  bottleBrown: { color: '#4a2a14' },
  glassLager: { color: '#c9d3a4' },
  oliveDrab: { color: '#4b5233' },
  candleJar: { color: '#c9b48c' },
  wire: { color: '#151515', cast: false },
  glass: { kind: 'glass', color: '#9fb4bf', opacity: 0.22 },
  glassDark: { kind: 'glass', color: '#2b3338', opacity: 0.78 },
  tv: { tex: 'tvScreen', kind: 'emissive' },
  bulbWarm: { color: '#ffd59a', kind: 'emissive' },
  bulbCool: { color: '#e8f0ff', kind: 'emissive' },
  sodium: { color: '#ffb35a', kind: 'emissive' },
  lavaLamp: { color: '#ff4a6a', kind: 'emissive' },
  bulbTube: { color: '#dfeaf2', kind: 'emissive' },
  exitGlow: { color: '#ff3a2a', kind: 'emissive' },
  doorSpill: { tex: 'beamGrad', color: '#ffb866', kind: 'beam', opacity: 0.85 },
  beamWarm: { tex: 'beamGrad', color: '#ffc989', kind: 'beam', opacity: 0.16 },
  beamCool: { tex: 'beamGrad', color: '#bcd2ec', kind: 'beam', opacity: 0.14 },
  beamSodium: { tex: 'beamGrad', color: '#ff9a40', kind: 'beam', opacity: 0.05 },
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
    r.grain(rng, spec.grain ?? 0.05);
    r.blocks(rng, 4, spec.blocks ?? 0.035);
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

const MAX_LAYERS = 32;

/** Shadow subtraction: each of the rig's two shadowed spot slots removes its layer's baked light. */
const SHADOW_SLOT = (i) => /* glsl */ `
#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > ${i}
  if ( receiveShadow ) {
    float sh${i} = getShadow( spotShadowMap[ ${i} ], spotLightShadows[ ${i} ].shadowMapSize, spotLightShadows[ ${i} ].shadowIntensity, spotLightShadows[ ${i} ].shadowBias, spotLightShadows[ ${i} ].shadowRadius, vSpotLightCoord[ ${i} ] );
    irradiance -= vSlotBake${i} * ( 1.0 - sh${i} ) * PI * uBakeScale;
  }
#endif`;

const LIGHTS_BAKED = THREE.ShaderChunk.lights_fragment_begin
  .replace('#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )', '#if 0')
  .replace('#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )', '#if 0')
  .replace('vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );', `vec3 irradiance = vBake * PI * uBakeScale;${SHADOW_SLOT(0)}${SHADOW_SLOT(1)}\nirradiance = max( irradiance, vec3( 0.0 ) );`)
  .replace('#if ( NUM_HEMI_LIGHTS > 0 )', '#if 0');

for (const needle of ['NUM_POINT_LIGHTS > 0 ) && defined', 'getAmbientLightIrradiance( ambientLightColor );', 'NUM_HEMI_LIGHTS > 0 )']) {
  if (!THREE.ShaderChunk.lights_fragment_begin.includes(needle)) throw new Error(`prelit shader: three.js chunk changed (${needle})`);
}

const LAYER_UNIFORMS_GLSL = `uniform vec3 uLayerColor[ ${MAX_LAYERS} ];\nuniform float uLayerScale[ ${MAX_LAYERS} ];`;

const PRELIT_VERTEX = /* glsl */ `
vBake = bake * uSkyScale + bakeStatic;
vSlotBake0 = vec3( 0.0 );
vSlotBake1 = vec3( 0.0 );
for ( int k = 0; k < 4; k ++ ) {
  float id = bakeLayer[ k ];
  if ( id < 0.0 ) continue;
  int li = int( id + 0.5 );
  vec3 c = uLayerColor[ li ] * bakeLayerW[ k ] * uLayerScale[ li ];
  vBake += c;
  if ( abs( id - uSlotLayer[ 0 ] ) < 0.5 ) vSlotBake0 += c;
  if ( abs( id - uSlotLayer[ 1 ] ) < 0.5 ) vSlotBake1 += c;
}`;

/**
 * Prelit Lambert: the per-vertex bake (sky × time-of-day, static lights, and up to four runtime-
 * scaled light layers) replaces the ambient/hemisphere term; the sun stays a live shadowed light;
 * point/spot lights are not added (they are in the bake and exist to light characters), except that
 * the rig's shadowed spot slots subtract their own layer's light where the spot's shadow map says a
 * dynamic caster blocks it.
 */
function prelit(material, U) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uBakeScale: U.uBakeScale, uSkyScale: U.uSkyScale, uLayerColor: U.uLayerColor, uLayerScale: U.uLayerScale, uSlotLayer: U.uSlotLayer });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec3 bake;\nattribute vec3 bakeStatic;\nattribute vec4 bakeLayer;\nattribute vec4 bakeLayerW;\n${LAYER_UNIFORMS_GLSL}\nuniform float uSkyScale;\nuniform float uSlotLayer[ 2 ];\nvarying vec3 vBake;\nvarying vec3 vSlotBake0;\nvarying vec3 vSlotBake1;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${PRELIT_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBake;\nvarying vec3 vSlotBake0;\nvarying vec3 vSlotBake1;\nuniform float uBakeScale;')
      .replace('#include <lights_fragment_begin>', LIGHTS_BAKED);
  };
  material.customProgramCacheKey = () => 'world-prelit-2';
  material.userData.prelit = true;
  return material;
}

/** Unlit glow (bulbs, screens, signs, beams) scaled by its light layer: `emit` = layer or -1. */
function layered(material, U, key) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uLayerScale: U.uLayerScale, uEmitFloor: U.uEmitFloor });
    // beams (fake light shafts) also fade with view distance: additive cards must not glow through fog
    const fade = key === 'beam' ? '\nvEmit *= clamp( 1.0 - ( -mvPosition.z - 3.0 ) / 13.0, 0.0, 1.0 ) * clamp( ( -mvPosition.z - 0.4 ) / 1.6, 0.0, 1.0 );' : '';
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float emit;\nuniform float uLayerScale[ ${MAX_LAYERS} ];\nvarying float vEmit;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmit = emit < 0.0 ? 1.0 : uLayerScale[ int( emit + 0.5 ) ];')
      .replace('#include <project_vertex>', `#include <project_vertex>${fade}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vEmit;\nuniform float uEmitFloor;')
      .replace('#include <color_fragment>', `#include <color_fragment>\n${key === 'beam' ? 'diffuseColor.rgb *= vEmit;' : 'diffuseColor.rgb *= max( vEmit, uEmitFloor );'}`);
  };
  material.customProgramCacheKey = () => `world-layered-${key}`;
  return material;
}

/** Uniforms shared by every material of one library (one World). */
export function createLightUniforms() {
  return {
    uBakeScale: BAKE_UNIFORMS.uBakeScale,
    uSkyScale: { value: 1 },
    uLayerColor: { value: Array.from({ length: MAX_LAYERS }, () => new THREE.Vector3(1, 1, 1)) },
    uLayerScale: { value: new Array(MAX_LAYERS).fill(1) },
    uSlotLayer: { value: [-1, -1] },
    uEmitFloor: { value: 0.07 },
  };
}

export class MaterialLibrary {
  constructor() {
    this.textures = new Map();
    this.materials = new Map();
    this.uniforms = createLightUniforms();
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
    const U = this.uniforms;
    let m;
    if (def.kind === 'emissive') {
      // single-sided: a sign or screen seen from behind would read mirrored (e.g. "TIXE")
      m = layered(new THREE.MeshBasicMaterial({ map, color: color.multiplyScalar(def.dim ?? 1), alphaTest: def.alphaTest ?? 0, side: def.doubleSide ? THREE.DoubleSide : THREE.FrontSide }), U, 'emissive');
    } else if (def.kind === 'beam') {
      m = layered(new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity: def.opacity ?? 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }), U, 'beam');
    } else if (def.kind === 'glass') {
      m = prelit(new THREE.MeshLambertMaterial({ color, transparent: true, opacity: def.opacity, depthWrite: false, side: THREE.DoubleSide }), U);
    } else {
      m = prelit(new THREE.MeshLambertMaterial({ map, color }), U);
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
    m.userData.cast = def.cast ?? !['decal', 'glass', 'emissive', 'beam'].includes(def.kind);
    this.materials.set(name, m);
    return m;
  }
}
