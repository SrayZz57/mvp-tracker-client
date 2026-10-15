// Edge Function « lineup-search » : cherche des lineups COURTES (40 s max) sur
// YouTube pour un agent (et éventuellement une map, un côté, un site).
//
// Pourquoi une fonction serveur : la clé de l'API YouTube ne doit jamais être
// dans l'app (dépôt public). Pourquoi un cache : une recherche coûte 100 unités
// sur les 10 000 du quota quotidien de Google, soit ~100 recherches par jour
// pour TOUS les joueurs ; la même recherche (agent + map + côté + site) n'est
// donc faite qu'une fois par semaine (TTL) et servie depuis la table
// lineup_search_cache aux suivants.
//
// À déployer à la main depuis le dashboard Supabase (voir CLAUDE.md), avec :
//   - le secret YOUTUBE_API_KEY (clé Google Cloud, API « YouTube Data API v3 »)
//   - la table de sql/lineup_search_cache.sql
//   - « Verify JWT » ACTIVÉ : seuls les comptes MVP Tracker connectés peuvent chercher.
//
// Réponse : toujours HTTP 200 avec `{ results, cached, stale }` ou `{ error }`
// (« not-configured », « quota », « failed ») — le client affiche un message
// adapté plutôt qu'une erreur réseau générique.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import {
  buildQuery,
  cacheKey,
  sanitizeInput,
  toResults,
  YOUTUBE_SEARCH_URL,
  YOUTUBE_VIDEOS_URL,
  type LineupResult,
} from './search.ts';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Garde-fou : au-delà, on ne lance plus de nouvelle recherche aujourd'hui (le
// quota de Google est de 10 000 unités = 100 recherches ; on garde de la marge).
const DAILY_SEARCH_BUDGET = 90;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

type CacheRow = { results: LineupResult[]; fetched_at: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const apiKey = Deno.env.get('YOUTUBE_API_KEY');
  if (!apiKey) return json({ error: 'not-configured' });

  let input;
  try {
    input = sanitizeInput(await req.json());
  } catch {
    input = null;
  }
  if (!input) return json({ error: 'failed' });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const key = cacheKey(input);

  const { data: cached } = await supabase.from('lineup_search_cache').select('results, fetched_at').eq('key', key).maybeSingle<CacheRow>();
  const age = cached ? Date.now() - new Date(cached.fetched_at).getTime() : Infinity;
  if (cached && age < CACHE_TTL_MS) return json({ results: cached.results, cached: true, stale: false });

  // Budget du jour : compté dans la même table, sous une clé réservée.
  const usageKey = `__usage:${new Date().toISOString().slice(0, 10)}`;
  const { data: usage } = await supabase.from('lineup_search_cache').select('results').eq('key', usageKey).maybeSingle<{ results: { count: number } }>();
  const used = usage?.results?.count ?? 0;
  if (used >= DAILY_SEARCH_BUDGET) {
    return cached ? json({ results: cached.results, cached: true, stale: true }) : json({ error: 'quota' });
  }

  try {
    const searchRes = await fetch(YOUTUBE_SEARCH_URL(buildQuery(input), apiKey));
    if (!searchRes.ok) {
      const reason = (await searchRes.json().catch(() => null))?.error?.errors?.[0]?.reason;
      console.error('[lineup-search] recherche refusée :', searchRes.status, reason);
      if (cached) return json({ results: cached.results, cached: true, stale: true });
      return json({ error: reason === 'quotaExceeded' || reason === 'dailyLimitExceeded' ? 'quota' : 'failed' });
    }
    const ids: string[] = ((await searchRes.json()).items ?? []).map((it: { id?: { videoId?: string } }) => it.id?.videoId).filter(Boolean);

    let results: LineupResult[] = [];
    if (ids.length > 0) {
      const videosRes = await fetch(YOUTUBE_VIDEOS_URL(ids, apiKey));
      if (videosRes.ok) results = toResults((await videosRes.json()).items ?? [], input);
    }

    await supabase.from('lineup_search_cache').upsert({ key, results, fetched_at: new Date().toISOString() });
    await supabase.from('lineup_search_cache').upsert({ key: usageKey, results: { count: used + 1 }, fetched_at: new Date().toISOString() });
    return json({ results, cached: false, stale: false });
  } catch (err) {
    console.error('[lineup-search] échec :', err);
    return cached ? json({ results: cached.results, cached: true, stale: true }) : json({ error: 'failed' });
  }
});
