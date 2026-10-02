import * as THREE from 'three';
import { Animator } from '../anim/animator.js';
import { WEAPONS } from '../weapons/specs.js';

const COMPASS = [['N', 0], ['NW', 45], ['W', 90], ['SW', 135], ['S', 180], ['SE', -135], ['E', -90], ['NE', -45]];
const TURN_RATE = 9;
/** Standing and aiming: the upper body covers this much yaw before the feet step round (degrees). */
const AIM_DEAD_ZONE = 45;
const AIM_SETTLE = 8;
const STEP_TURN_RATE = 4.5;

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Nearest compass clip suffix for a move direction in body space (degrees, 0 = forward, + = left). */
function compass(deg) {
  let best = COMPASS[0];
  for (const c of COMPASS) {
    const d = Math.abs(((deg - c[1] + 540) % 360) - 180);
    if (d < Math.abs(((deg - best[1] + 540) % 360) - 180)) best = c;
  }
  return best[0];
}

const clipFor = (type, action) => {
  const pistol = { draw: 'pistol_draw', holster: 'pistol_unequip', switch: 'pistol_switch', ready: 'pistol_idleTwoHand', sprint: 'pistol_sprint', crouch: 'pistol_crouch' };
  const long = { draw: `${type}_equip`, holster: `${type}_unequip`, switch: `${type}_switch`, ready: `${type}_idle`, sprint: `${type}_sprint`, crouch: `${type}_crouch` };
  const common = { aim: `${type}_aimIdle`, crouchAim: `${type}_crouchAim`, recoil: `${type}_recoil`, reload: `${type}_reload`, reloadEmpty: `${type}_reloadEmpty`, dryFire: `${type}_dryFire` };
  return { ...common, ...(type === 'pistol' ? pistol : long) }[action];
};

/**
 * Third-person gameplay controller: input → locomotion, weapon state and aim, driving an Animator,
 * and root motion from each clip's own speed (so feet do not skate).
 * input = { move: {x, z} (camera space, -1..1), cameraYaw (rad), sprint, crouch, aim, fire, reload,
 *   weapon: 'pistol' | 'rifle' | 'smg' | null, aimPitch (deg) }
 */
export class CharacterController {
  constructor(character, clips, { root = character.parent } = {}) {
    this.character = character;
    this.root = root;
    this.clips = clips;
    this.animator = new Animator(character, clips);
    this.facing = 0;
    this.weapon = null;
    this.ammo = Object.fromEntries(Object.entries(WEAPONS).map(([t, s]) => [t, s.rounds]));
    this.state = { locomotion: 'idle', upper: null };
    this.animator.locomotion('idle');
    this.fireCooldown = 0;
  }

  locomotionFor(input) {
    const speed = Math.hypot(input.move.x, input.move.z);
    if (speed < 0.15 && this.turning && !input.crouch) return 'stepInPlace';
    if (speed < 0.15) return input.crouch ? 'crouchIdle' : 'idle';
    if (input.crouch) return `crouchWalk_${this.moveCompass}`;
    if (input.aim) return `walk_${this.moveCompass}`;
    if (input.sprint) return 'sprint';
    return speed > 0.6 ? 'run' : 'walk';
  }

  /** Weapon state changes: draw / holster / switch, each a one-shot chained into the next state. */
  setWeapon(type) {
    if (type === this.weapon) return;
    const a = this.animator;
    if (this.weapon && type) a.play(clipFor(this.weapon, 'switch'), { then: [clipFor(type, 'draw'), clipFor(type, 'ready')] });
    else if (this.weapon) a.play(clipFor(this.weapon, 'holster'), { then: null });
    else a.play(clipFor(type, 'draw'), { then: clipFor(type, 'ready') });
    this.weapon = type;
  }

  upperFor(input) {
    if (!this.weapon) return null;
    if (input.aim) return clipFor(this.weapon, input.crouch ? 'crouchAim' : 'aim');
    if (this.state.locomotion === 'sprint') return clipFor(this.weapon, 'sprint');
    if (input.crouch) return clipFor(this.weapon, 'crouch');
    return clipFor(this.weapon, 'ready');
  }

