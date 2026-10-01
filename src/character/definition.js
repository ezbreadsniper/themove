import { isHexColor } from '../core/color.js';
import { FABRIC_NAMES } from '../tex/fabric.js';
import { DEFAULT_PROPORTIONS } from '../rig/skeleton.js';
import { FACE_PRESET_NAMES } from './faces.js';
import { HAIR_STYLES } from '../geo/parts/hair.js';
import { SHOE_TYPES } from '../geo/parts/shoes.js';

export const DEFINITION_VERSION = 1;
export const RIG_PROFILES = ['mixamo-core-22'];

const num = (min, max, def) => ({ type: 'number', min, max, default: def });
const color = (def) => ({ type: 'color', default: def });
const oneOf = (values, def) => ({ type: 'enum', values, default: def });
const bool = (def) => ({ type: 'boolean', default: def });
const str = (def) => ({ type: 'string', default: def });
const obj = (fields, { nullable = false } = {}) => ({ type: 'object', fields, nullable });

const FACE_FIELDS = {
  preset: oneOf(FACE_PRESET_NAMES, 'soft'),
  headWidth: num(0.88, 1.12, undefined),
  headDepth: num(0.9, 1.1, undefined),
  foreheadSlope: num(-1, 1, undefined),
  browHeight: num(-1, 1, undefined),
  browRidge: num(0.5, 1.6, undefined),
  browThickness: num(0.6, 1.6, undefined),
  browTilt: num(-1, 1, undefined),
  browGap: num(-1, 1, undefined),
  eyeShape: oneOf(['almond', 'round', 'hooded', 'narrow'], undefined),
  eyeSize: num(0.8, 1.25, undefined),
  eyeSpacing: num(0.85, 1.15, undefined),
  eyeHeight: num(-1, 1, undefined),
  eyeTilt: num(-1, 1, undefined),
  eyeDepth: num(-1, 1, undefined),
  lidHeaviness: num(0, 1, undefined),
  lashes: num(0, 1, undefined),
  irisColor: color(undefined),
  noseWidth: num(0.7, 1.6, undefined),
  noseLength: num(0.8, 1.25, undefined),
  noseProjection: num(0.6, 1.4, undefined),
  noseBridge: num(-1, 1, undefined),
  noseTip: num(-1, 1, undefined),
  noseTilt: num(-1, 1, undefined),
  nostrilFlare: num(-1, 1, undefined),
  cheekbones: num(0.8, 1.3, undefined),
  cheekFullness: num(-1, 1, undefined),
  mouthWidth: num(0.8, 1.25, undefined),
  mouthHeight: num(-1, 1, undefined),
  mouthCorners: num(-1, 1, undefined),
  lipFullness: num(0.6, 1.6, undefined),
  upperLip: num(0.5, 1.6, undefined),
  lowerLip: num(0.5, 1.6, undefined),
  lipTone: num(0.5, 1.3, undefined),
  jawWidth: num(0.8, 1.25, undefined),
  jawDefinition: num(0, 1, undefined),
  chinLength: num(0.8, 1.25, undefined),
  chinWidth: num(-1, 1, undefined),
  chinProjection: num(-1, 1, undefined),
  cleftChin: num(0, 1, undefined),
  earSize: num(0.75, 1.3, undefined),
  earProtrusion: num(-1, 1, undefined),
  earHeight: num(-1, 1, undefined),
  earLobe: num(-1, 1, undefined),
  facialHair: oneOf(['none', 'stubble', 'goatee', 'lightBeard', 'mustache', 'shortBeard', 'fullBeard', 'chinStrap', 'vanDyke', 'circle', 'soulPatch', 'handlebar', 'horseshoe', 'pencil', 'muttonChops', 'fiveOClock', 'patchy', 'balbo', 'anchor', 'chevron', 'walrus', 'boxed', 'bushy', 'longBeard', 'ducktail', 'garibaldi', 'longGoatee', 'verdi'], 'none'),
  facialHairDensity: num(0, 1, 0.5),
  facialHairColor: color(undefined),
};

