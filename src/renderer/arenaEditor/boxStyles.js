// Styles de box de l'éditeur d'arène. Donnée pure (aucun three.js) : lue par
// l'éditeur pour construire ses matériaux, et plus tard par le jeu pour
// rendre une arène perso à l'identique. Un style ajouté ici doit l'être aussi
// dans les traductions (aimTrainer.arenaEditor.styles.<id>).
export const BOX_STYLES = {
  concrete: { color: 0x9a9a95, roughness: 0.95, metalness: 0 },
  plaster: { color: 0xd8c4a0, roughness: 0.9, metalness: 0 },
  wood: { color: 0x8a6a42, roughness: 0.85, metalness: 0 },
  metal: { color: 0x6f7c88, roughness: 0.35, metalness: 0.6 },
  glass: { color: 0x9fd8ff, roughness: 0.05, metalness: 0, opacity: 0.35 },
};

export const BOX_STYLE_IDS = Object.keys(BOX_STYLES);
export const DEFAULT_BOX_STYLE = 'wood';

export const cssColor = (hex) => `#${hex.toString(16).padStart(6, '0')}`;
