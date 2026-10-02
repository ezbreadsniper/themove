# NPC behaviour & dialogue: research notes

Short survey of how shipped open-world games and narrative tools solve the problems this workstream
covers, and what we took from each. Links are to talks, docs and wikis; claims about proprietary
systems come from public talks, modding data and documentation rather than source code.

## Ambient AI and reactions (GTA V, RDR2)

- **Scenario points and ambient "milling".** Open-world pedestrians spend most of their time on
  authored *scenario points* (lean on a wall, smoke, use a phone, sit) and wander between them. Crowds
  have two broad modes, ambient milling and agitated, and switch when something shocking happens
  ([AAAI crowd paper, 2021](https://cdn.aaai.org/ojs/18767/18767-52-22452-1-10-20210929.pdf)).
- **Shocking events.** GTA V's data ships a `shockingevents.ymt` table. It is a data-driven list of
  events (gunfire, car crash, a weapon pointed at someone, a fight) with radii and the reactions they
  cause. Modders tweak it to change how bystanders respond. Peds do not all flee: many watch, film
  or comment, and only those who are close or directly threatened run
  ([mod notes](https://www.modland.net/gta-5-mods/other/bystanders-are-ignorant-pieces-of-shit.html)).
  A pointed weapon counts as a much stronger stimulus than distant gunfire.
- **RDR2 interaction.** Every NPC can be targeted and *greeted*, *antagonised* or *defused*. Each has
  its own attitude, which decides how the exchange goes, and NPCs remember the player
  ([overview](https://segmentnext.com/2018/08/30/red-dead-redemption-2-interaction-system/)).

**Adopted:** a data table of stimuli (`src/npc/stimuli.js`) with sense type, radius and threat,
scenario idles at markers (`lean`, `phone`, `counter`), and a reaction matrix keyed by stimulus ×
temperament × relationship, so a pointed gun and a distant shot produce different reactions. Panic
spreads as a second-hand `panic` stimulus from the people who flee. Bumping, greeting and dialogue
choices feed the same disposition memory, which gives RDR2's "they remember you".

## Perception (stealth-game sensing)

- Splinter Cell: Blacklist ([GDC: Modeling AI Perception and Awareness](https://gdcvault.com/play/1020195/Modeling-AI-Perception-and-Awareness))
  combines a primary sight cone, a wider peripheral cone, and a small "sixth sense" volume behind the
  head, plus an awareness meter that fills over time instead of detecting on the first frame.
- Thief-style hearing uses loudness that falls off with distance and is dampened by walls.

**Adopted:** a primary cone (fov, range), a peripheral cone (wider, shorter, weaker), a 1.1 m
behind-you radius, line of sight through `CollisionWorld.raycast`, crouch/sprint/light modifiers, a
0..1 awareness meter with decay, and hearing that walls halve. Memories hold position, intensity and
a half-life.

## Decision making: FSM vs behaviour trees vs utility

- **Behaviour trees** scale better than flat FSMs for authored sequences
  ([survey, arXiv 2005.05842](https://arxiv.org/pdf/2005.05842)). The cost is that "which behaviour
  matters most right now" is fixed by tree order.
- **Utility AI** (Dave Mark, Kevin Dill: GDC AI Summit 2010–2015, the *Infinite Axis Utility System*,
  [overview](https://en.wikipedia.org/wiki/Utility_system), [IAUS notes](https://gameai.com/iaus.php))
  scores each option with response curves over inputs and picks the best. It handles many competing
  drives (fear vs anger vs curiosity) without combinatorial transition wiring. On its own it can
  dither between options.
- **HFSMs** give clear state ownership (enter/update/exit, animation per state) and priorities between
  groups ([GDC: Architecture Tricks: Managing Behaviors in Time, Space and Depth](https://www.gdcvault.com/play/1018040/Architecture-Tricks-Managing-Behaviors)).

**Adopted:** a hybrid. States live in priority groups (dialogue > threat > alert > social > ambient)
like an HFSM. The *choice* between states is utility-scored from drives, traits, relationship and
senses. Commitment (minimum time plus inertia) stops dithering, and only a higher group can interrupt
a committed state. Reactions leave a fading *intent* bonus, so the instant reaction becomes the
sustained behaviour without hard-wired transitions. We chose this over a full behaviour tree because
NPC reactions here are mostly "which mood wins", which utility handles well. Authored sequences
(scripted scenes) can still be added as states.

## Relationships (Bethesda Radiant AI, Skyrim, Fallout)

- Oblivion's Radiant AI gave NPCs goals and schedules. Fully emergent behaviour produced absurd
  results (everyone fighting over an apple), so most of it ended up scripted
  ([UESP: Radiant](https://en.uesp.net/wiki/Oblivion:Radiant)).
- Skyrim stores a relationship *rank* from −4 (archnemesis) to +4 (lover). Dialogue and services gate
  on it ([UESP: Disposition](https://content1.uesp.net/wiki/Skyrim:Disposition)). Fallout adds faction
  reputation that is shared across members.

**Adopted:** a numeric score (base + permanent standing + decaying heat + faction share) mapped to
five ranks (hostile / unfriendly / neutral / friendly / ally). Ranks gate dialogue and change bark
selection. Deeds have permanent and short-term parts and are damped when repeated. Witnessed deeds
spill over to the victim's faction. Following Radiant's lesson, emergent behaviour stays bounded by
authored data: the archetypes, the matrix and the scenario points.

## Dialogue presentation (Witcher 3, Cyberpunk 2077, film grammar)

- The Witcher 3 generated most of its 1,400+ systemic dialogues procedurally. A generator took actor
  data, cinematic instructions and voice timing, and produced cameras, body and face animation and
  look-ats ([GDC 2016: Behind the Scenes of Cinematic Dialogues](https://gdcvault.com/play/1022988/Behind-the-Scenes-of-Cinematic),
  [summary](https://www.tweaktown.com/news/51166/cdpr-reveals-science-behind-witcher-3s-dialogue-animations/index.html)).
- Cyberpunk 2077 keeps dialogue in first person with no letterbox, for immersion
  ([VGC](https://www.videogameschronicle.com/news/cyberpunk-2077s-first-person-focus-is-the-right-choice-says-designer)).
  Our third-person, PS2-era target suits the Witcher/GTA cinematic style better.
- **180° rule and shot / reverse shot**: keep the camera on one side of the line through the two
  speakers so screen direction never flips, and alternate over-the-shoulder shots
  ([Wikipedia](https://en.wikipedia.org/wiki/180-degree_rule)).

**Adopted:** procedural shots from the two head positions (two-shot, over-the-shoulder, close-up,
medium, plus a "profile" single as a fallback when a wall or bystander blocks a shot). The side of the
line is chosen once, from the side the gameplay camera is already on, and is checked by tests. Cuts
are hard, while entry and exit blend from and back to the gameplay camera. The camera has a little
handheld drift, a slow push-in, letterbox bars, and close-ups on emotional lines. Lines carry
speaker, emotion, animation, shot hint and duration, as in the Witcher pipeline, so content drives the
camera.

## Dialogue data (ink, Yarn Spinner)

- Yarn Spinner groups dialogue into *nodes* with lines, options, `<<set>>`, `<<if>>`, `<<jump>>` and
  `<<stop>>` ([docs](https://www.yarnspinner.dev/docs/yarn/02-fundamentals/)).
- ink uses *knots/stitches* and *diverts* (`->`) and tracks visit counts
  ([syntax summary](https://docs.intra.i2db.washu.edu/tools/documentation/notes/ink-syntax-summary)).

**Adopted:** plain JSON graphs with the same concepts: `line`, `choice`, `condition`, `action` (set /
add / disposition / deed / hooks), `jump` (across trees, like a divert) and `end`. Scoped variables
(`npc.*` persists per NPC, `global.*`, `local.*`), visit tracking (`visited`), and `once` options
(ink's sticky vs once-only choices). JSON was chosen over a custom script syntax so that tools, tests
and the validator can read it directly. A Yarn/ink importer could compile to this format later.

## Barks (Valve's dynamic dialogue)

- Elan Ruskin, *AI-driven Dynamic Dialog through Fuzzy Pattern Matching* (GDC 2012,
  [vault](https://www.gdcvault.com/play/1015528/AI-driven-Dynamic-Dialog-through),
  [write-up](https://emshort.blog/2012/03/16/gdc-2012-talk-on-dynamic-dialogue/)). Left 4 Dead uses a
  query of facts (concept + speaker + world) matched against a rule database. The rule with the most
  satisfied criteria wins and generic rules are fall-backs. Rules can write facts back ("remember")
  for follow-ups and running gags, so writers add special cases without code.

**Adopted:** exactly that shape (`src/dialogue/barks.js`, rules in `data/barks.json`): criteria count
as specificity, weights break ties, with per-rule cooldowns, `once`, a per-speaker gap, line cycling,
and `remember` writing into NPC memory (`npc.*`, which dialogue trees can read).

## Steering

Craig Reynolds, *Steering Behaviors for Autonomous Characters* (GDC 1999): seek, flee, arrive,
obstacle avoidance and separation
([lecture notes](https://diana.ms.mff.cuni.cz/pogamut_files/lectures/2015-2016/steeringBehaviors-slides.pdf)).

**Adopted:** arrive / flee / separation plus waist-height feeler rays against the collision world.
Movement goes through `CollisionWorld.move` (slide, step, ground). Flee targets are chosen by sampling
headings away from the threat and keeping the longest clear run. There is no navmesh yet (see
ARCHITECTURE known gaps).