export const SCHEMA = obj({
  version: num(1, DEFINITION_VERSION, DEFINITION_VERSION),
  id: str('custom'),
  name: str('Custom'),
  seed: str('seed'),
  rig: oneOf(RIG_PROFILES, 'mixamo-core-22'),
  lod: oneOf([0, 1], 0),
  body: obj({
    height: num(1.5, 2.05, DEFAULT_PROPORTIONS.height),
    build: num(0, 1, DEFAULT_PROPORTIONS.build),
    shoulders: num(0.85, 1.2, 1),
    hips: num(0.85, 1.2, 1),
    legLength: num(0.9, 1.1, 1),
    armLength: num(0.9, 1.1, 1),
    headSize: num(0.9, 1.15, 1),
    neckLength: num(0.7, 1.3, 1),
    age: num(14, 80, 28),
    muscle: num(0, 1, 0.4),
    feminine: num(0, 1, 0),
    bust: num(0, 1, 0),
    waist: num(0.8, 1.2, 1),
    butt: num(0, 1, 0.3),
    thighs: num(0.8, 1.25, 1),
  }),
  skin: obj({ tone: color('#9d6a45') }),
  face: obj(FACE_FIELDS),
  hair: obj({
    style: oneOf(Object.keys(HAIR_STYLES), 'crop'),
    color: color('#161210'),
    rootColor: color(undefined),
    grey: num(0, 1, 1),
    recession: num(0, 1, undefined),
  }),
  top: obj({
    type: oneOf(['tee', 'rugby', 'longsleeve', 'football', 'tank', 'cami', 'tube'], 'tee'),
    fit: num(0, 1, 0.6),
    length: num(-0.2, 0.2, 0.07),
    sleeve: oneOf(['short', 'long', 'none'], 'short'),
    collar: oneOf(['crew', 'polo'], 'crew'),
    color: color('#1b1b1d'),
    trim: color(undefined),
    pattern: oneOf(['plain', 'rugby', 'stripes'], 'plain'),
    fabric: oneOf(FABRIC_NAMES, 'cotton'),
    print: oneOf(['none', 'blockPatch'], 'none'),
    stripe: color(undefined),
    collarColor: color(undefined),
    cuff: color(undefined),
    number: { type: 'string', default: undefined },
  }, { nullable: true }),
  outer: obj({
    type: oneOf(['vest', 'hoodie', 'zipHoodie', 'track', 'bomber', 'denimJacket', 'puffer'], 'vest'),
    fit: num(0, 1, 0.5),
    color: color('#7e9dbd'),
    studs: color('#c9ccd2'),
    stitch: color(undefined),
    open: bool(false),
    fabric: oneOf(FABRIC_NAMES, undefined),
    hood: bool(true),
    length: num(-0.06, 0.2, undefined),
    trim: color(undefined),
    stripe: color(undefined),
  }, { nullable: true }),
  bottom: obj({
    type: oneOf(['jeans', 'pants', 'shorts', 'skirt'], 'jeans'),
    skirtLength: num(0.1, 0.95, 0.35),
    skirtStyle: oneOf(['pencil', 'aLine', 'flared', 'pleated'], 'aLine'),
    length: oneOf(['full', 'ankle', 'cropped', 'shorts', 'cutoff'], 'full'),
    fitClass: oneOf(['auto', 'slim', 'straight', 'jeans', 'wide', 'jogger', 'cropped', 'shorts'], 'auto'),
    rise: num(-0.02, 0.1, undefined),
    fray: bool(false),
    cinch: bool(false),
    cut: oneOf(['straight', 'skinny', 'tapered', 'bootcut', 'flare', 'wide', 'barrel'], 'straight'),
    rips: oneOf(['none', 'knees', 'distressed', 'shredded'], 'none'),
    sideStripe: color(undefined),
    doubleKnee: bool(false),
    carpenter: bool(false),
    pintuck: bool(false),
    kind: oneOf(FABRIC_NAMES, 'denim'),
    fit: num(0, 1, 0.7),
    color: color('#4c6788'),
    wash: num(0, 1, 0.5),
    whiskers: bool(true),
    stack: num(0, 1.5, 1),
    drawstring: color(undefined),
    cuff: num(0, 0.08, 0),
    selvedge: bool(false),
    cargo: bool(false),
    pattern: oneOf(['none', 'camo'], 'none'),
    belt: obj({ color: color('#141414'), buckle: color('#c9ccd2') }, { nullable: true }),
    stitch: color(undefined),
  }, { nullable: true }),
  socks: obj({ color: color('#e4e2dc'), height: num(0.1, 0.35, 0.2) }, { nullable: true }),
  shoes: obj({
    type: oneOf(SHOE_TYPES, 'canvasLow'),
    upper: color('#1d1d20'),
    sole: color('#e4e2dc'),
    accent: color(undefined),
    toeCap: bool(false),
    size: num(0.9, 1.25, 1),
  }),
  tattoos: obj({
    left: oneOf(['none', 'sleeve', 'patchwork', 'floral', 'half', 'sparse'], 'none'),
    right: oneOf(['none', 'sleeve', 'patchwork', 'floral', 'half', 'sparse'], 'none'),
    ink: color('#2a3038'),
  }),
  accessories: { type: 'array', default: [] },
});

