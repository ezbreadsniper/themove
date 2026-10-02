import { describe, test, expect } from 'vitest';
import * as THREE from 'three';
import { buildCharacter } from '../src/character/build.js';
import { PRESETS } from '../src/character/presets/index.js';
import { JOINTS } from '../src/rig/skeleton.js';
import { SOCIAL_SAMPLERS, SOCIAL_CLIP_NAMES, DEATH_CLIPS, bakeSocialClip, registerSocialClips } from '../src/anim/social-clips.js';
import { worldPose } from '../src/anim/fk.js';

const layouts = [PRESETS[0], PRESETS[5]].map((p) => buildCharacter(p).userData.layout);

describe('social clips', () => {
  test('cover the contract names', () => {
    for (const n of ['npc_alert', 'npc_fear_cower', 'npc_anger_point', 'npc_greet_wave', 'npc_greet_nod', 'npc_listen', 'npc_handsUp', 'npc_shrug', 'npc_phone', 'npc_lean_wall']) expect(SOCIAL_CLIP_NAMES).toContain(n);
    expect(SOCIAL_CLIP_NAMES.filter((n) => n.startsWith('npc_idle_')).length).toBeGreaterThanOrEqual(3);
    expect(SOCIAL_CLIP_NAMES.filter((n) => n.startsWith('npc_talk_gesture_')).length).toBeGreaterThanOrEqual(3);
    expect(SOCIAL_CLIP_NAMES.every((n) => n.startsWith('npc_'))).toBe(true);
  });

  test('registerSocialClips hands every sampler to a registry', () => {
    const got = {};
    expect(registerSocialClips((map) => Object.assign(got, map))).toBe(true);
    expect(Object.keys(got)).toEqual(SOCIAL_CLIP_NAMES);
    expect(registerSocialClips(undefined)).toBe(false);
  });

  test.each(SOCIAL_CLIP_NAMES)('%s bakes finite tracks; loops close', (name) => {
    for (const layout of layouts) {
      const clip = bakeSocialClip(layout, name);
      expect(clip.tracks).toHaveLength(JOINTS.length + 1);
      for (const track of clip.tracks) {
        expect(track.values.every(Number.isFinite)).toBe(true);
        if (!clip.userData.loop) continue;
        const size = track.getValueSize();
        const first = Array.from(track.values.slice(0, size));
        const last = Array.from(track.values.slice(-size));
        first.forEach((v, i) => expect(Math.abs(v - last[i])).toBeLessThan(1e-4));
      }
    }
  });

  test.each(SOCIAL_CLIP_NAMES)('%s keeps sane joint angles, hips and hands', (name) => {
    const s = SOCIAL_SAMPLERS[name];
    for (const layout of layouts) {
      const k = layout.measures.height / 1.78;
      for (let i = 0; i <= 12; i++) {
        const t = (i / 12) * s.duration * (s.loop ? 0.999 : 1);
        const pose = s.sample(layout, t, s.duration);
        for (const [bone, q] of Object.entries(pose.bones)) {
          const angle = 2 * Math.acos(Math.min(1, Math.abs(q.w))) * THREE.MathUtils.RAD2DEG;
          // Knees and elbows fold far; nothing spins past a half-turn.
          expect(angle, `${bone} @${t.toFixed(2)}`).toBeLessThan(/Leg$|ForeArm$/.test(bone) ? 165 : 150);
          expect(Math.abs(q.length() - 1)).toBeLessThan(1e-4);
        }
        expect(pose.hips.length()).toBeLessThan((/death|dead/.test(name) ? 1.5 : 0.6) * k);
        const fk = worldPose(layout, pose);
        if (/death|dead/.test(name)) {
          // Falling / lying bodies: nothing below the floor, nothing above a standing head.
          for (const [j] of JOINTS) expect(fk.pos[j].y, `${j} @${t.toFixed(2)}`).toBeGreaterThan((name.includes('dead') ? -0.03 : -0.07) * k);
          continue;
        }
        // Hands stay inside a body-sized box (no IK flips through the torso or off into space).
        for (const side of ['Left', 'Right']) {
          const h = fk.pos[`${side}Hand`];
          expect(h.y).toBeGreaterThan(0.25 * k);
          expect(h.y).toBeLessThan(layout.measures.height + 0.35 * k);
          expect(Math.hypot(h.x, h.z)).toBeLessThan(0.85 * k);
        }
        // Feet stay planted near the floor (except flee run / lean foot on the wall).
        if (!/flee_run|lean_wall|hit_|duck/.test(name)) for (const side of ['Left', 'Right']) expect(fk.pos[`${side}Foot`].y).toBeLessThan(layout.world[`${side}Foot`].y + 0.09 * k);
      }
    }
  });

  test.each(Object.entries(DEATH_CLIPS))('%s falls into %s, which rests on the floor', (death, dead) => {
    for (const layout of layouts) {
      const k = layout.measures.height / 1.78;
      const d = SOCIAL_SAMPLERS[death];
      const end = d.sample(layout, d.duration, d.duration);
      const hold = SOCIAL_SAMPLERS[dead].sample(layout, 0, 1);
      // The fall ends exactly in the held pose (no pop when the Animator switches to the hold).
      for (const [j] of JOINTS) expect((end.bones[j] ?? new THREE.Quaternion()).angleTo(hold.bones[j] ?? new THREE.Quaternion())).toBeLessThan(1e-4);
      expect(end.hips.distanceTo(hold.hips)).toBeLessThan(1e-4);
      const fk = worldPose(layout, hold);
      const ys = JOINTS.map(([j]) => fk.pos[j].y);
      // Lying: the trunk is near the floor, nothing floats or sinks.
      for (const j of ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head']) expect(fk.pos[j].y, j).toBeLessThan(0.3 * k);
      expect(Math.min(...ys)).toBeGreaterThan(-0.03 * k);
      expect(Math.max(...ys)).toBeLessThan(0.62 * k);
      // Mid-fall the body is somewhere between standing and lying (it actually falls).
      const mid = worldPose(layout, d.sample(layout, d.duration * 0.55, d.duration)).pos.Head.y;
      expect(mid).toBeLessThan(layout.world.Head.y - 0.1 * k);
    }
  });
});
