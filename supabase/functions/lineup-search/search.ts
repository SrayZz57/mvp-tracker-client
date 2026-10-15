// Logique PURE de la recherche de lineups (aucune API Deno ici, pour pouvoir la
// tester en Node) : validation de l'entrée, requête YouTube, filtrage des
// vidéos courtes et classement. Utilisée par index.ts.

export const MAX_SECONDS = 40; // « lineup courte » : 40 s au plus
export const MIN_SECONDS = 4; // en dessous, ce n'est pas une lineup (boucle, intro...)
export const MAX_RESULTS = 12;
export const MAX_PER_CHANNEL = 3;

export type Side = 'attack' | 'defense' | null;
export type Site = 'A' | 'B' | 'C' | null;
// map vide = toutes les maps : on cherche d'abord par agent, la map affine ensuite.
export type SearchInput = { agent: string; map: string; side: Side; site: Site };

export type LineupResult = {
  id: string;
  title: string;
  channel: string;
  seconds: number;
  views: number;
  publishedAt: string;
  thumbnail: string;
};

// Texte libre venu du client : on n'accepte que des noms courts, sans caractère
// pouvant détourner la requête (ni « & », ni « = », ni retour à la ligne).
const NAME_PATTERN = /^[\p{L}\p{N} '/.\-]{2,30}$/u;

export function sanitizeInput(raw: unknown): SearchInput | null {
  const body = (raw ?? {}) as Record<string, unknown>;
  const agent = typeof body.agent === 'string' ? body.agent.trim() : '';
  const map = typeof body.map === 'string' ? body.map.trim() : '';
  if (!NAME_PATTERN.test(agent) || (map !== '' && !NAME_PATTERN.test(map))) return null;
  const side: Side = body.side === 'attack' || body.side === 'defense' ? body.side : null;
  const site: Site = body.site === 'A' || body.site === 'B' || body.site === 'C' ? body.site : null;
  return { agent, map, side, site };
}

// Le préfixe de version invalide d'un coup tous les résultats mis en cache avec une
// ancienne règle de filtrage (v1 : la map n'était qu'un bonus de classement).
export const cacheKey = (input: SearchInput) =>
  ['v2', input.agent, input.map, input.side ?? '', input.site ?? ''].join('|').toLowerCase();

/** Requête envoyée à YouTube (en anglais : la grande majorité des lineups le sont). */
export function buildQuery(input: SearchInput): string {
  const parts = ['valorant', input.agent];
  if (input.map) parts.push(input.map);
  parts.push('lineup');
  if (input.site) parts.push(`${input.site} site`);
  if (input.side === 'attack') parts.push('attack');
  if (input.side === 'defense') parts.push('defense');
  parts.push('shorts');
  return parts.join(' ');
}

/** « PT1M5S » -> 65, « PT28S » -> 28, « PT1H » -> 3600. 0 si illisible. */
export function parseIsoDuration(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? '');
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

// « KAY/O » s'écrit kayo, kay/o, kay-o, kay o selon les auteurs.
function agentVariants(agent: string): string[] {
  const base = fold(agent);
  const compact = base.replace(/[^a-z0-9]/g, '');
  return [...new Set([base, compact, base.replace(/[/\-.]/g, ' ')])];
}

type RawVideo = {
  id?: string;
  snippet?: { title?: string; description?: string; channelTitle?: string; publishedAt?: string; tags?: string[] };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string };
  status?: { embeddable?: boolean; privacyStatus?: string };
};

// Toutes les maps du jeu : sert à repérer une vidéo qui parle d'une AUTRE map que
// celle demandée. Comparaison en mots entiers, sans accents ni casse.
const ALL_MAPS = ['abyss', 'ascent', 'bind', 'breeze', 'corrode', 'fracture', 'haven', 'icebox', 'lotus', 'pearl', 'split', 'summit', 'sunset'];
const mentionsMap = (text: string, map: string) => new RegExp(`\\b${map}\\b`).test(text);

