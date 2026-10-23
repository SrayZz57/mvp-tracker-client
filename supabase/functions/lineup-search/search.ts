// Logique PURE de la recherche de lineups (aucune API Deno ici, pour pouvoir la
// tester en Node) : validation de l'entrée, requête YouTube, filtrage des
// vidéos courtes et classement. Utilisée par index.ts.

export const MAX_SECONDS = 40; // « lineup courte » : 40 s au plus
export const MIN_SECONDS = 4; // en dessous, ce n'est pas une lineup (boucle, intro...)
export const MAX_RESULTS = 12;
export const MAX_PER_CHANNEL = 3;
// Quand le côté demandé est cité par trop peu de vidéos, on complète avec des vidéos qui
// ne citent AUCUN côté (jamais le côté opposé), classées après les autres.
export const MIN_SIDE_MATCHES = 4;

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
// ancienne règle de filtrage (v1 : la map n'était qu'un bonus de classement ; v2 :
// l'agent pouvait n'être cité que dans la description et le côté n'était qu'un bonus ; v3 : un autre agent pouvait aussi figurer dans le titre).
export const cacheKey = (input: SearchInput) =>
  ['v4', input.agent, input.map, input.side ?? '', input.site ?? ''].join('|').toLowerCase();

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

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// Le nom de l'agent en MOT ENTIER (« sova » ne doit pas matcher « sovation »).
function agentRegex(agent: string): RegExp {
  const alternatives = agentVariants(agent).map(escapeRegex).join('|');
  return new RegExp(`(^|[^a-z0-9])(${alternatives})($|[^a-z0-9])`);
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

// Tous les agents : sert à repérer une vidéo qui parle d'un AUTRE agent que celui demandé.
const ALL_AGENTS = ['astra', 'breach', 'brimstone', 'chamber', 'clove', 'cypher', 'deadlock', 'fade', 'gekko', 'harbor', 'iso', 'jett', 'kay/o', 'killjoy', 'miks', 'neon', 'omen', 'phoenix', 'raze', 'reyna', 'sage', 'skye', 'sova', 'tejo', 'veto', 'viper', 'vyse', 'waylay', 'yoru'];

// Côté de jeu : « post-plant » et « plant » sont des lineups d'ATTAQUE (les attaquants
// ont posé le spike) ; « retake » et « anchor » sont de la DÉFENSE.
const SIDE_WORDS = {
  attack: /\b(attack|attacks|attacker|attackers|attacking|attaque|atk|execute|executes|execution|post.?plants?|plants?)\b/,
  defense: /\b(defense|defence|defend|defending|defender|defenders|defensive|retake|retakes|anchor|anchoring)\b/,
} as const;
const OPPOSITE = { attack: 'defense', defense: 'attack' } as const;

/**
 * Garde les vidéos courtes, intégrables et vraiment sur l'agent, classées par pertinence.
 *
 * - Agent : le titre DOIT citer l'agent demandé ET aucun autre agent. Description et tags ne
 *   comptent pas : une lineup de Sova qui cite Cypher plus loin n'est pas une lineup de Cypher.
 * - Map : la vidéo DOIT la citer (titre, ou description/tags si le titre ne parle pas d'une
 *   autre map).
 * - Côté : quand il est demandé, jamais une vidéo qui annonce le côté opposé dans son titre ;
 *   celles qui citent le bon côté passent devant, et les vidéos sans aucun côté ne servent
 *   qu'à compléter s'il y en a trop peu.
 */
export function toResults(items: RawVideo[], input: SearchInput): LineupResult[] {
  const chosenAgent = agentRegex(input.agent);
  const chosenCompact = fold(input.agent).replace(/[^a-z0-9]/g, '');
  const otherAgents = ALL_AGENTS.filter((name) => name.replace(/[^a-z0-9]/g, '') !== chosenCompact).map((name) => agentRegex(name));
  const mapName = fold(input.map);
  const scored: Array<{ result: LineupResult; score: number; tier: 0 | 1 }> = [];

  for (const item of items ?? []) {
    const id = item.id;
    if (!id || item.status?.embeddable === false || (item.status?.privacyStatus && item.status.privacyStatus !== 'public')) continue;
    const seconds = parseIsoDuration(item.contentDetails?.duration ?? '');
    if (seconds < MIN_SECONDS || seconds > MAX_SECONDS) continue;

    const snippet = item.snippet ?? {};
    const title = fold(snippet.title ?? '');
    const text = fold([snippet.title, snippet.description, ...(snippet.tags ?? [])].filter(Boolean).join(' '));
    if (!text.includes('valorant')) continue;

    // --- Agent -------------------------------------------------------------------
    const agentInTitle = chosenAgent.test(title);
    const otherAgentInTitle = otherAgents.some((regex) => regex.test(title));
    if (!agentInTitle || otherAgentInTitle) continue;

    const views = Number(item.statistics?.viewCount ?? 0);
    let score = Math.log10(views + 1);

    // --- Map ---------------------------------------------------------------------
    if (mapName) {
      const chosenInTitle = mentionsMap(title, mapName);
      const otherInTitle = ALL_MAPS.some((other) => other !== mapName && mentionsMap(title, other));
      if (!chosenInTitle && (otherInTitle || !mentionsMap(text, mapName))) continue;
      // La précision de la map pèse plus lourd que les vues (échelle logarithmique,
      // ~6 points au plus) : une vidéo claire passe toujours devant une vidéo
      // ambiguë, même bien plus vue.
      score += chosenInTitle && !otherInTitle ? 10 : 5;
    }

    // --- Côté --------------------------------------------------------------------
    let tier: 0 | 1 = 0;
    if (input.side) {
      const wanted = SIDE_WORDS[input.side];
      const opposite = SIDE_WORDS[OPPOSITE[input.side]];
      const wantedInTitle = wanted.test(title);
      const oppositeInTitle = opposite.test(title);
      const wantedInText = wanted.test(text);
      // Le titre annonce l'autre côté (sans citer le bon) : écarté, quoi qu'en dise la description.
      if (oppositeInTitle && !wantedInTitle) continue;
      if (wantedInTitle) score += 6;
      else if (wantedInText && !oppositeInTitle) score += 3;
      else tier = 1; // aucun côté cité : ne sert qu'à compléter
    }

    if (input.site) {
      const s = input.site.toLowerCase();
      if (new RegExp(`\\b(site ${s}|${s} site|${s}-site)\\b`).test(text)) score += 1;
    }

    scored.push({
      score,
      tier,
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

  // Vidéos sans aucun côté : seulement si le côté demandé en a donné trop peu.
  const strict = scored.filter((entry) => entry.tier === 0);
  const pool = !input.side || strict.length >= MIN_SIDE_MATCHES ? strict : scored;
  pool.sort((a, b) => a.tier - b.tier || b.score - a.score);

  // Pas plus de 3 vidéos de la même chaîne : sinon un seul créateur remplit la liste.
  const perChannel = new Map<string, number>();
  const out: LineupResult[] = [];
  for (const { result } of pool) {
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
