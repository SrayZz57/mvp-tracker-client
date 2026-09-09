// Reconnaît les liens YouTube (watch, youtu.be, shorts, déjà en embed) pour
// proposer un lecteur intégré directement dans la carte. Tout le reste
// (Streamable, Medal.tv, Twitch clips...) s'ouvre dans le navigateur système
// via window.electronAPI.openExternal plutôt qu'en iframe : chaque service a
// son propre format d'intégration et sa propre politique de frame-ancestors,
// les gérer tous serait fragile pour un gain minime — YouTube couvre déjà la
// grande majorité des partages attendus ici.
const YOUTUBE_ID_PATTERN =
  /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/;

/** URL d'intégration YouTube (mode "nocookie", pas de traçage tiers), ou `null` si le lien n'est pas YouTube. */
export function youtubeEmbedUrl(url) {
  if (!url) return null;
  const match = url.match(YOUTUBE_ID_PATTERN);
  return match ? `https://www.youtube-nocookie.com/embed/${match[1]}` : null;
}