/**
 * Garde les vidéos courtes, intégrables et vraiment sur l'agent, classées par pertinence.
 * Quand une map est demandée, la vidéo DOIT la citer : dans le titre, ou dans la
 * description/les tags à condition que le titre ne parle pas d'une autre map. Sans
 * ça, la recherche YouTube renvoyait des lineups d'autres maps (elle est floue).
 */
export function toResults(items: RawVideo[], input: SearchInput): LineupResult[] {
  const variants = agentVariants(input.agent);
  const mapName = fold(input.map);
  const scored: Array<{ result: LineupResult; score: number }> = [];

  for (const item of items ?? []) {
    const id = item.id;
    if (!id || item.status?.embeddable === false || (item.status?.privacyStatus && item.status.privacyStatus !== 'public')) continue;
    const seconds = parseIsoDuration(item.contentDetails?.duration ?? '');
    if (seconds < MIN_SECONDS || seconds > MAX_SECONDS) continue;

    const snippet = item.snippet ?? {};
    const text = fold([snippet.title, snippet.description, ...(snippet.tags ?? [])].filter(Boolean).join(' '));
    if (!text.includes('valorant')) continue;
    if (!variants.some((variant) => text.includes(variant))) continue;

    const views = Number(item.statistics?.viewCount ?? 0);
    let score = Math.log10(views + 1);
    if (mapName) {
      const title = fold(snippet.title ?? '');
      const chosenInTitle = mentionsMap(title, mapName);
      const otherInTitle = ALL_MAPS.some((other) => other !== mapName && mentionsMap(title, other));
      if (!chosenInTitle && (otherInTitle || !mentionsMap(text, mapName))) continue;
      // La précision de la map pèse plus lourd que les vues (échelle logarithmique,
      // ~6 points au plus) : une vidéo claire passe toujours devant une vidéo
      // ambiguë, même bien plus vue. Ambigu = « Haven et Split » dans le titre, ou
      // map seulement dans la description.
      score += chosenInTitle && !otherInTitle ? 10 : 5;
    }
    if (input.site) {
      const s = input.site.toLowerCase();
      if (new RegExp(`\\b(site ${s}|${s} site|${s}-site)\\b`).test(text)) score += 1;
    }
    if (input.side === 'attack' && /\b(attack|attaque|atk|execute)\b/.test(text)) score += 1;
    if (input.side === 'defense' && /\b(defense|defence|retake|post.?plant)\b/.test(text)) score += 1;

    scored.push({
      score,
      result: {
        id,
        title: snippet.title ?? '',
        channel: snippet.channelTitle ?? '',
        seconds,
        views,
        publishedAt: snippet.publishedAt ?? '',
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      },
    });
  }

  scored.sort((a, b) => b.score - a.score);
  // Pas plus de 3 vidéos de la même chaîne : sinon un seul créateur remplit la liste.
  const perChannel = new Map<string, number>();
  const out: LineupResult[] = [];
  for (const { result } of scored) {
    const count = perChannel.get(result.channel) ?? 0;
    if (count >= MAX_PER_CHANNEL) continue;
    perChannel.set(result.channel, count + 1);
    out.push(result);
    if (out.length >= MAX_RESULTS) break;
  }
  return out;
}

export const YOUTUBE_SEARCH_URL = (query: string, apiKey: string) =>
  'https://www.googleapis.com/youtube/v3/search?' +
  new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoDuration: 'short', // YouTube : « moins de 4 minutes » — le tri à 40 s se fait ensuite
    videoEmbeddable: 'true',
    maxResults: '50',
    order: 'relevance',
    q: query,
    key: apiKey,
  }).toString();

export const YOUTUBE_VIDEOS_URL = (ids: string[], apiKey: string) =>
  'https://www.googleapis.com/youtube/v3/videos?' +
  new URLSearchParams({ part: 'snippet,contentDetails,statistics,status', id: ids.join(','), key: apiKey }).toString();
