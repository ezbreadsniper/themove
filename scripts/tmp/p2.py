p='src/app/evidence.js'
s=open(p,encoding='utf8').read()
s=s.replace("""    c.traverse((o) => { if (o.isMesh && hide.includes(o.name)) o.visible = false; });""","""    c.traverse((o) => { if (o.isMesh && hide.includes(o.name)) o.visible = false; });
    applyView(c, opts.view);""")
s=s.replace("""/**
 * layout: 'turnaround'""","""const SILHOUETTE = new THREE.MeshBasicMaterial({ color: 0x000000 });
const WIRE = new THREE.MeshBasicMaterial({ color: 0x101018, wireframe: true });

/** Review views: 'silhouette' (flat black), 'wire' (wireframe overlay on the shaded meshes). */
function applyView(character, view) {
  if (!view || view === 'shaded') return;
  const meshes = [];
  character.traverse((o) => { if (o.isSkinnedMesh && o.visible) meshes.push(o); });
  for (const mesh of meshes) {
    if (view === 'silhouette') mesh.material = SILHOUETTE;
    if (view === 'wire') {
      const wire = new THREE.SkinnedMesh(mesh.geometry, WIRE);
      wire.frustumCulled = false;
      wire.bind(mesh.skeleton, mesh.bindMatrix);
      mesh.parent.add(wire);
    }
  }
}

/**
 * layout: 'turnaround'""")
open(p,'w',encoding='utf8').write(s)
p='scripts/body-strip.mjs'
s=open(p,encoding='utf8').read()
s=s.replace("const variants = o.variants ?? [def];","const variants = o.variants ?? [def];\nconst view = flag('view', undefined);")
s=s.replace("preset: preset2, pitch:","preset: preset2, view, pitch:")
open(p,'w',encoding='utf8').write(s)
