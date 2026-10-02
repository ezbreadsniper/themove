import * as THREE from 'three';
import { createRng } from '../core/rng.js';
import { hexToRgb, rgbToHex, mix } from '../core/color.js';
import { computeJointLayout, createSkeleton } from '../rig/skeleton.js';
import { normalizeDefinition } from './definition.js';
import { FACE_PRESETS } from './faces.js';
import { buildBody, TORSO_KEYS } from '../geo/parts/body.js';
import { createHeadShape, buildHead, buildMouth } from '../geo/parts/head.js';
import { buildHair, hairlineFor, HAIR_STYLES } from '../geo/parts/hair.js';
import { buildTop, buildVest, buildBottom, buildSocks } from '../geo/parts/garments.js';
import { buildShoes, shoeCoversFoot, shoeIsShiny, shoeFootLift, shoeDoubleSided, shoeCollider, SHOE_TYPES } from '../geo/parts/shoes.js';
import { bakeAnkleCorrectives, bakeHipCorrectives } from '../garment/correctives.js';
import { bakeBodyCorrectives } from '../rig/body-correctives.js';
import { collisionMargin } from '../garment/fabric-physics.js';
import { LAYER_GAP } from '../garment/layers.js';
import { buildCap, buildGlasses, buildWrapShades, buildChains, buildBeanie, buildBucket, buildDurag, buildHeadband, buildEarrings, buildWristwear, buildCigarette, buildBalaclava } from '../geo/parts/accessories.js';
import { Raster } from '../tex/raster.js';
import { buildBelt } from '../geo/parts/belt.js';
import { buildJacket, buildPuffer } from '../geo/parts/outerwear.js';
import { buildBeard } from '../geo/parts/beard.js';
import { STRAP_TOPS, buildStrapTop, buildSkirt } from '../geo/parts/womenswear.js';

function buildSkirtFor(layout, style, overHemY = null) {
  const k = layout.measures.height / 1.78;
  return buildSkirt(layout, style, { riseY: layout.measures.hipsY + (style.rise ?? 0.04) * k, ease: 0.008 + (style.fit ?? 0.5) * 0.03, overHemY });
}
import { paintJacket, outerFabric } from '../tex/outerwear.js';
import { paintStyledTop, paintLeggings, paintPrint, PRINTS } from '../tex/womenswear.js';
import { expandDress } from './dress.js';
import { buildLeggings, leggingsSurface } from '../geo/parts/leggings.js';
import { paintHairTexture } from '../tex/hair.js';
import { FABRICS } from '../tex/fabric.js';
import { paintSkin } from '../tex/skin.js';
import {
  paintTop, paintBottom, paintVest, paintBelt, paintKnit, paintSocks, paintShoes, paintCap, paintHair, paintMetal, paintShieldLens, paintSolid,
} from '../tex/garments.js';

