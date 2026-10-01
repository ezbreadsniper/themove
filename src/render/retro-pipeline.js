import * as THREE from 'three';

export const RETRO_PRESETS = {
  ps2: { height: 448, levels: 32, dither: 1, saturation: 1.12, blackLift: 0.035, contrast: 1.04, gamma: 1.0, scanlines: 0.0 },
  ps1: { height: 240, levels: 32, dither: 1.4, saturation: 1.18, blackLift: 0.04, contrast: 1.06, gamma: 1.02, scanlines: 0.0 },
  menu: { height: 448, levels: 32, dither: 1, saturation: 1.2, blackLift: 0.03, contrast: 1.05, gamma: 1.0, scanlines: 0.06 },
  clean: { height: 0, levels: 256, dither: 0, saturation: 1, blackLift: 0, contrast: 1, gamma: 1, scanlines: 0 },
};

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const fragmentShader = /* glsl */ `
precision highp float;
uniform sampler2D tScene;
uniform vec2 uLowRes;
uniform float uLevels;
uniform float uDither;
uniform float uSaturation;
uniform float uBlackLift;
uniform float uContrast;
uniform float uGamma;
uniform float uScanlines;
varying vec2 vUv;

float bayer4(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  int idx = i.x + i.y * 4;
  float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return m[idx] / 16.0 - 0.5;
}

vec3 toSRGB(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 cell = floor(vUv * uLowRes);
  vec2 uv = (cell + 0.5) / uLowRes;
  vec3 c = toSRGB(texture2D(tScene, uv).rgb);
  float luma = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(luma), c, uSaturation);
  c = (c - 0.5) * uContrast + 0.5;
  c = pow(max(c, 0.0), vec3(uGamma));
  c = uBlackLift + c * (1.0 - uBlackLift);
  c += bayer4(cell) * uDither / uLevels;
  c = floor(c * (uLevels - 1.0) + 0.5) / (uLevels - 1.0);
  c *= 1.0 - uScanlines * step(1.0, mod(cell.y, 2.0));
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

/**
 * Renders the scene into a low-resolution target, then quantizes/dithers and upscales with
 * nearest filtering. `height: 0` renders at native resolution (still graded).
 */
export class RetroPipeline {
  constructor(renderer, preset = 'ps2') {
    this.renderer = renderer;
    this.target = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      magFilter: THREE.NearestFilter,
      minFilter: THREE.NearestFilter,
      depthBuffer: true,
    });
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        tScene: { value: this.target.texture },
        uLowRes: { value: new THREE.Vector2(4, 4) },
        uLevels: { value: 32 },
        uDither: { value: 1 },
        uSaturation: { value: 1 },
        uBlackLift: { value: 0 },
        uContrast: { value: 1 },
        uGamma: { value: 1 },
        uScanlines: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.setPreset(preset);
  }

  setPreset(name) {
    this.presetName = name;
    this.preset = { ...RETRO_PRESETS[name] };
    const u = this.material.uniforms;
    u.uLevels.value = this.preset.levels;
    u.uDither.value = this.preset.dither;
    u.uSaturation.value = this.preset.saturation;
    u.uBlackLift.value = this.preset.blackLift;
    u.uContrast.value = this.preset.contrast;
    u.uGamma.value = this.preset.gamma;
    u.uScanlines.value = this.preset.scanlines;
    this.resize();
  }

  resize() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const h = this.preset.height > 0 ? Math.min(this.preset.height, size.y) : size.y;
    const w = Math.max(1, Math.round((size.x / size.y) * h));
    this.target.setSize(w, h);
    this.material.uniforms.uLowRes.value.set(w, h);
  }

  render(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.target);
    r.clear();
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCamera);
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}
