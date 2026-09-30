// Identifiants des cartes jouables (voir playableMaps.js), sans rien importer :
// le hub affiche un bouton par carte sans embarquer three.js, chargé
// seulement à l'ouverture de l'aperçu.
// Désactivées pour la 1.13.0 : pas encore prêtes à être montrées aux joueurs.
export const ENABLE_PLAYABLE_MAPS = false;

export const PLAYABLE_MAP_IDS = ENABLE_PLAYABLE_MAPS ? ['ascentA', 'sunsetB', 'havenA'] : [];
