p = 'src/geo/parts/body.js'
s = open(p, encoding='utf8').read()
new = open('scripts/tmp/new_torso.js', encoding='utf8').read()
a = s.index("/**\n * Torso skin. `from`")
b = s.index("/** Arm cross-sections")
s = s[:a] + new + s[b:]
s = s.replace("""  buildTorso(mb, layout, { from: cover.torsoFrom ?? 'crotch', lowerFrom: cover.lowerFrom ?? 'crotch', gapFrom: cover.topHemY != null ? cover.topHemY + 0.025 : null, neckHidden: !!cover.neckHidden });
  for (const [side] of SIDES) {""", """  const pelvis = buildTorso(mb, layout, { from: cover.torsoFrom ?? 'crotch', lowerFrom: cover.lowerFrom ?? 'crotch', gapFrom: cover.topHemY != null ? cover.topHemY + 0.025 : null, neckHidden: !!cover.neckHidden });
  const legsBelowY = cover.legsBelowY === undefined ? Infinity : cover.legsBelowY;
  const connected = !!pelvis && legsBelowY === Infinity;
  if (connected) buildConnectedLegs(mb, layout, pelvis);
  for (const [side] of SIDES) {""")
s = s.replace("""    if (cover.legsBelowY !== null) {
      mb.newSmoothingGroup();
      buildLeg(mb, layout, side, cover.legsBelowY ?? Infinity);
    }""", """    if (legsBelowY !== null && !connected) {
      mb.newSmoothingGroup();
      buildLeg(mb, layout, side, legsBelowY);
    }""")
open(p, 'w', encoding='utf8').write(s)
