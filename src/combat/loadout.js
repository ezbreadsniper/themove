/**
 * Gun handling per weapon (fire mode, cadence, accuracy, feel) and the player's loadout.
 * The player starts with the pistol; the SMG and the rifle are picked up from the weapon crate
 * behind the building (contracts §5). Keys: 1 pistol, 2 SMG, 3 rifle (each only once owned), 0 holster.
 */
export const FIRE = Object.freeze({
  // interval: seconds between rounds; auto: fires while the trigger is held; spread: base cone
  // half-angle (rad); bloom: extra spread per round in a burst (decays); climb: camera pitch kick per
  // round (rad); shake: camera shake per round; impulse: push on physics props (N·s).
  pistol: { interval: 0.2, auto: false, spread: 0.003, bloom: 0.004, maxSpread: 0.02, climb: 0.014, shake: 0.22, impulse: 3, flash: 0.22 },
  smg: { interval: 0.075, auto: true, spread: 0.012, bloom: 0.0035, maxSpread: 0.045, climb: 0.0075, shake: 0.14, impulse: 2.4, flash: 0.26 },
  rifle: { interval: 0.105, auto: true, spread: 0.004, bloom: 0.0025, maxSpread: 0.03, climb: 0.011, shake: 0.2, impulse: 4.5, flash: 0.34 },
});

/** Digit key → weapon slot. */
export const WEAPON_KEYS = Object.freeze({ Digit1: 'pistol', Digit2: 'smg', Digit3: 'rifle', Digit0: null });
export const ALL_WEAPONS = Object.freeze(['pistol', 'smg', 'rifle']);
export const START_WEAPONS = Object.freeze(['pistol']);

export class Loadout {
  constructor(owned = START_WEAPONS, { onChange = null } = {}) {
    this.owned = new Set(owned);
    this.onChange = onChange;
  }

  has(type) {
    return type === null || this.owned.has(type);
  }

  add(type) {
    if (!ALL_WEAPONS.includes(type) || this.owned.has(type)) return false;
    this.owned.add(type);
    this.onChange?.(type, this);
    return true;
  }

  /**
   * The weapon a key selects: undefined when the key is not a weapon key or the slot isn't owned
   * (the press does nothing), null for holster.
   */
  select(code) {
    if (!(code in WEAPON_KEYS)) return undefined;
    const type = WEAPON_KEYS[code];
    return this.has(type) ? type : undefined;
  }

  list() {
    return ALL_WEAPONS.filter((t) => this.owned.has(t));
  }
}
