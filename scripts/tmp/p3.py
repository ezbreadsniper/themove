p='src/geo/parts/body.js'
s=open(p,encoding='utf8').read()
s=s.replace("""  const crotchY = gluteForm(layout).foldY;
  const halfW = seat.rx * 0.5;""","""  const glute = gluteForm(layout);
  const crotchY = glute.foldY;
  const halfW = seat.rx * 0.5;""")
s=s.replace("""      legRing(V(s * halfW, crotchY, seat.cz), halfW - 0.003 * k, seat.rzF * 0.94, seat.rzB * 0.82, crotchY,""","""      legRing(V(s * halfW, crotchY, seat.cz), halfW - 0.003 * k, seat.rzF * 0.94, seat.rzB * 0.8 + glute.amount * 0.75, crotchY,""")
s=s.replace("""      legRing(V(s * (halfW + Math.abs(lc.x)) * 0.5, upY, (seat.cz + lc.z) * 0.5), upR * 0.98, upR, upR * (1.04 + (m.butt ?? 0.3) * 0.1), upY,""","""      legRing(V(s * (halfW + Math.abs(lc.x)) * 0.5, upY, seat.cz), upR * 0.98, upR * 0.82, upR * (0.9 + (m.butt ?? 0.3) * 0.15), upY,""")
open(p,'w',encoding='utf8').write(s)
