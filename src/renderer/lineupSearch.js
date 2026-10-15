// Recherche de lineups COURTES (YouTube Shorts, 40 s max) pour la boîte à outils
// en jeu. La recherche elle-même se fait côté serveur (Edge Function
// « lineup-search » : clé YouTube, cache partagé entre joueurs, budget
// quotidien — voir supabase/functions/lineup-search/index.ts). Ici : l'appel,
// la traduction des erreurs en statuts lisibles, et une mémoire de session pour
// ne jamais refaire deux fois la même recherche pendant que la fenêtre est ouverte.

export const SHORT_MAX_SECONDS = 40;

// Statuts : 'ok' | 'unavailable' (fonction non déployée ou clé absente) |
// 'quota' (budget du jour épuisé, rien en cache) | 'auth' (compte non connecté) | 'error'.
const memory = new Map();

export const lineupSearchKey = ({ agent, map, side, site }) =>
  [agent, map ?? '', side ?? '', site ?? ''].join('|').toLowerCase();

export async function searchLineups(supabase, input) {
  const key = lineupSearchKey(input);
  if (memory.has(key)) return memory.get(key);

  let outcome;
  try {
    const { data, error } = await supabase.functions.invoke('lineup-search', {
      body: { agent: input.agent, map: input.map ?? '', side: input.side ?? null, site: input.site ?? null },
    });

    if (error) {
      // FunctionsHttpError porte la réponse HTTP ; 404 = fonction pas déployée, 401 = pas connecté.
      const status = error.context?.status;
      outcome = { status: status === 404 ? 'unavailable' : status === 401 ? 'auth' : 'error', results: [] };
    } else if (data?.error) {
      outcome = {
        status: data.error === 'not-configured' ? 'unavailable' : data.error === 'quota' ? 'quota' : 'error',
        results: [],
      };
    } else {
      // On n'affiche jamais une vidéo plus longue que prévu, même si le serveur en laissait passer une.
      const results = (data?.results ?? []).filter((video) => video.seconds <= SHORT_MAX_SECONDS);
      outcome = { status: 'ok', results, stale: Boolean(data?.stale) };
    }
  } catch {
    outcome = { status: 'error', results: [] };
  }

  // Seuls les succès sont mémorisés : une panne passagère doit pouvoir être retentée.
  if (outcome.status === 'ok') memory.set(key, outcome);
  return outcome;
}

/** 28 -> « 0:28 ». */
export function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 1234 -> « 1,2 k », 1500000 -> « 1,5 M » (selon la langue). */
export function formatViews(views, locale = 'fr') {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(views);
}

/** Lecteur YouTube intégré d'un Short : lecture auto, boucle, sans vidéos liées d'autres chaînes. */
export const shortEmbedUrl = (id) =>
  `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&loop=1&playlist=${id}&rel=0&playsinline=1&modestbranding=1`;

export const shortWatchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;
