// Edge Function « lineup-search » — VERSION EN UN SEUL FICHIER, à coller dans l'éditeur
// de fonctions du dashboard Supabase. Générée à partir de index.ts + search.ts
// (supabase/functions/lineup-search/) : en cas de modification, régénérer plutôt que
// d'éditer ici. Prérequis : secret YOUTUBE_API_KEY, table lineup_search_cache
// (sql/lineup_search_cache.sql), « Verify JWT » activé.
// F:/MVP Tracker/gamer-hub/supabase/functions/lineup-search/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// F:/MVP Tracker/gamer-hub/supabase/functions/lineup-search/search.ts
var MAX_SECONDS = 40;
var MIN_SECONDS = 4;
var MAX_RESULTS = 12;
var MAX_PER_CHANNEL = 3;
var NAME_PATTERN = /^[\p{L}\p{N} '/.\-]{2,30}$/u;
function sanitizeInput(raw) {
  const body = raw ?? {};
  const agent = typeof body.agent === "string" ? body.agent.trim() : "";
  const map = typeof body.map === "string" ? body.map.trim() : "";
  if (!NAME_PATTERN.test(agent) || map !== "" && !NAME_PATTERN.test(map)) return null;
  const side = body.side === "attack" || body.side === "defense" ? body.side : null;
  const site = body.site === "A" || body.site === "B" || body.site === "C" ? body.site : null;
  return { agent, map, side, site };
}
var cacheKey = (input) => ["v2", input.agent, input.map, input.side ?? "", input.site ?? ""].join("|").toLowerCase();
function buildQuery(input) {
  const parts = ["valorant", input.agent];
  if (input.map) parts.push(input.map);
  parts.push("lineup");
  if (input.site) parts.push(`${input.site} site`);
  if (input.side === "attack") parts.push("attack");
  if (input.side === "defense") parts.push("defense");
  parts.push("shorts");
  return parts.join(" ");
}
function parseIsoDuration(iso) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? "");
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}
var fold = (text) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function agentVariants(agent) {
  const base = fold(agent);
  const compact = base.replace(/[^a-z0-9]/g, "");
  return [.../* @__PURE__ */ new Set([base, compact, base.replace(/[/\-.]/g, " ")])];
}
var ALL_MAPS = ["abyss", "ascent", "bind", "breeze", "corrode", "fracture", "haven", "icebox", "lotus", "pearl", "split", "summit", "sunset"];
var mentionsMap = (text, map) => new RegExp(`\\b${map}\\b`).test(text);
function toResults(items, input) {
  const variants = agentVariants(input.agent);
  const mapName = fold(input.map);
  const scored = [];
  for (const item of items ?? []) {
    const id = item.id;
    if (!id || item.status?.embeddable === false || item.status?.privacyStatus && item.status.privacyStatus !== "public") continue;
    const seconds = parseIsoDuration(item.contentDetails?.duration ?? "");
    if (seconds < MIN_SECONDS || seconds > MAX_SECONDS) continue;
    const snippet = item.snippet ?? {};
    const text = fold([snippet.title, snippet.description, ...snippet.tags ?? []].filter(Boolean).join(" "));
    if (!text.includes("valorant")) continue;
    if (!variants.some((variant) => text.includes(variant))) continue;
    const views = Number(item.statistics?.viewCount ?? 0);
    let score = Math.log10(views + 1);
    if (mapName) {
      const title = fold(snippet.title ?? "");
      const chosenInTitle = mentionsMap(title, mapName);
      const otherInTitle = ALL_MAPS.some((other) => other !== mapName && mentionsMap(title, other));
      if (!chosenInTitle && (otherInTitle || !mentionsMap(text, mapName))) continue;
      score += chosenInTitle && !otherInTitle ? 10 : 5;
    }
    if (input.site) {
      const s = input.site.toLowerCase();
      if (new RegExp(`\\b(site ${s}|${s} site|${s}-site)\\b`).test(text)) score += 1;
    }
    if (input.side === "attack" && /\b(attack|attaque|atk|execute)\b/.test(text)) score += 1;
    if (input.side === "defense" && /\b(defense|defence|retake|post.?plant)\b/.test(text)) score += 1;
    scored.push({
      score,
      result: {
        id,
        title: snippet.title ?? "",
        channel: snippet.channelTitle ?? "",
        seconds,
        views,
        publishedAt: snippet.publishedAt ?? "",
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
      }
    });
  }
  scored.sort((a, b) => b.score - a.score);
  const perChannel = /* @__PURE__ */ new Map();
  const out = [];
  for (const { result } of scored) {
    const count = perChannel.get(result.channel) ?? 0;
    if (count >= MAX_PER_CHANNEL) continue;
    perChannel.set(result.channel, count + 1);
    out.push(result);
    if (out.length >= MAX_RESULTS) break;
  }
  return out;
}
var YOUTUBE_SEARCH_URL = (query, apiKey) => "https://www.googleapis.com/youtube/v3/search?" + new URLSearchParams({
  part: "snippet",
  type: "video",
  videoDuration: "short",
  // YouTube : « moins de 4 minutes » — le tri à 40 s se fait ensuite
  videoEmbeddable: "true",
  maxResults: "50",
  order: "relevance",
  q: query,
  key: apiKey
}).toString();
var YOUTUBE_VIDEOS_URL = (ids, apiKey) => "https://www.googleapis.com/youtube/v3/videos?" + new URLSearchParams({ part: "snippet,contentDetails,statistics,status", id: ids.join(","), key: apiKey }).toString();

