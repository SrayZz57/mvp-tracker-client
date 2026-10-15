// Taux de victoire des agents par map, relevés sur metabot.gg le 2026-10-15
// (parties compétitives, tous rangs, toutes régions, toutes plateformes). Ce
// sont des statistiques RÉELLES d'un échantillon de parties, pas des avis : mais
// elles restent propres à ce site et à ce moment — elles vieillissent à chaque
// patch et mélangent tous les niveaux. À actualiser périodiquement
// (voir MAP_STATS_SOURCE.date).
//
// Format : agent -> [taux de victoire en %, nombre de parties]. Les agents sous
// 100 parties sont écartés, et seuls ceux à 300 parties ou plus sont jugés
// fiables (MIN_RELIABLE_MATCHES) : un taux de 70 % sur 57 parties ne veut rien
// dire. Ni Icebox (hors rotation compétitive, aucune donnée chez la source) ne
// figure ici : voir LEGACY_TIERS.
export const MAP_STATS_SOURCE = { name: 'Metabot', url: 'https://metabot.gg', date: '2026-10-15' };
export const MAP_TIER_SOURCE_DATE = MAP_STATS_SOURCE.date;
export const MIN_RELIABLE_MATCHES = 300;

export const MAP_AGENT_STATS = {
  Corrode: {
    "Neon": [54.4, 1642],
    "Veto": [54.3, 326],
    "Vyse": [54.2, 1042],
    "Clove": [53.3, 4529],
    "Sova": [52.6, 521],
    "Fade": [52.0, 3708],
    "Jett": [51.8, 1914],
    "Viper": [51.7, 379],
    "Omen": [51.2, 648],
    "Reyna": [51.0, 1793],
    "Chamber": [50.8, 2727],
    "Yoru": [50.6, 1635],
    "Deadlock": [50.0, 332],
    "Waylay": [50.0, 2902],
    "Phoenix": [48.3, 317],
    "Iso": [47.0, 264],
    "Sage": [56.5, 193],
    "Cypher": [54.9, 206],
    "Raze": [53.1, 145],
    "Tejo": [52.8, 127],
    "KAY/O": [45.0, 131],
  },
  Summit: {
    "Vyse": [55.5, 256],
    "Sage": [54.9, 557],
    "Yoru": [53.4, 341],
    "Fade": [52.0, 2452],
    "Clove": [51.7, 3144],
    "Reyna": [51.1, 1791],
    "Neon": [50.6, 1540],
    "Phoenix": [50.4, 1145],
    "Jett": [50.0, 2687],
    "Cypher": [49.9, 1184],
    "Raze": [49.6, 242],
    "Skye": [48.0, 227],
    "Sova": [47.3, 520],
    "Waylay": [47.3, 757],
    "Chamber": [46.8, 1891],
    "Omen": [46.0, 509],
    "Deadlock": [54.1, 133],
    "Killjoy": [52.5, 101],
    "Harbor": [52.4, 105],
    "Iso": [49.7, 199],
    "Tejo": [47.0, 132],
    "Astra": [46.9, 130],
    "Veto": [45.5, 134],
  },
  Haven: {
    "Killjoy": [53.4, 3264],
    "Phoenix": [53.3, 3912],
    "Neon": [53.1, 4213],
    "Clove": [52.9, 10075],
    "Cypher": [52.0, 3353],
    "Sova": [51.9, 11021],
    "Yoru": [51.9, 2149],
    "Reyna": [50.2, 4751],
    "Jett": [50.1, 10756],
    "Chamber": [48.9, 4963],
    "Omen": [48.9, 2458],
    "Waylay": [48.4, 1269],
    "Iso": [46.9, 811],
    "Raze": [53.6, 349],
    "Fade": [50.3, 173],
    "Miks": [49.1, 491],
    "Breach": [48.5, 231],
    "Skye": [48.0, 325],
    "Sage": [47.1, 278],
    "Veto": [46.3, 188],
    "KAY/O": [42.5, 106],
    "Viper": [51.3, 191],
    "Astra": [45.1, 102],
  },
  Ascent: {
    "Clove": [53.4, 5049],
    "Cypher": [51.4, 1686],
    "Sova": [51.1, 5911],
    "Neon": [50.5, 861],
    "Killjoy": [50.5, 2253],
    "Phoenix": [50.3, 3212],
    "Yoru": [50.0, 388],
    "Jett": [49.7, 6722],
    "Omen": [48.1, 1666],
    "Chamber": [47.8, 1885],
    "Vyse": [47.8, 473],
    "Waylay": [47.0, 625],
    "Reyna": [46.9, 2437],
    "Sage": [57.4, 216],
    "Iso": [51.8, 193],
    "KAY/O": [50.8, 356],
    "Miks": [49.7, 179],
    "Raze": [49.2, 193],
    "Deadlock": [47.8, 159],
    "Skye": [33.9, 109],
  },
  Bind: {
    "Viper": [53.7, 694],
    "Clove": [53.2, 4871],
    "Fade": [53.0, 2112],
    "Skye": [52.6, 2628],
    "Phoenix": [52.3, 398],
    "Deadlock": [51.8, 616],
    "Raze": [51.6, 2671],
    "Neon": [51.5, 1294],
    "Chamber": [51.5, 3628],
    "Cypher": [51.2, 841],
    "Reyna": [51.1, 1937],
    "Waylay": [50.9, 1813],
    "Yoru": [50.9, 1984],
    "Brimstone": [50.2, 926],
    "Jett": [50.0, 2481],
    "Miks": [47.2, 307],
    "Tejo": [53.1, 260],
    "Sova": [50.0, 240],
    "Veto": [47.4, 209],
    "Iso": [46.6, 219],
    "Sage": [46.0, 163],
  },
  Breeze: {
    "Clove": [52.3, 3530],
    "Sova": [51.9, 8937],
    "Phoenix": [51.7, 619],
    "Jett": [51.5, 9962],
    "Harbor": [51.3, 939],
    "Chamber": [51.2, 8457],
    "Neon": [51.0, 2931],
    "Viper": [50.9, 5230],
    "Reyna": [50.3, 4580],
    "Yoru": [49.3, 2641],
    "Omen": [48.7, 550],
    "Waylay": [48.2, 695],
    "Iso": [48.2, 745],
    "Astra": [47.2, 2006],
    "Cypher": [54.9, 510],
    "Miks": [53.2, 361],
    "Skye": [52.3, 176],
    "Sage": [50.2, 251],
    "Veto": [48.7, 154],
    "Brimstone": [43.5, 108],
    "KAY/O": [39.4, 284],
  },
  Fracture: {
    "Phoenix": [56.6, 814],
    "Fade": [56.0, 464],
    "Raze": [52.4, 813],
    "Cypher": [51.6, 639],
    "Clove": [51.1, 1720],
    "Skye": [51.0, 206],
    "Neon": [50.9, 1218],
    "Tejo": [50.2, 1709],
    "Brimstone": [49.9, 1115],
    "Waylay": [49.2, 721],
    "Jett": [49.2, 2631],
    "Reyna": [49.0, 1388],
    "Chamber": [47.6, 2351],
    "Iso": [47.6, 269],
    "Killjoy": [46.6, 406],
    "Breach": [46.1, 1001],
    "Miks": [45.8, 651],
    "Vyse": [51.0, 143],
    "Sage": [47.7, 107],
  },
  Pearl: {
    "Clove": [53.2, 6525],
    "Sova": [52.7, 844],
    "Killjoy": [52.1, 1473],
    "Phoenix": [51.4, 2301],
    "Neon": [51.3, 2602],
    "Fade": [51.0, 6275],
    "Waylay": [50.8, 2075],
    "Chamber": [50.8, 5827],
    "Miks": [50.6, 502],
    "Jett": [50.5, 6009],
    "Yoru": [50.3, 2160],
    "Reyna": [50.1, 3050],
    "Vyse": [49.8, 660],
    "Astra": [49.4, 1687],
    "Iso": [47.5, 488],
    "Raze": [52.4, 191],
    "Tejo": [51.5, 406],
    "Cypher": [50.7, 339],
    "KAY/O": [49.7, 187],
    "Veto": [47.4, 213],
    "Skye": [47.3, 184],
    "Omen": [46.9, 177],
    "Sage": [43.1, 174],
    "Harbor": [38.9, 108],
  },
  Lotus: {
    "Waylay": [53.1, 1217],
    "Vyse": [52.5, 1610],
    "Clove": [52.1, 5625],
    "Phoenix": [51.5, 955],
    "Fade": [51.3, 5639],
    "Killjoy": [50.9, 477],
    "Neon": [50.9, 2932],
    "Reyna": [50.3, 2578],
    "Iso": [50.3, 831],
    "Chamber": [50.2, 4680],
    "Jett": [49.3, 4650],
    "Raze": [48.9, 3483],
    "Yoru": [47.9, 403],
    "Miks": [46.7, 582],
    "Omen": [45.7, 1590],
    "Skye": [42.6, 418],
    "Cypher": [56.3, 382],
    "Deadlock": [55.1, 158],
    "Tejo": [52.1, 215],
    "Viper": [51.9, 324],
    "Veto": [50.3, 163],
    "Sage": [50.3, 179],
    "Sova": [48.6, 214],
    "Breach": [47.4, 369],
    "Gekko": [47.4, 135],
  },
  Split: {
    "Neon": [54.6, 2782],
    "Fade": [53.2, 3229],
    "Sage": [52.9, 2907],
    "Clove": [52.6, 10447],
    "Cypher": [51.6, 3311],
    "Skye": [51.4, 6440],
    "Raze": [51.4, 5534],
    "Viper": [50.6, 1489],
    "Phoenix": [50.4, 1301],
    "Yoru": [50.3, 1897],
    "Chamber": [50.1, 4727],
    "Jett": [49.2, 7316],
    "Waylay": [49.2, 2737],
    "Reyna": [48.9, 4535],
    "Omen": [48.7, 1935],
    "Killjoy": [54.2, 295],
    "KAY/O": [50.4, 113],
    "Sova": [50.3, 173],
    "Brimstone": [49.1, 112],
    "Deadlock": [48.8, 494],
    "Tejo": [47.7, 595],
    "Miks": [47.7, 566],
    "Veto": [47.2, 468],
    "Astra": [46.9, 260],
    "Vyse": [46.5, 443],
    "Breach": [46.0, 391],
    "Iso": [43.5, 526],
  },
  Sunset: {
    "Fade": [54.6, 377],
    "Clove": [53.0, 3233],
    "Cypher": [52.9, 1224],
    "Sova": [52.7, 2794],
    "Neon": [52.1, 1949],
    "Phoenix": [52.0, 1159],
    "Deadlock": [51.9, 210],
    "Vyse": [51.2, 406],
    "Iso": [50.9, 226],
    "Reyna": [50.2, 1452],
    "Yoru": [50.2, 327],
    "Jett": [49.3, 2159],
    "Raze": [48.4, 801],
    "Waylay": [48.3, 458],
    "Chamber": [48.2, 1747],
    "Omen": [46.6, 564],
    "Sage": [45.8, 201],
    "Gekko": [50.4, 135],
    "Skye": [49.5, 109],
    "Veto": [45.6, 158],
    "Breach": [43.8, 112],
  },
  Abyss: {
    "Clove": [54.8, 4974],
    "Vyse": [54.2, 661],
    "Iso": [53.7, 721],
    "Neon": [52.9, 1076],
    "Cypher": [52.8, 598],
    "Sova": [51.9, 5788],
    "Jett": [51.8, 5337],
    "Veto": [51.7, 536],
    "Chamber": [51.5, 4679],
    "Waylay": [51.2, 2646],
    "Reyna": [50.3, 2207],
    "Yoru": [48.8, 2291],
    "Astra": [46.4, 1158],
    "Omen": [45.0, 720],
    "Sage": [54.1, 133],
    "KAY/O": [52.7, 184],
    "Phoenix": [52.1, 286],
    "Tejo": [50.7, 217],
    "Deadlock": [48.5, 165],
    "Harbor": [47.6, 103],
  },
};

