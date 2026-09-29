import { attackerTeamByRound, excludeDeathmatch, findMe, killDistance, normalizeRiotIdPart } from './valorantStats.js';

// Heatmap des duels : chaque kill du joueur suivi est un duel GAGNÉ, chaque mort
// causée par un adversaire est un duel PERDU. Seuls les duels tranchés par un
// kill existent dans les données (Riot n'expose pas les échanges de tirs sans
// mort). Le duel est placé au milieu entre le tueur et la victime (position du
// tueur conservée dans player_locations_on_kill, voir matchesReaderWorker.cjs),
// ou au point de mort de la victime à défaut.

export const DUEL_GRID_SIZE = 14;
// En dessous, une zone est trop peu fournie pour que son taux de réussite dise
// quoi que ce soit : elle reste affichée, mais atténuée et signalée.
export const MIN_RELIABLE_DUELS = 3;

export function duelsOnMap(matches, name, tag, mapName) {
  const fullName = normalizeRiotIdPart(`${name}#${tag}`);
  const duels = [];

  excludeDeathmatch(matches)
    .filter((match) => match.metadata?.map === mapName)
    .forEach((match) => {
      const me = findMe(match, name, tag);
      if (!me?.team) return;
      const attackerByRound = attackerTeamByRound(match);
      const matchId = match.metadata?.matchid ?? null;
      const gameStart = match.metadata?.game_start ?? null;
      const players = match.players?.all_players ?? [];

      (match.rounds || []).forEach((round, roundIndex) => {
        const attackerTeam = attackerByRound[roundIndex];
        const side = attackerTeam === null ? null : attackerTeam === me.team ? 'attack' : 'defense';

        (round.player_stats || []).forEach((ps) => {
          (ps.kill_events || []).forEach((k) => {
            // Mort par l'explosion du spike ou chute : pas un duel.
            if (k.killer_puuid === k.victim_puuid || !k.victim_death_location) return;
            const won = normalizeRiotIdPart(k.killer_display_name) === fullName;
            const lost = normalizeRiotIdPart(k.victim_display_name) === fullName;
            if (!won && !lost) return;

            const victim = k.victim_death_location;
            const killer = k.player_locations_on_kill?.find((p) => p.player_puuid === k.killer_puuid)?.location;
            const at = killer ? { x: (victim.x + killer.x) / 2, y: (victim.y + killer.y) / 2 } : victim;
            // L'adversaire : la victime si j'ai gagné, le tueur si j'ai perdu.
            const enemyPuuid = won ? k.victim_puuid : k.killer_puuid;
            duels.push({
              x: at.x,
              y: at.y,
              won,
              side,
              roundIndex,
              matchId,
              gameStart,
              enemyName: won ? k.victim_display_name : k.killer_display_name,
              enemyAgent: players.find((p) => p.puuid === enemyPuuid)?.character ?? null,
              weapon: k.damage_weapon_name ?? null,
              distance: killDistance(k),
            });
          });
        });
      });
    });

  return duels;
}

// Position monde -> fraction (0..1) de la minimap, même formule que la heatmap
// classique (Heatmap.jsx) : les coordonnées x/y du jeu sont inversées par rapport
// à l'image.
export function worldToMap(point, coords) {
  return {
    fx: coords.xMultiplier * point.y + coords.xScalarToAdd,
    fy: coords.yMultiplier * point.x + coords.yScalarToAdd,
  };
}

// Regroupe les duels par zone (grille carrée sur la minimap). Renvoie les zones
// non vides avec leurs victoires, défaites et taux de réussite, plus le total.
export function aggregateDuelZones(duels, coords, gridSize = DUEL_GRID_SIZE) {
  const cells = new Map();
  let wins = 0;
  let losses = 0;

  duels.forEach((duel) => {
    const { fx, fy } = worldToMap(duel, coords);
    // Hors de la minimap (coordonnées aberrantes) : ignoré plutôt que ramené au bord.
    if (fx < 0 || fx >= 1 || fy < 0 || fy >= 1) return;
    const col = Math.floor(fx * gridSize);
    const row = Math.floor(fy * gridSize);
    const key = `${col}:${row}`;
    const cell = cells.get(key) ?? { col, row, wins: 0, losses: 0, duels: [] };
    cell.duels.push(duel);
    if (duel.won) {
      cell.wins += 1;
      wins += 1;
    } else {
      cell.losses += 1;
      losses += 1;
    }
    cells.set(key, cell);
  });

  const zones = [...cells.values()].map((cell) => {
    const total = cell.wins + cell.losses;
    return { ...cell, total, rate: cell.wins / total, reliable: total >= MIN_RELIABLE_DUELS };
  });
  return { zones, wins, losses, total: wins + losses, rate: wins + losses > 0 ? wins / (wins + losses) : null };
}

// Meilleures et pires zones : seulement celles assez fournies pour que le taux
// veuille dire quelque chose (voir MIN_RELIABLE_DUELS), et jamais une zone à
// exactement 50 % dans l'un ou l'autre classement — les deux listes ne se
// chevauchent donc jamais.
export function rankZones(zones, limit = 3) {
  const reliable = zones.filter((zone) => zone.reliable);
  const best = reliable
    .filter((zone) => zone.rate > 0.5)
    .sort((a, b) => b.rate - a.rate || b.total - a.total)
    .slice(0, limit);
  const worst = reliable
    .filter((zone) => zone.rate < 0.5)
    .sort((a, b) => a.rate - b.rate || b.total - a.total)
    .slice(0, limit);
  return { best, worst };
}
