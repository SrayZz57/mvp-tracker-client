// Identifiants des cartes jouables (voir playableMaps.js), sans rien importer :
// le hub affiche une carte par entrée sans embarquer three.js, chargé
// seulement à l'ouverture de l'aperçu.
//
// Mise en service : un interrupteur par carte. Une carte à `false` reste dans
// le code (et ses arènes déjà créées restent jouables) mais n'apparaît pas
// dans le hub. Haven viendra plus tard.
export const MAP_RELEASE = {
  ascentA: true,
  sunsetB: true,
  havenA: false,
};

// Version web (aimtrainer-web) : aucune carte pour l'instant, quel que soit l'interrupteur
// ci-dessus. Elle le déclare avec window.mvpWeb avant de charger le hub.
const hiddenOnWeb = typeof window !== 'undefined' && window.mvpWeb?.hideValorantMaps === true;

export const PLAYABLE_MAP_IDS = hiddenOnWeb ? [] : Object.keys(MAP_RELEASE).filter((id) => MAP_RELEASE[id]);