export const ACCESSORY_SCHEMAS = {
  cap: obj({ type: str('cap'), color: color('#1f2635'), bill: num(0.04, 0.1, 0.075), tilt: num(-1, 1, 0), front: color(undefined), billColor: color(undefined), stars: bool(false), style: oneOf(['baseball', 'trucker'], 'baseball'), patch: oneOf(['none', 'gothicCross', 'stars'], 'none'), mesh: color(undefined) }),
  glasses: obj({ type: str('glasses'), color: color('#4a3322'), width: num(0.8, 1.3, 1), height: num(0.7, 1.3, 1), frame: oneOf(['rect', 'round', 'aviator'], 'rect') }),
  balaclava: obj({ type: str('balaclava'), color: color('#6a6a6c') }),
  beanie: obj({ type: str('beanie'), color: color('#2a2a2e'), cuff: bool(true), slouch: num(0, 1, 0) }),
  bucket: obj({ type: str('bucket'), color: color('#d8d2c0') }),
  durag: obj({ type: str('durag'), color: color('#1a1a1c') }),
  headband: obj({ type: str('headband'), color: color('#e8e6e0') }),
  earrings: obj({ type: str('earrings'), color: color('#e8e8ec'), size: num(0.5, 2, 1) }),
  watch: obj({ type: str('watch'), color: color('#c9ccd0') }),
  bracelet: obj({ type: str('bracelet'), color: color('#d4a93c') }),
  cigarette: obj({ type: str('cigarette') }),
  shades: obj({ type: str('shades'), color: color('#b8c4d4'), frame: color('#d0d4da') }),
  chains: obj({ type: str('chains'), color: color('#d4a93c'), count: num(1, 4, 3), pendant: bool(true), thickness: num(0.002, 0.008, 0.006) }),
};

function validateValue(schema, value, path, errors) {
  if (value === undefined || value === null) {
    if (schema.type === 'object' && schema.nullable) return null;
    if (schema.type === 'object') return validateValue(schema, {}, path, errors);
    if (schema.type === 'array') return [];
    return schema.default;
  }
  switch (schema.type) {
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        errors.push(`${path}: expected number, got ${JSON.stringify(value)}`);
        return schema.default;
      }
      if (value < schema.min || value > schema.max) {
        errors.push(`${path}: ${value} outside [${schema.min}, ${schema.max}], clamped`);
        return Math.min(schema.max, Math.max(schema.min, value));
      }
      return value;
    }
    case 'color':
      if (!isHexColor(value)) {
        errors.push(`${path}: expected #rrggbb colour, got ${JSON.stringify(value)}`);
        return schema.default;
      }
      return value.toLowerCase();
    case 'enum':
      if (!schema.values.includes(value)) {
        errors.push(`${path}: expected one of ${schema.values.join(', ')}, got ${JSON.stringify(value)}`);
        return schema.default;
      }
      return value;
    case 'boolean':
      return Boolean(value);
    case 'string':
      if (typeof value !== 'string' || value.length > 80) {
        errors.push(`${path}: expected string up to 80 chars`);
        return schema.default;
      }
      return value;
    case 'array': {
      if (!Array.isArray(value)) {
        errors.push(`${path}: expected array`);
        return [];
      }
      return value.slice(0, 16).map((item, i) => {
        const itemSchema = ACCESSORY_SCHEMAS[item?.type];
        if (!itemSchema) {
          errors.push(`${path}[${i}]: unknown accessory ${JSON.stringify(item?.type)}`);
          return null;
        }
        return validateValue(itemSchema, item, `${path}[${i}]`, errors);
      }).filter(Boolean);
    }
    case 'object': {
      if (typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`${path}: expected object`);
        return validateValue(schema, {}, path, errors);
      }
      const out = {};
      for (const [key, sub] of Object.entries(schema.fields)) {
        const v = validateValue(sub, value[key], path ? `${path}.${key}` : key, errors);
        if (v !== undefined) out[key] = v;
      }
      for (const key of Object.keys(value)) {
        if (!(key in schema.fields)) errors.push(`${path ? `${path}.` : ''}${key}: unknown field ignored`);
      }
      return out;
    }
    default:
      return value;
  }
}

/**
 * Validates and normalizes a character definition. Never throws on bad data: returns the
 * repaired definition plus a list of problems so the creator can show them.
 */
/** Fully-defaulted value for any schema node (used when the creator switches a slot on). */
export function defaultsFor(schema) {
  return validateValue(schema, {}, '', []);
}

export function normalizeDefinition(input) {
  const errors = [];
  if (input === null || typeof input !== 'object') {
    errors.push('definition: expected an object');
    input = {};
  }
  const value = validateValue(SCHEMA, input, '', errors);
  return { value, errors, ok: errors.length === 0 };
}

export function serializeDefinition(def) {
  return JSON.stringify(normalizeDefinition(def).value, null, 2);
}

export function parseDefinition(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { value: null, errors: [`JSON parse error: ${err.message}`], ok: false };
  }
  return normalizeDefinition(raw);
}