// Icebox n'a plus de statistiques (map sortie de la rotation compétitive) : on
// garde l'ancien avis communautaire d'août 2026 (patch 13.00), plus fragile.
const LEGACY_TIERS = {
  Icebox: { S: ['Viper', 'Jett', 'Sage'], A: ['Reyna', 'Sova', 'Gekko'] },
};
export const LEGACY_MAPS = Object.keys(LEGACY_TIERS);


// Agents d'une liste classés pour une map : les fiables d'abord par taux de
// victoire décroissant, puis ceux dont l'échantillon est trop petit.
export function rankAgentsOnMap(mapName, agentNames) {
  const stats = MAP_AGENT_STATS[mapName];
  if (!stats) return [];
  return agentNames
    .filter((name) => stats[name])
    .map((name) => ({ name, winrate: stats[name][0], matches: stats[name][1], reliable: stats[name][1] >= MIN_RELIABLE_MATCHES }))
    .sort((a, b) => Number(b.reliable) - Number(a.reliable) || (a.reliable ? b.winrate - a.winrate : b.matches - a.matches));
}

// --- Verdict d'efficacité d'un agent sur une map ------------------------------
// Sur un grand nombre de parties, un agent « neutre » tourne autour de 50 % de
// victoires : au-dessus il aide à gagner, en dessous il pénalise. Seuils posés à
// la main pour que la moyenne des agents reste « correcte » ; ils ne valent que
// pour des agents à l'échantillon fiable (voir MIN_RELIABLE_MATCHES).
export const VERDICT_THRESHOLDS = { great: 52.5, good: 51, ok: 49.5 };