// F:/MVP Tracker/gamer-hub/supabase/functions/lineup-search/index.ts
var CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
var DAILY_SEARCH_BUDGET = 90;
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
var json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  const apiKey = Deno.env.get("YOUTUBE_API_KEY");
  if (!apiKey) return json({ error: "not-configured" });
  let input;
  try {
    input = sanitizeInput(await req.json());
  } catch {
    input = null;
  }
  if (!input) return json({ error: "failed" });
  const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const key = cacheKey(input);
  const { data: cached } = await supabase.from("lineup_search_cache").select("results, fetched_at").eq("key", key).maybeSingle();
  const age = cached ? Date.now() - new Date(cached.fetched_at).getTime() : Infinity;
  if (cached && age < CACHE_TTL_MS) return json({ results: cached.results, cached: true, stale: false });
  const usageKey = `__usage:${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}`;
  const { data: usage } = await supabase.from("lineup_search_cache").select("results").eq("key", usageKey).maybeSingle();
  const used = usage?.results?.count ?? 0;
  if (used >= DAILY_SEARCH_BUDGET) {
    return cached ? json({ results: cached.results, cached: true, stale: true }) : json({ error: "quota" });
  }
  try {
    const searchRes = await fetch(YOUTUBE_SEARCH_URL(buildQuery(input), apiKey));
    if (!searchRes.ok) {
      const reason = (await searchRes.json().catch(() => null))?.error?.errors?.[0]?.reason;
      console.error("[lineup-search] recherche refus\xE9e :", searchRes.status, reason);
      if (cached) return json({ results: cached.results, cached: true, stale: true });
      return json({ error: reason === "quotaExceeded" || reason === "dailyLimitExceeded" ? "quota" : "failed" });
    }
    const ids = ((await searchRes.json()).items ?? []).map((it) => it.id?.videoId).filter(Boolean);
    let results = [];
    if (ids.length > 0) {
      const videosRes = await fetch(YOUTUBE_VIDEOS_URL(ids, apiKey));
      if (videosRes.ok) results = toResults((await videosRes.json()).items ?? [], input);
    }
    await supabase.from("lineup_search_cache").upsert({ key, results, fetched_at: (/* @__PURE__ */ new Date()).toISOString() });
    await supabase.from("lineup_search_cache").upsert({ key: usageKey, results: { count: used + 1 }, fetched_at: (/* @__PURE__ */ new Date()).toISOString() });
    return json({ results, cached: false, stale: false });
  } catch (err) {
    console.error("[lineup-search] \xE9chec :", err);
    return cached ? json({ results: cached.results, cached: true, stale: true }) : json({ error: "failed" });
  }
});
