// Détection de plateforme + construction de l'URL d'intégration — utilisé
// par le module Clips ET Lineups (TechLibrary.jsx), voir VideoPlayer.jsx.
// Jamais de vidéo hébergée par nous, juste un lien vers la plateforme
// source, intégré en iframe (ou lu en natif pour Medal.tv, qui la refuse).
//
// Formats vérifiés auprès de la doc officielle de chaque plateforme (pas
// devinés), ET contre les vraies réponses HTTP des serveurs (curl -I) — pas
// que la doc, qui s'est avérée trompeuse pour Medal :
//   - YouTube    : https://www.youtube-nocookie.com/embed/{id} — s'intègre
//     sans restriction, vérifié.
//   - Medal.tv   : PAS intégrable en iframe, contrairement à ce que leur
//     doc développeur laisse penser. Vérifié aux vrais en-têtes HTTP
//     (`curl -I`) : `x-frame-options: SAMEORIGIN` est présent aussi bien sur
//     le lien de partage moderne (medal.tv/games/{jeu}/clips/{id}) que sur
//     le format d'embed historique de leur doc (medal.tv/clip/{id}/{slug})
//     — les deux refusent d'être chargés dans une iframe hors medal.tv,
//     d'où l'écran noir signalé en vrai. On se contente donc de détecter la
//     plateforme (pour l'affichage/le tri), sans jamais tenter d'iframe —
//     ouverture dans le navigateur système à la place (voir ClipsFeed.jsx).
//   - Streamable : https://streamable.com/e/{id}?autoplay=0&muted=1, id
//     extrait du lien de partage streamable.com/{id} — vérifié sur la doc
//     API officielle (streamable-support.zendesk.com, article "Editing the
//     Embed Code") ET aux en-têtes HTTP (aucun x-frame-options/CSP
//     restrictif, contrairement à Medal).

const YOUTUBE_ID_PATTERN = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/;
// Accepte "clip" et "clips" (singulier/pluriel) sur n'importe quel chemin
// medal.tv — le vrai lien de partage utilise le pluriel (medal.tv/games/
// {jeu}/clips/{id}), pas juste la forme figée vue dans la doc.
const MEDAL_PATH_PATTERN = /medal\.tv\/[a-z0-9_/-]*clips?\/[\w-]+(?:\/[\w-]+)?/i;
// `\/e\/` exclu du groupe capturé : un lien déjà en format embed ne doit pas
// se retrouver avec `/e/` doublé une fois reconstruit.
const STREAMABLE_ID_PATTERN = /streamable\.com\/(?:e\/)?([a-zA-Z0-9]{3,})/i;

export const CLIP_PLATFORMS = {
  youtube: { labelKey: 'clips.platform.youtube' },
  medal: { labelKey: 'clips.platform.medal' },
  streamable: { labelKey: 'clips.platform.streamable' },
};

/** Plateforme détectée à partir d'un lien collé, ou `null` si aucune des 3 supportées. */
export function detectClipPlatform(url) {
  if (!url) return null;
  if (YOUTUBE_ID_PATTERN.test(url)) return 'youtube';
  if (MEDAL_PATH_PATTERN.test(url)) return 'medal';
  if (STREAMABLE_ID_PATTERN.test(url)) return 'streamable';
  return null;
}

/**
 * URL d'intégration (iframe) pour un lien déjà détecté, ou `null` si la
 * plateforme est reconnue mais ne peut pas être intégrée (Medal.tv — voir
 * plus haut) : dans ce cas le lien doit s'ouvrir dans le navigateur système
 * plutôt que produire une iframe vide/noire.
 */
export function clipEmbedUrl(url) {
  if (!url) return null;

  const youtube = url.match(YOUTUBE_ID_PATTERN);
  if (youtube) return `https://www.youtube-nocookie.com/embed/${youtube[1]}`;

  const streamable = url.match(STREAMABLE_ID_PATTERN);
  if (streamable) return `https://streamable.com/e/${streamable[1]}?autoplay=0&muted=1`;

  // Medal.tv : jamais d'iframe (voir le commentaire du haut de fichier).
  return null;
}

/** Miniature statique (sans appel réseau à l'API de la plateforme) — YouTube uniquement, les deux autres n'en exposent pas sans passer par leur API. */
export function clipThumbnailUrl(url) {
  const youtube = url?.match(YOUTUBE_ID_PATTERN);
  return youtube ? `https://i.ytimg.com/vi/${youtube[1]}/hqdefault.jpg` : null;
}