/** 'great' | 'good' | 'ok' | 'bad' selon le taux de victoire (en %). */
export function verdictFor(winrate) {
  if (winrate >= VERDICT_THRESHOLDS.great) return 'great';
  if (winrate >= VERDICT_THRESHOLDS.good) return 'good';
  if (winrate >= VERDICT_THRESHOLDS.ok) return 'ok';
  return 'bad';
}

/**
 * Compo conseillée pour une map : le meilleur agent FIABLE de chaque rôle (en
 * écartant ceux jugés « à éviter »), plus un 5e agent au choix — le meilleur
 * des restants, tous rôles confondus. `roleOf(nom)` donne le rôle d'un agent.
 */
export function recommendComp(mapName, roleOf, roleOrder) {
  const stats = MAP_AGENT_STATS[mapName];
  if (!stats) return [];
  const ranked = rankAgentsOnMap(mapName, Object.keys(stats)).filter(
    (entry) => entry.reliable && verdictFor(entry.winrate) !== 'bad',
  );
  const picks = [];
  const used = new Set();
  roleOrder.forEach((role) => {
    const best = ranked.find((entry) => roleOf(entry.name) === role);
    if (!best) return;
    picks.push({ ...best, role, flex: false });
    used.add(best.name);
  });
  const flex = ranked.find((entry) => !used.has(entry.name));
  if (flex) picks.push({ ...flex, role: roleOf(flex.name), flex: true });
  return picks;
}
// Tiers de la compo (S = 3 meilleurs, A = 3 suivants) tirés des statistiques,
// parmi les agents fiables uniquement.
function deriveTiers(stats) {
  const reliable = Object.entries(stats)
    .filter(([, [, matches]]) => matches >= MIN_RELIABLE_MATCHES)
    .sort((a, b) => b[1][0] - a[1][0])
    .map(([name]) => name);
  return { S: reliable.slice(0, 3), A: reliable.slice(3, 6) };
}