  update(input, dt) {
    const a = this.animator;
    const move = new THREE.Vector3(input.move.x, 0, input.move.z);
    const speed = Math.min(1, move.length());
    const worldMove = move.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), input.cameraYaw ?? 0);
    const aimOffset = THREE.MathUtils.radToDeg(wrapAngle((input.cameraYaw ?? 0) - this.facing));
    if (input.aim && speed > 0.15) {
      this.turning = false;
      this.turnTo(input.cameraYaw ?? 0, dt);
    } else if (input.aim) {
      // Standing aim: the torso / aim offsets take up to ±45°, beyond that the feet step the body round.
      if (Math.abs(aimOffset) > AIM_DEAD_ZONE) this.turning = true;
      if (this.turning && Math.abs(aimOffset) < AIM_SETTLE) this.turning = false;
      if (this.turning) this.turnTo(input.cameraYaw ?? 0, dt, STEP_TURN_RATE);
    } else {
      this.turning = false;
      if (speed > 0.15) this.turnTo(Math.atan2(worldMove.x, worldMove.z), dt);
    }
    this.aimOffset = THREE.MathUtils.radToDeg(wrapAngle((input.cameraYaw ?? 0) - this.facing));
    const bodyDeg = THREE.MathUtils.radToDeg(Math.atan2(worldMove.x, worldMove.z) - this.facing);
    this.moveCompass = compass(bodyDeg);

    if (input.weapon !== undefined && input.weapon !== this.weapon) this.setWeapon(input.weapon);
    const loco = this.locomotionFor(input);
    if (loco !== this.state.locomotion) {
      a.locomotion(loco);
      this.state.locomotion = loco;
    }
    const upper = this.upperFor(input);
    if (!a.locked && upper && upper !== a.upperName) a.play(upper);
    if (!upper && a.upper && !a.locked) a.release();
    a.stabilize(!!this.weapon && !!input.aim);
    if (!this.weapon || !input.aim) a.setAim(0, 0, {});
    if (this.weapon && input.aim) a.setAim(THREE.MathUtils.clamp(this.aimOffset, -AIM_DEAD_ZONE, AIM_DEAD_ZONE), input.aimPitch ?? 0, { left: `${this.weapon}_aimLeft`, right: `${this.weapon}_aimRight`, up: `${this.weapon}_aimUp`, down: `${this.weapon}_aimDown` });

    this.fireCooldown -= dt;
    if (this.weapon && input.fire && input.aim && this.fireCooldown <= 0 && !a.locked) {
      if (this.ammo[this.weapon] > 0) {
        if (a.additive(clipFor(this.weapon, 'recoil'))) {
          this.ammo[this.weapon] -= 1;
          this.fireCooldown = this.weapon === 'pistol' ? 0.22 : 0.1;
          this.lastShot = { weapon: this.weapon, ammo: this.ammo[this.weapon] };
        }
      } else {
        a.play(clipFor(this.weapon, 'dryFire'));
        this.fireCooldown = 0.5;
      }
    }
    // A reload pressed during another one-shot (dry fire, draw) is buffered, not dropped.
    if (input.reload) this.wantReload = true;
    if (this.weapon && this.wantReload && !a.locked) {
      this.wantReload = false;
      if (this.ammo[this.weapon] < WEAPONS[this.weapon].rounds) {
        a.play(clipFor(this.weapon, this.ammo[this.weapon] === 0 ? 'reloadEmpty' : 'reload'));
        this.ammo[this.weapon] = WEAPONS[this.weapon].rounds;
      }
    }

    a.update(dt);
    const vel = this.clips[loco]?.userData.rootVelocity;
    if (vel && this.root) {
      const v = new THREE.Vector3(...vel).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.facing);
      this.root.position.addScaledVector(v, dt);
    }
    if (this.root) this.root.rotation.y = this.facing;
    this.state.upper = a.upperName;
  }

  turnTo(target, dt, rate = TURN_RATE) {
    this.facing += wrapAngle(target - this.facing) * Math.min(1, dt * rate);
  }
}
