// Skins de gants : une palette par skin (gant, plaques, tissu de manche,
// poignet, liseré). La géométrie et les animations sont les mêmes pour tous.
// Débloqués via le Battle Pass (récompenses « handSkin »), équipés en local.
export const HAND_SKINS = {
  standard: { glove: 0x3a3e46, sheen: 0x6a707c, plate: 0x3a3e46, tip: 0x4c515b, cloth: '#2a313b', cuff: 0x1c1e23, accent: 0xff4655, glow: 0x5a0a12 },
  desert: { glove: 0x9a7b55, sheen: 0xd2b48c, plate: 0x6b5236, tip: 0x7d6446, cloth: '#5b5a3c', cuff: 0x3b3526, accent: 0xff8a2a, glow: 0x5a2a05 },
  arctic: { glove: 0xdfe5ec, sheen: 0xffffff, plate: 0xb8c4d2, tip: 0xc9d3de, cloth: '#8e9aa8', cuff: 0x5d6a78, accent: 0x5fd4ff, glow: 0x0a4a66, glowIntensity: 0.7 },
  neon: { glove: 0x121418, sheen: 0x2de2ff, plate: 0x0d0f13, tip: 0x1a1d22, cloth: '#101218', cuff: 0x06070a, accent: 0x2de2ff, glow: 0x2de2ff, glowIntensity: 1.6, plateGlow: 0x0a6a80 },
  crimson: { glove: 0x6e1420, sheen: 0xff5a6a, plate: 0x1a0b0e, tip: 0x551019, cloth: '#1a1114', cuff: 0x0e0709, accent: 0xffc24a, glow: 0x6a4200, glowIntensity: 0.6 },
  // Exclusivités de la boutique.
  chrome: { glove: 0x1a1c20, sheen: 0x8a93a6, plate: 0xd7dde6, plateMetal: 1, tip: 0x2a2d33, cloth: '#1c1f26', cuff: 0x0c0d10, accent: 0xffffff, glow: 0x9fb4d6, glowIntensity: 0.8 },
  tiger: { glove: 0xd9771e, sheen: 0xffb35c, plate: 0x16110c, tip: 0xb9621a, cloth: '#2a1d12', cuff: 0x120c07, accent: 0xffc24a, glow: 0x6a3a00, glowIntensity: 0.6 },
  prestige: { glove: 0x16171b, sheen: 0x3a3a44, plate: 0xd4a23a, plateMetal: 1, tip: 0xc9962f, cloth: '#15161a', cuff: 0x0a0a0c, accent: 0xffd27a, glow: 0x7a5200, glowIntensity: 0.9 },
};

// Couleurs CSS d'une palette, pour les pastilles des menus.
export const handSwatch = (key) => {
  const p = HAND_SKINS[key] ?? HAND_SKINS.standard;
  const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
  return { glove: hex(p.glove), plate: hex(p.plate), accent: hex(p.accent), cloth: p.cloth };
};
