/** Face presets: geometry knobs (jaw, nose, cheeks) + texture knobs (eyes, brows, lips, facial hair). */
export const FACE_PRESETS = {
  broad: {
    jawWidth: 1.12, chinLength: 0.94, cheekbones: 1.12, noseWidth: 1.4, noseProjection: 0.85, noseLength: 1.0,
    lipFullness: 1.35, eyeShape: 'hooded', eyeSize: 1.0, eyeSpacing: 1.02, browThickness: 1.25,
    browTilt: 0.2, browRidge: 1.1, irisColor: '#1e130c', lipTone: 0.72, headWidth: 0.98,
  },
  chiseled: {
    jawWidth: 0.98, chinLength: 1.06, cheekbones: 1.24, jawDefinition: 1, noseWidth: 1.25, noseProjection: 0.95,
    noseLength: 1.0, lipFullness: 1.55, eyeShape: 'almond', eyeSize: 0.98, eyeSpacing: 1.02, browThickness: 1.2,
    browTilt: 0.12, browRidge: 1.25, irisColor: '#1e130c', lipTone: 0.9, headWidth: 0.96, headDepth: 1.0,
  },
  feminine: {
    jawWidth: 0.9, chinLength: 0.95, chinWidth: -0.3, cheekbones: 1.14, cheekFullness: 0.15, noseWidth: 0.86,
    noseProjection: 0.88, noseLength: 0.92, noseTip: -0.2, noseBridge: -0.2, lipFullness: 1.35, upperLip: 1.05, lowerLip: 1.15,
    eyeShape: 'almond', eyeSize: 1.12, eyeSpacing: 1.02, browThickness: 0.72, browTilt: 0.35, browRidge: 0.55,
    browHeight: 0.25, lashes: 1, irisColor: '#2a1a12', lipTone: 0.98, headWidth: 0.96, earSize: 0.92,
  },
  square: {
    jawWidth: 1.1, chinLength: 1.08, cheekbones: 0.95, noseWidth: 1.0, noseProjection: 1.15,
    noseLength: 1.05, lipFullness: 0.8, eyeShape: 'almond', eyeSize: 0.92, eyeSpacing: 0.98,
    browThickness: 1.05, browTilt: -0.2, browRidge: 1.2, irisColor: '#4e4330', lipTone: 0.95,
    headWidth: 1.02,
  },
  soft: {
    jawWidth: 0.98, chinLength: 0.96, cheekbones: 1.05, noseWidth: 1.15, noseProjection: 1.0,
    lipFullness: 1.15, eyeShape: 'almond', eyeSize: 1.0, eyeSpacing: 1.0, browThickness: 1.0,
    browTilt: 0, irisColor: '#2a1a12', lipTone: 0.85,
  },
  narrow: {
    jawWidth: 0.92, chinLength: 1.1, cheekbones: 1.0, noseWidth: 0.9, noseProjection: 1.1,
    noseLength: 1.1, lipFullness: 0.9, eyeShape: 'narrow', eyeSize: 0.95, eyeSpacing: 0.96,
    browThickness: 0.95, browTilt: 0.35, irisColor: '#2b1d14', lipTone: 0.9, headWidth: 0.95,
  },
  round: {
    jawWidth: 1.04, chinLength: 0.9, cheekbones: 1.08, noseWidth: 1.2, noseProjection: 0.9,
    lipFullness: 1.1, eyeShape: 'round', eyeSize: 1.08, eyeSpacing: 1.04, browThickness: 1.1,
    browTilt: -0.1, irisColor: '#2f2016', lipTone: 0.85, headWidth: 1.03, headDepth: 0.98,
  },
};

export const FACE_PRESET_NAMES = Object.keys(FACE_PRESETS);