export function rasterToTexture(raster, name) {
  const tex = new THREE.DataTexture(raster.data, raster.width, raster.height, THREE.RGBAFormat);
  tex.name = name;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function material(raster, name, opts = {}) {
  const fab = opts.fabric ? FABRICS[opts.fabric] : null;
  if (opts.shiny || fab?.shininess) {
    return new THREE.MeshPhongMaterial({
      name,
      map: rasterToTexture(raster, `${name}Map`),
      shininess: fab?.shininess || 55,
      specular: new THREE.Color(fab?.specular ?? '#5a5a5e'),
      side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    });
  }
  return new THREE.MeshLambertMaterial({
    name,
    map: rasterToTexture(raster, `${name}Map`),
    side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    transparent: !!opts.transparent,
    alphaTest: opts.alphaTest ?? 0,
  });
}

/** Everything needed to build any part: resolved definition, rig layout, head shape, per-part RNGs. */
const HEM_CLEARANCE = 0.02;
/** Skin under second-skin legwear is dropped this far inside its hem and waistband (edges overlap). */
const SKIN_HIDE_INSET = 0.012;
const GREY = '#a7a6a1';

/**
 * Age styling layered on top of the authored definition (saved data is never rewritten):
 * hair and beard grey with age, scaled by hair.grey.
 */
function applyAge(def, measures) {
  const greyT = Math.max(0, Math.min(1, (measures.age - 40) / 32)) * (def.hair.grey ?? 1);
  if (greyT <= 0) return def;
  const toGrey = (hex) => rgbToHex(mix(hexToRgb(hex), hexToRgb(GREY), greyT * 0.85));
  return {
    ...def,
    hair: { ...def.hair, color: toGrey(def.hair.color), rootColor: def.hair.rootColor ? toGrey(def.hair.rootColor) : undefined },
    face: { ...def.face, facialHairColor: toGrey(def.face.facialHairColor ?? def.hair.color) },
  };
}

export function createContext(input) {
  const { value: authored, errors } = normalizeDefinition(input);
  const rng = createRng(authored.seed);
  const layout = computeJointLayout(authored.body);
  const def = expandDress(applyAge(authored, layout.measures), layout);
  const face = { ...FACE_PRESETS[def.face.preset], ...def.face };
  const shape = createHeadShape(layout.measures, face);
  shape.recession = def.hair.recession ?? layout.measures.older * 0.55;
  return { def, authored, errors, rng, layout, shape };
}

const hasCap = (def) => def.accessories.some((a) => ['cap', 'beanie', 'bucket', 'durag'].includes(a.type));
const BULKY_UNDER_CAP = ['afro', 'messy', 'twists', 'curlyMop'];

/** Waist and hem heights for leggings by length (full stops at the ankle bone). */
function leggingsSpan(layout, style) {
  const m = layout.measures;
  const k = m.height / 1.78;
  const hemY = {
    full: m.ankleY + 0.03 * k,
    ankle: m.ankleY + 0.06 * k,
    cropped: m.kneeY - (m.kneeY - m.ankleY) * 0.55,
    shorts: m.kneeY + 0.04 * k,
    cutoff: m.kneeY + (layout.world.LeftUpLeg.y - m.kneeY) * 0.55,
  }[style.length ?? 'full'];
  return { riseY: m.hipsY + (style.rise ?? 0.07) * k, hemY };
}

/** Tee-family painter for plain tops; sweaters, button-ups and printed tops use the styled painter. */
function topRaster(style, rng) {
  return style.type === 'sweater' || style.type === 'buttonUp' || PRINTS.includes(style.pattern) ? paintStyledTop(style, rng) : paintTop(style, rng);
}

/**
 * Part recipes. Each returns [{ name, mb, raster, opts }] and optional cover info.
 * Order matters only for `cover`, which the body reads to skip hidden skin.
 */
/** Lowest hem of the upper-body layers that hang over the waistband (null when nothing does). */
function overHem(ctx) {
  const hems = [ctx.topLayer?.hemY, ctx.outerHemY].filter((y) => y != null);
  return hems.length ? Math.min(...hems) : null;
}

/** What an untucked top / jacket must clear at the waist: the trouser fit, or a skirt's real surface. */
function bottomUnder(ctx) {
  const { def, layout } = ctx;
  if (!def.bottom) return null;
  if (def.bottom.type === 'skirt') {
    ctx.skirtSurface ??= buildSkirtFor(layout, def.bottom).surface;
    return { surface: ctx.skirtSurface, gap: LAYER_GAP };
  }
  if (def.bottom.type === 'leggings') return { surface: leggingsSurface(layout), gap: LAYER_GAP };
  return def.bottom.fit ?? 0.7;
}

const RECIPES = {
  top(ctx) {
    const { def, layout, rng } = ctx;
    if (!def.top) return { parts: [] };
    if (STRAP_TOPS[def.top.type]) {
      const res = buildStrapTop(layout, def.top, { overPants: bottomUnder(ctx) });
      ctx.topLayer = { surface: res.surface, collar: null, hemY: res.hemY };
      const raster = topRaster({ ...def.top, sleeve: 'none' }, rng.fork('topTex'));
      return { parts: [{ name: 'top', mb: res.mb, raster, opts: { doubleSide: true, fabric: def.top.fabric } }], cover: { torsoFrom: 'chest', topHemY: res.hemY } };
    }
    const underJacket = !!def.outer && !['vest', 'puffer'].includes(def.outer.type);
    const top = def.top.type === 'buttonUp' ? { ...def.top, collar: 'polo' } : def.top;
    const res = buildTop(layout, top, { overPants: bottomUnder(ctx), hiddenSleeves: underJacket });
    ctx.topLayer = { surface: res.surface, collar: res.collar, hemY: res.hemY };
    const raster = topRaster({ ...top, pattern: top.type === 'rugby' ? 'rugby' : top.pattern }, rng.fork('topTex'));
    return { parts: [{ name: 'top', mb: res.mb, raster, opts: { doubleSide: true, fabric: def.top.fabric } }], cover: { torsoFrom: def.top.sleeve === 'none' ? 'upperChest' : 'trapezius', armFromS: res.coversArmToS, topHemY: res.hemY } };
  },
  outer(ctx) {
    const { def, layout, rng } = ctx;
    if (!def.outer) return { parts: [] };
    if (def.outer.type === 'vest') {
      const res = buildVest(layout, def.outer, { underFit: Math.min(0.2, def.top?.fit ?? 0.2) });
      ctx.outerLayer = { surface: res.surface, gap: res.gap };
      return { parts: [{ name: 'outer', mb: res.mb, raster: paintVest(def.outer, rng.fork('vestTex')), opts: { doubleSide: true } }] };
    }
    const underHemY = def.top ? layout.measures.hipsY - (def.top.length ?? 0.07) * (layout.measures.height / 1.78) : null;
    if (def.outer.type === 'puffer') {
      const res = buildPuffer(layout, def.outer, { underFit: def.top?.fit ?? 0.2, overPants: bottomUnder(ctx), underHemY });
      ctx.outerLayer = { surface: res.surface, gap: 0 };
      return {
        parts: [{ name: 'outer', mb: res.mb, raster: paintJacket(def.outer, rng.fork('jacketTex')), opts: { doubleSide: true, fabric: outerFabric(def.outer) } }],
        cover: { torsoFrom: 'trapezius', topHemY: res.hemY },
      };
    }
    const res = buildJacket(layout, def.outer, { underFit: def.top?.fit ?? 0.2, overPants: bottomUnder(ctx), underHemY });
    ctx.outerHemY = res.hemY;
    return {
      parts: [{ name: 'outer', mb: res.mb, raster: paintJacket(def.outer, rng.fork('jacketTex')), opts: { doubleSide: true, fabric: outerFabric(def.outer) } }],
      cover: { torsoFrom: 'trapezius', armFromS: res.coversArmToS, topHemY: res.hemY },
    };
  },
  bottom(ctx) {
    const { def, layout, rng } = ctx;
    if (!def.bottom) return { parts: [] };
    const skirt = def.bottom.type === 'skirt';
    const leggings = def.bottom.type === 'leggings';
    // Leggings / bike shorts: skin-tight stretch trousers (no stack, cuff or turn-up).
    const style = leggings ? { ...def.bottom, type: 'pants', cut: 'skinny', fit: 0, kind: def.bottom.kind === 'denim' ? 'jersey' : def.bottom.kind, stack: 0, cuff: 0, cinch: false, cargo: false } : def.bottom;
    const res = skirt ? buildSkirtFor(layout, style, overHem(ctx))
      : leggings ? buildLeggings(layout, { ...leggingsSpan(layout, style), sockTop: def.socks ? def.socks.height * (layout.measures.height / 1.78) : null })
        : buildBottom(layout, style, rng.fork('bottomGeo'), { under: ctx.topLayer, shoes: def.shoes, socks: def.socks });
    const legsBelowY = skirt ? layout.world.LeftUpLeg.y - 0.06 * (layout.measures.height / 1.78) : style.length === 'full' ? null : Math.min(layout.world.LeftUpLeg.y - 0.04, res.hemY + 0.12);
    const raster = leggings ? paintLeggings(style, rng.fork('bottomTex')) : paintBottom(style, rng.fork('bottomTex'));
    if (PRINTS.includes(style.pattern)) paintPrint(raster, { x: 0, y: 0, w: raster.width, h: raster.height }, style.pattern, hexToRgb(style.color), hexToRgb(style.accent ?? '#f4f0e6'), rng.fork('bottomPrint'));
    const parts = [{ name: 'bottom', mb: res.mb, raster, opts: { doubleSide: true, fabric: style.kind } }];
    if (def.bottom.belt) parts.push({ name: 'belt', mb: buildBelt(layout, { riseY: res.riseY, ease: res.ease }), raster: paintBelt(def.bottom.belt, rng.fork('beltTex')), opts: { shiny: true } });
    // Leggings are the skin surface pushed out, so the full connected skin stays underneath (it can
    // never poke through its own offset); other bottoms hide the skin they cover.
    if (leggings) return { parts, cover: { legHemY: res.hemY, legCorrectives: true, riseY: res.riseY, hideSkin: [res.hemY + SKIN_HIDE_INSET, res.riseY - SKIN_HIDE_INSET] } };
    return { parts, cover: { legsBelowY, legHemY: res.hemY, legCorrectives: !skirt, torsoFrom: 'pelvisTop', lowerFrom: 'pelvisTop', riseY: res.riseY } };
  },
  socks(ctx) {
    const { def, layout, rng } = ctx;
    if (!def.socks) return { parts: [] };
    const res = buildSocks(layout, { top: def.socks.height * (layout.measures.height / 1.78) });
    return { parts: [{ name: 'socks', mb: res.mb, raster: paintSocks(def.socks, rng.fork('sockTex')) }] };
  },
  shoes(ctx) {
    const { def, layout, rng } = ctx;
    const res = buildShoes(layout, def.shoes.type, { size: def.shoes.size });
    if (!res) return { parts: [] };
    const kind = { canvasLow: 'low', hiTopChunky: 'hiTop', canvasHi: 'hiTop', basketball: 'hiTop', runner: 'runner', skate: 'skate', clog: 'clog', dress: 'dress', loafer: 'loafer', slipOn: 'checker', chunkyBoot: 'boot', workBoot: 'nubuckBoot', sandal: 'sandal', slide: 'slide' }[def.shoes.type];
    const raster = paintShoes({ ...def.shoes, kind }, rng.fork('shoeTex'));
    const opts = { shiny: shoeIsShiny(def.shoes.type), doubleSide: shoeDoubleSided(def.shoes.type) };
    return { parts: [{ name: 'shoes', mb: res.mb, raster, opts }], cover: { feet: !shoeCoversFoot(def.shoes.type), footLift: shoeFootLift(def.shoes.type) * def.shoes.size } };
  },
  beard(ctx) {
    const { def, shape, rng } = ctx;
    if (def.accessories.some((a) => a.type === 'balaclava')) return { parts: [] };
    const mb = buildBeard(shape, def.face.facialHair);
    if (!mb) return { parts: [] };
    const color = def.face.facialHairColor ?? def.hair.color;
    const raster = paintHairTexture('beard', { color, rootColor: color, skin: def.skin.tone }, rng.fork('beardTex'));
    return { parts: [{ name: 'beard', mb, raster, opts: { doubleSide: true } }] };
  },
  hair(ctx) {
    const { def, layout, shape, rng } = ctx;
    if (def.accessories.some((a) => a.type === 'balaclava')) return { parts: [] };
    const capped = hasCap(def) && BULKY_UNDER_CAP.includes(def.hair.style);
    const res = buildHair(shape, layout, def.hair.style, rng.fork('hairGeo'), { lod: def.lod, capped });
    if (!res) return { parts: [] };
    const colors = { color: def.hair.color, rootColor: def.hair.rootColor, skin: def.skin.tone };
    const raster = paintHairTexture(res.texture, colors, rng.fork('hairTex'));
    const parts = [{ name: 'hair', mb: res.shell, raster }];
    if (res.strands) {
      const strandRaster = paintHairTexture(res.strandTexture, colors, rng.fork('strandTex'));
      parts.push({ name: 'hairStrands', mb: res.strands, raster: strandRaster });
    }
    return { parts };
  },
  accessories(ctx) {
    const { def, layout, shape, rng } = ctx;
    const parts = [];
    for (const acc of def.accessories) {
      const r = rng.fork(`acc-${acc.type}`);
      if (acc.type === 'cap') parts.push({ name: 'cap', mb: buildCap(shape, { bill: acc.bill, tilt: acc.tilt, style: acc.style }), raster: paintCap(acc, r), opts: { doubleSide: true } });
      if (acc.type === 'glasses') parts.push({ name: 'glasses', mb: buildGlasses(shape, { width: acc.width, height: acc.height, frame: acc.frame }), raster: paintSolid(acc.color, r) });
      if (acc.type === 'balaclava') parts.push({ name: 'balaclava', mb: buildBalaclava(shape, layout), raster: paintKnit({ ...acc, cuff: false }, r), opts: { doubleSide: true } });
      if (acc.type === 'beanie') parts.push({ name: 'beanie', mb: buildBeanie(shape, { cuff: acc.cuff, slouch: acc.slouch }), raster: paintKnit(acc, r) });
      if (acc.type === 'bucket') parts.push({ name: 'bucket', mb: buildBucket(shape), raster: paintCap({ ...acc, style: 'bucket' }, r), opts: { doubleSide: true } });
      if (acc.type === 'durag') parts.push({ name: 'durag', mb: buildDurag(shape, layout), raster: paintSolid(acc.color, r), opts: { doubleSide: true, fabric: 'satin' } });
      if (acc.type === 'headband') parts.push({ name: 'headband', mb: buildHeadband(shape), raster: paintSolid(acc.color, r) });
      if (acc.type === 'earrings') parts.push({ name: 'earrings', mb: buildEarrings(shape, { size: acc.size }), raster: paintMetal(acc.color, r), opts: { shiny: true } });
      if (acc.type === 'watch') parts.push({ name: 'watch', mb: buildWristwear(layout, { side: 'Left', kind: 'watch' }), raster: paintMetal(acc.color, r), opts: { shiny: true } });
      if (acc.type === 'bracelet') parts.push({ name: 'bracelet', mb: buildWristwear(layout, { side: 'Right', kind: 'bracelet' }), raster: paintMetal(acc.color, r, { links: true }), opts: { shiny: true } });
      if (acc.type === 'cigarette') {
        const cig = buildCigarette(layout);
        ctx.cigaretteTip = cig.tip;
        const tex = new Raster(16, 16).fill('#ece8de');
        tex.rect(0, 0, 16, 5, '#c9884a');
        tex.rect(0, 15, 16, 1, '#e8582a');
        parts.push({ name: 'cigarette', mb: cig.mb, raster: tex });
      }
      if (acc.type === 'shades') parts.push({ name: 'shades', mb: buildWrapShades(shape), raster: paintShieldLens(acc, r), opts: { doubleSide: true } });
      if (acc.type === 'chains') {
        const fit = def.top ? def.top.fit : 0;
        const clearance = 0.018 + fit * 0.03 + (def.outer ? 0.006 : 0);
        const chains = Array.from({ length: acc.count }, (_, i) => ({ drop: 0.07 + i * 0.05 + (acc.count === 1 ? 0.02 : 0), thickness: acc.thickness + (acc.count > 1 ? 0.0015 : 0) - i * 0.0006, pendant: acc.pendant && i === acc.count - 1 }));
        parts.push({ name: 'chains', mb: buildChains(layout, chains, { clearance, over: ctx.topLayer, under: ctx.outerLayer }), raster: paintMetal(acc.color, r, { links: true }) });
      }
    }
    return { parts, cover: def.accessories.some((a) => a.type === 'balaclava') ? { neckHidden: true } : undefined };
  },
};

export const PART_SLOTS = ['body', 'head', ...Object.keys(RECIPES)];

function skinnedMesh(part, skeleton) {
  const geometry = part.mb.toGeometry();
  const mesh = new THREE.SkinnedMesh(geometry, material(part.raster, part.name, part.opts));
  mesh.name = part.name;
  mesh.userData.slot = part.slot ?? part.name;
  mesh.userData.raster = part.raster;
  mesh.frustumCulled = false;
  mesh.bind(skeleton, new THREE.Matrix4());
  return mesh;
}

/** Builds all part recipes (not body/head) and merges their cover flags. */
function buildRecipeParts(ctx) {
  const cover = { torsoFrom: 'crotch', legsBelowY: Infinity, feet: true };
  const parts = [];
  for (const [slot, recipe] of Object.entries(RECIPES)) {
    const res = recipe(ctx);
    res.parts.forEach((p) => parts.push({ ...p, slot }));
    if (res.cover?.torsoFrom && TORSO_KEYS.indexOf(res.cover.torsoFrom) > TORSO_KEYS.indexOf(cover.torsoFrom)) cover.torsoFrom = res.cover.torsoFrom;
    if (res.cover?.lowerFrom) cover.lowerFrom = res.cover.lowerFrom;
    if (res.cover?.topHemY != null) cover.topHemY = cover.topHemY == null ? res.cover.topHemY : Math.min(cover.topHemY, res.cover.topHemY);
    if (res.cover?.armFromS != null) cover.armFromS = Math.max(cover.armFromS ?? -1, res.cover.armFromS);
    if (res.cover && 'legsBelowY' in res.cover) cover.legsBelowY = res.cover.legsBelowY;
    if (res.cover && 'feet' in res.cover) cover.feet = res.cover.feet;
    if (res.cover?.footLift) cover.footLift = res.cover.footLift;
    if (res.cover?.neckHidden) cover.neckHidden = true;
    if (res.cover?.riseY != null) cover.riseY = res.cover.riseY;
    if (res.cover?.hideSkin) cover.hideSkin = res.cover.hideSkin;
    if (res.cover?.legHemY != null) cover.legHemY = res.cover.legHemY;
    if (res.cover && 'legCorrectives' in res.cover) cover.legCorrectives = res.cover.legCorrectives;
  }
  // No bare midriff band when the bottom's waistband rises over the top's hem (dresses, high rises).
  if (cover.topHemY != null && cover.riseY != null && cover.riseY >= cover.topHemY) cover.topHemY = null;
  return { parts, cover };
}

function hairScalpInfo(ctx) {
  const { def, shape } = ctx;
  const style = HAIR_STYLES[def.hair.style];
  if (!style || style.shell === false) return null;
  return { color: def.hair.color, hairline: hairlineFor(shape, def.hair.style), sideburns: true };
}

/**
 * Builds a complete character. Returns a THREE.Group with one SkinnedMesh per part sharing a
 * single skeleton, plus metadata: stats, collider, definition, validation errors.
 */
export function buildCharacter(input) {
  const ctx = createContext(input);
  const { def, layout, shape, rng } = ctx;
  const rig = createSkeleton(layout);
  const group = new THREE.Group();
  group.name = def.id;
  group.add(rig.root);

  const { parts, cover } = buildRecipeParts(ctx);
  const skinRaster = paintSkin({ def: { ...def, face: shape.face }, shape, hair: hairScalpInfo(ctx), rng: rng.fork('skin') });
  const skinMaterial = material(skinRaster, 'skin');
  const body = buildBody(layout, cover);
  const head = buildHead(shape, { lod: def.lod });

  const meshes = [];
  for (const [name, mb] of [['body', body], ['head', head]]) {
    const mesh = new THREE.SkinnedMesh(mb.toGeometry(), skinMaterial);
    mesh.name = name;
    mesh.userData.slot = name;
    mesh.userData.raster = skinRaster;
    mesh.frustumCulled = false;
    mesh.bind(rig.skeleton, new THREE.Matrix4());
    meshes.push(mesh);
  }
  const mouthTex = new Raster(32, 32).fill('#3a1212');
  mouthTex.verticalGradient(0, 16, '#5a1e1e', '#200808');
  mouthTex.rect(0, 16, 16, 16, '#e6e0d0');
  for (let x = 0; x < 16; x += 2) mouthTex.rect(x, 16, 1, 16, '#b8b0a0', 0.8);
  mouthTex.rect(16, 16, 16, 16, '#b0545a');
  mouthTex.rect(23, 16, 2, 16, '#8a3a40', 0.7);
  meshes.push(skinnedMesh({ name: 'mouth', slot: 'mouth', mb: buildMouth(shape), raster: mouthTex, opts: { doubleSide: true } }, rig.skeleton));
  for (const part of parts) meshes.push(skinnedMesh(part, rig.skeleton));
  meshes.forEach((m) => group.add(m));
  // Skirt correctives push the fabric off the plain-LBS leg, so the skin keeps LBS under a skirt.
  const coveredAboveY = cover.legCorrectives === false ? -Infinity : cover.legHemY != null ? cover.legHemY - HEM_CLEARANCE : Infinity;
  bakeBodyCorrectives(meshes[0], rig, { coveredAboveY });
  const bottomMesh = meshes.find((m) => m.name === 'bottom');
  if (bottomMesh && def.bottom.type === 'skirt') {
    const shoes = def.shoes && SHOE_TYPES.includes(def.shoes.type) && def.shoes.type !== 'barefoot' ? shoeCollider(layout, def.shoes.type, { size: def.shoes.size }) : null;
    bakeHipCorrectives(bottomMesh, rig, layout, { margin: collisionMargin(def.bottom.kind ?? 'cotton') + 0.006, shoes, topY: overHem(ctx) });
  } else if (bottomMesh && def.shoes && SHOE_TYPES.includes(def.shoes.type) && def.shoes.type !== 'barefoot') {
    const colliders = shoeCollider(layout, def.shoes.type, { size: def.shoes.size });
    bakeAnkleCorrectives(bottomMesh, rig, colliders, { margin: collisionMargin(def.bottom.kind ?? 'denim') + 0.003 });
  }

  const stats = characterStats(meshes);
  const mouthWorld = new THREE.Vector3(0, shape.lm.mouth, shape.point(0, shape.lm.mouth, 0.004 * shape.k).z);
  group.userData = {
    cigaretteTip: ctx.cigaretteTip ? new THREE.Vector3().copy(ctx.cigaretteTip) : null,
    mouthOffset: mouthWorld.sub(layout.world.Head),
    definition: ctx.authored,
    errors: ctx.errors,
    layout,
    rig,
    stats,
    collider: { type: 'capsule', radius: layout.measures.shoulderHalf * 1.05, height: layout.measures.height, center: [0, layout.measures.height / 2, 0] },
  };
  return group;
}

export function characterStats(meshes) {
  let triangles = 0;
  let vertices = 0;
  const textures = new Set();
  let textureBytes = 0;
  const perPart = {};
  for (const m of meshes) {
    const tris = m.geometry.index.count / 3;
    triangles += tris;
    vertices += m.geometry.attributes.position.count;
    perPart[m.name] = tris;
    const map = m.material.map;
    if (map && !textures.has(map.uuid)) {
      textures.add(map.uuid);
      textureBytes += map.image.width * map.image.height * 4;
    }
  }
  return { triangles, vertices, drawCalls: meshes.length, textures: textures.size, textureBytes, perPart };
}

export function disposeCharacter(group) {
  group.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      o.material.map?.dispose();
      o.material.dispose();
    }
  });
}