export const MAP_AGENT_TIERS = {
  ...LEGACY_TIERS,
  ...Object.fromEntries(Object.entries(MAP_AGENT_STATS).map(([map, stats]) => [map, deriveTiers(stats)])),
};

// null = pas de donnée pour cette map (pas "neutre", vraiment "inconnu").
export function getAgentMapTier(agent, mapName) {
  const tiers = MAP_AGENT_TIERS[mapName];
  if (!tiers) return null;
  if (tiers.S.includes(agent)) return 'S';
  if (tiers.A.includes(agent)) return 'A';
  return 'B';
}

// --- Choix des équipes professionnelles par map ---------------------------------
// Part des parties où chaque agent a été joué par une équipe pro, VCT 2026
// Stage 2 (EMEA, Amériques, Pacifique, Chine), agrégée et pondérée par le nombre
// de parties de chaque ligue. Source : vlr.gg, relevé du 2026-10-15. Seuls les
// agents joués dans au moins 5 % des parties sont gardés. Le pool pro ne contient
// pas Bind, Pearl, Fracture, Corrode ni Icebox : aucune donnée pour elles.
//
// ATTENTION : des pros jouent en équipe coordonnée (téléportations, exécutions
// à 5), ce qui ne se transpose pas toujours à la solo queue. C'est un second
// avis sur la « bonne » méta d'une map, pas un classement de force.
export const PRO_PICKS_SOURCE = { name: 'vlr.gg (VCT 2026 Stage 2)', url: 'https://www.vlr.gg', date: '2026-10-15' };
export const MAP_PRO_PICKS = {
  Abyss: { maps: 18, picks: { "Sova": 100, "Waylay": 61, "Yoru": 56, "Omen": 50, "Astra": 50, "Harbor": 47, "Jett": 31, "Phoenix": 28, "Cypher": 19, "Neon": 17, "Vyse": 16, "Viper": 8, "Chamber": 8 } },
  Ascent: { maps: 87, picks: { "Sova": 100, "Omen": 97, "Cypher": 73, "Jett": 55, "Phoenix": 48, "Neon": 41, "KAY/O": 17, "Chamber": 16, "Yoru": 16, "Vyse": 9, "Deadlock": 6, "Waylay": 5, "Sage": 5 } },
  Breeze: { maps: 65, picks: { "Sova": 100, "Viper": 76, "Neon": 68, "Harbor": 66, "Jett": 43, "Phoenix": 40, "Cypher": 27, "KAY/O": 23, "Omen": 16, "Astra": 13, "Chamber": 7, "Yoru": 7, "Deadlock": 5 } },
  Haven: { maps: 85, picks: { "Omen": 88, "Neon": 85, "Sova": 84, "Cypher": 60, "Phoenix": 58, "Chamber": 27, "Waylay": 15, "Yoru": 15, "Jett": 14, "Astra": 13, "Skye": 9, "Vyse": 8, "Fade": 7, "Viper": 7, "Killjoy": 7 } },
  Lotus: { maps: 88, picks: { "Omen": 98, "Fade": 79, "Raze": 74, "Viper": 50, "Vyse": 48, "Neon": 38, "Cypher": 27, "Waylay": 21, "Chamber": 20, "Skye": 20, "Jett": 9, "Yoru": 6 } },
  Split: { maps: 88, picks: { "Omen": 88, "Viper": 88, "Neon": 60, "Fade": 55, "Skye": 46, "Raze": 45, "Phoenix": 24, "Waylay": 22, "Jett": 17, "Astra": 15, "Yoru": 11, "Sage": 9, "Vyse": 7, "Cypher": 5 } },
  Summit: { maps: 76, picks: { "Fade": 64, "Omen": 63, "Neon": 62, "Cypher": 49, "Waylay": 29, "Viper": 28, "Chamber": 25, "Phoenix": 23, "Sova": 22, "Astra": 22, "Raze": 21, "Yoru": 15, "Harbor": 15, "Sage": 14, "KAY/O": 9, "Skye": 9, "Jett": 7, "Tejo": 7, "Vyse": 6, "Brimstone": 5 } },
  Sunset: { maps: 103, picks: { "Omen": 99, "Neon": 84, "Cypher": 62, "Sova": 61, "Sage": 35, "Fade": 34, "Chamber": 32, "Phoenix": 26, "Waylay": 14, "Viper": 13, "Yoru": 13, "KAY/O": 12, "Raze": 6 } },
};

/** Part (%) des parties pro où l'agent a été joué sur cette map, 0 si absent des données. */
export function proPickRate(mapName, agent) {
  return MAP_PRO_PICKS[mapName]?.picks[agent] ?? 0;
}
