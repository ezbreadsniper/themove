/** Dialogue layer: see docs/npc/ARCHITECTURE.md. */
export { DialogueDirector, pickShot, lineDuration } from './director.js';
export { DialogueRunner, makeContext, evalCondition, applyEffects } from './graph.js';
export { registerTree, getTree, loadTree, validateTree, treeIds } from './loader.js';
export { BarkSystem } from './barks.js';
export { DialogueCamera, frameShot, sideOf, lineOfAction } from './camera.js';
export { DialogueHud, TONE_COLORS } from './hud.js';
