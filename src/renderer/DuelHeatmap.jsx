import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, RotateCw, TrendingDown, TrendingUp, X } from 'lucide-react';
import Icon from './Icon.jsx';
import { useMapImages, useMapMinimaps, useMapCoordinates } from './mapImages.js';
import { useAgentIcons } from './agentIcons.js';
import { useWeaponIcons } from './weaponIcons.js';
import { excludeDeathmatch, findMe, matchScore, resultLabel, resultLabelKey } from './valorantStats.js';
import { DUEL_GRID_SIZE, aggregateDuelZones, duelsOnMap, rankZones } from './duelHeatmap.js';
import PlatformFilterToggle from './PlatformFilterToggle.jsx';
import usePlatformFilter from './usePlatformFilter.js';
import CollapsibleCard from './CollapsibleCard.jsx';

const CANVAS_SIZE = 800;
const CELL = CANVAS_SIZE / DUEL_GRID_SIZE;

const SIDES = [
  { id: 'all', labelKey: 'heatmap.sides.all' },
  { id: 'attack', labelKey: 'heatmap.sides.attack' },
  { id: 'defense', labelKey: 'heatmap.sides.defense' },
];

// Rouge (0 % de duels gagnés) -> vert (100 %), en passant par le jaune.
const rateColor = (rate) => `hsl(${Math.round(rate * 120)}, 85%, 52%)`;

// Une colonne de classement (meilleures ou pires zones) : cliquer une ligne ouvre
// le détail de la zone, la survoler l'entoure sur la carte.
function ZoneRanking({ zones, tone, icon, title, emptyText, t, onOpen, onFocus }) {
  return (
    <section className="hd-rank" data-tone={tone}>
      <header>
        <Icon icon={icon} size={17} />
        <b>{title}</b>
      </header>
      {zones.length === 0 ? (
        <p>{emptyText}</p>
      ) : (
        <ul>
          {zones.map((zone, i) => (
            <li key={`${zone.col}:${zone.row}`}>
              <button
                type="button"
                onClick={() => onOpen({ col: zone.col, row: zone.row })}
                onMouseEnter={() => onFocus({ col: zone.col, row: zone.row })}
                onMouseLeave={() => onFocus(null)}
              >
                <span className="hd-rank-n">{i + 1}</span>
                <span className="hd-rank-score">
                  {zone.wins}-{zone.losses}
                </span>
                <span className="hd-rank-info">
                  <b>{Math.round(zone.rate * 100)} %</b>
                  <small>{t('heatmap.duel.total', { count: zone.total })}</small>
                </span>
                <Icon icon={ArrowRight} size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Fenêtre de détail d'une case : score et taux de réussite en grand, quelques
// repères (distance moyenne, arme favorite) puis chaque duel — adversaire (agent
// + pseudo), arme, distance approximative (1 unité = 1 cm, voir killDistance),
// round, camp et date de la partie.
function ZoneDuelsModal({ zone, onClose, t, locale }) {
  const agentIcons = useAgentIcons();
  const weaponIcons = useWeaponIcons();

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const duels = useMemo(
    () => [...zone.duels].sort((a, b) => (b.gameStart ?? 0) - (a.gameStart ?? 0) || a.roundIndex - b.roundIndex),
    [zone],
  );
  const rate = Math.round(zone.rate * 100);
  const distances = zone.duels.map((d) => d.distance).filter((d) => d !== null);
  const avgDistance = distances.length ? Math.round(distances.reduce((sum, d) => sum + d, 0) / distances.length) : null;
  const favoriteWeapon = useMemo(() => {
    const counts = new Map();
    zone.duels.forEach((d) => d.weapon && counts.set(d.weapon, (counts.get(d.weapon) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [zone]);
  const favoriteIcon = favoriteWeapon ? weaponIcons.get(favoriteWeapon) : null;

  return createPortal(
    <div className="hd-modal" role="dialog" aria-modal="true" aria-label={t('heatmap.duel.zoneTitle')} onClick={onClose}>
      <div className="hd-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="hd-close" onClick={onClose} aria-label={t('heatmap.duel.close')}>
          <Icon icon={X} size={18} />
        </button>

        <header className="hd-head">
          <span className="hd-eyebrow">{t('heatmap.duel.zoneTitle')}</span>
          <div className="hd-score">
            <b data-tone="win">{zone.wins}</b>
            <span>-</span>
            <b data-tone="loss">{zone.losses}</b>
          </div>
          <div className="hd-bar" aria-hidden="true">
            <span style={{ width: `${rate}%` }} />
          </div>
          <div className="hd-stats">
            <div>
              <b>{rate} %</b>
              <small>{t('heatmap.duel.tileRate')}</small>
            </div>
            <div>
              <b>{avgDistance === null ? '?' : `~${avgDistance} m`}</b>
              <small>{t('heatmap.duel.avgDistance')}</small>
            </div>
            <div>
              {favoriteIcon ? <img src={favoriteIcon} alt={favoriteWeapon} title={favoriteWeapon} /> : <b>{favoriteWeapon ?? '?'}</b>}
              <small>{t('heatmap.duel.favWeapon')}</small>
            </div>
          </div>
          {!zone.reliable && <p className="hd-warn">{t('heatmap.duel.fewDuels')}</p>}
        </header>

        <ul className="hd-list">
          {duels.map((duel, i) => {
            const [enemyName, enemyTag] = (duel.enemyName ?? '').split('#');
            const agentIcon = duel.enemyAgent ? agentIcons.get(duel.enemyAgent) : null;
            const weaponIcon = duel.weapon ? weaponIcons.get(duel.weapon) : null;
            const date = duel.gameStart ? new Date(duel.gameStart * 1000).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' }) : null;
            return (
              <li key={`${duel.matchId}-${duel.roundIndex}-${i}`} data-won={duel.won ? 'true' : 'false'}>
                <span className="hd-result">{duel.won ? t('heatmap.duel.won') : t('heatmap.duel.lost')}</span>
                <span className="hd-enemy">
                  <span className="hd-agent">{agentIcon && <img src={agentIcon} alt={duel.enemyAgent} title={duel.enemyAgent} />}</span>
                  <span className="hd-who">
                    <b>{enemyName || t('heatmap.duel.unknownEnemy')}</b>
                    <small>{[enemyTag && `#${enemyTag}`, duel.enemyAgent].filter(Boolean).join(' · ')}</small>
                  </span>
                </span>
                <span className="hd-weapon">
                  {weaponIcon ? <img src={weaponIcon} alt={duel.weapon} title={duel.weapon} /> : <small>{duel.weapon ?? '?'}</small>}
                </span>
                <span className="hd-cell">
                  <b>{duel.distance === null ? '?' : `~${Math.round(duel.distance)} m`}</b>
                  <small>{t('heatmap.duel.distance')}</small>
                </span>
                <span className="hd-cell">
                  <b>{t('heatmap.duel.round', { number: duel.roundIndex + 1 })}</b>
                  <small>{[duel.side && t(`heatmap.sides.${duel.side}`), date].filter(Boolean).join(' · ')}</small>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}

// Heatmap des duels : où je gagne et où je perds mes duels, sur toutes les
// parties d'une map ou sur une seule partie choisie. Logique dans duelHeatmap.js.
function DuelHeatmap({ settings, matches }) {
  const { t, i18n } = useTranslation();
  const { platforms, platform, setPlatform, filteredMatches } = usePlatformFilter(matches);
  const minimaps = useMapMinimaps();
  const mapCoordinates = useMapCoordinates();
  const [selectedMap, setSelectedMap] = useState('');
  const [matchId, setMatchId] = useState(''); // '' = toutes les parties
  const [side, setSide] = useState('all');
  const [rotation, setRotation] = useState(0);
  const [hover, setHover] = useState(null);
  const [selected, setSelected] = useState(null); // { col, row } de la case cliquée
  const [focus, setFocus] = useState(null); // case entourée au survol d'un classement
  const canvasRef = useRef(null);

  const mapImages = useMapImages();

  // Seulement les maps réellement jouées, la plus jouée d'abord.
  const playedCounts = useMemo(() => {
    const counts = new Map();
    excludeDeathmatch(filteredMatches ?? []).forEach((m) => {
      const name = m.metadata?.map;
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    return counts;
  }, [filteredMatches]);

  const mapNames = useMemo(
    () => [...playedCounts.keys()].filter((name) => minimaps.has(name)).sort((a, b) => playedCounts.get(b) - playedCounts.get(a) || a.localeCompare(b)),
    [playedCounts, minimaps],
  );

  useEffect(() => {
    if (mapNames.length > 0 && !mapNames.includes(selectedMap)) setSelectedMap(mapNames[0]);
  }, [mapNames, selectedMap]);

  useEffect(() => {
    setMatchId('');
  }, [selectedMap, platform]);

  useEffect(() => {
    setSelected(null);
  }, [selectedMap, matchId, side, platform]);

  // Les parties jouées sur la map choisie, la plus récente d'abord.
  const mapMatches = useMemo(
    () =>
      excludeDeathmatch(filteredMatches)
        .filter((m) => m.metadata?.map === selectedMap)
        .sort((a, b) => (b.metadata?.game_start ?? 0) - (a.metadata?.game_start ?? 0)),
    [filteredMatches, selectedMap],
  );

  const matchLabel = useCallback(
    (match) => {
      const me = findMe(match, settings.name, settings.tag);
      const label = resultLabel(match, me);
      const result = resultLabelKey(label) ? t(resultLabelKey(label)) : label;
      const start = match.metadata?.game_start;
      const date = start
        ? new Date(start * 1000).toLocaleString(i18n.language, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
        : '?';
      return [date, me?.character, result, matchScore(match, me)].filter(Boolean).join(' · ');
    },
    [settings.name, settings.tag, t, i18n.language],
  );

  const duels = useMemo(() => {
    if (!selectedMap) return [];
    const source = matchId ? mapMatches.filter((m) => m.metadata?.matchid === matchId) : mapMatches;
    const all = duelsOnMap(source, settings.name, settings.tag, selectedMap);
    return side === 'all' ? all : all.filter((d) => d.side === side);
  }, [selectedMap, matchId, mapMatches, settings.name, settings.tag, side]);

  const coords = mapCoordinates.get(selectedMap);
  const summary = useMemo(() => (coords ? aggregateDuelZones(duels, coords) : null), [duels, coords]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const imageUrl = minimaps.get(selectedMap);
    if (!canvas || !imageUrl || !summary) return undefined;

    let cancelled = false;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      canvas.width = CANVAS_SIZE;
      canvas.height = CANVAS_SIZE;
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

      // Rotation appliquée au repère avant de dessiner : carte et zones tournent ensemble.
      ctx.save();
      ctx.translate(CANVAS_SIZE / 2, CANVAS_SIZE / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-CANVAS_SIZE / 2, -CANVAS_SIZE / 2);
      ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
      // Minimap assombrie : les couleurs des zones ressortent bien plus.
      ctx.fillStyle = 'rgba(8, 10, 14, 0.55)';
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

      const maxTotal = Math.max(1, ...summary.zones.map((z) => z.total));
      summary.zones.forEach((zone) => {
        const x = zone.col * CELL;
        const y = zone.row * CELL;
        // Plus il y a de duels, plus la zone est marquée ; une zone peu fournie
        // reste pâle pour ne pas passer pour une tendance.
        const weight = zone.reliable ? 0.5 + 0.4 * (zone.total / maxTotal) : 0.24;
        ctx.globalAlpha = weight;
        ctx.fillStyle = rateColor(zone.rate);
        ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
        ctx.globalAlpha = 1;
        if (zone.reliable) {
          ctx.strokeStyle = 'rgba(255,255,255,0.55)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
        }
        ctx.font = 'bold 17px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.fillStyle = '#fff';
        const text = `${zone.wins}-${zone.losses}`;
        ctx.strokeText(text, x + CELL / 2, y + CELL / 2);
        ctx.fillText(text, x + CELL / 2, y + CELL / 2);
      });
      if (selected) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.strokeRect(selected.col * CELL + 2, selected.row * CELL + 2, CELL - 4, CELL - 4);
      }
      if (focus) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.setLineDash([7, 5]);
        ctx.strokeRect(focus.col * CELL + 2, focus.row * CELL + 2, CELL - 4, CELL - 4);
        ctx.setLineDash([]);
      }
      ctx.restore();
    };
    img.src = imageUrl;

    return () => {
      cancelled = true;
    };
  }, [selectedMap, minimaps, summary, rotation, selected, focus]);

  // Souris -> zone : on annule la rotation du canvas pour retrouver la case.
  const cellAt = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const scale = CANVAS_SIZE / rect.width;
    const dx = (event.clientX - rect.left) * scale - CANVAS_SIZE / 2;
    const dy = (event.clientY - rect.top) * scale - CANVAS_SIZE / 2;
    const angle = (-rotation * Math.PI) / 180;
    const ux = dx * Math.cos(angle) - dy * Math.sin(angle) + CANVAS_SIZE / 2;
    const uy = dx * Math.sin(angle) + dy * Math.cos(angle) + CANVAS_SIZE / 2;
    return { col: Math.floor(ux / CELL), row: Math.floor(uy / CELL) };
  };

  const onMove = (event) => {
    if (!summary) return;
    const { col, row } = cellAt(event);
    const zone = summary.zones.find((z) => z.col === col && z.row === row);
    setHover(zone ? { zone, x: event.clientX, y: event.clientY } : null);
  };

  const onClick = (event) => {
    if (!summary) return;
    const { col, row } = cellAt(event);
    const zone = summary.zones.find((z) => z.col === col && z.row === row);
    setSelected(zone ? { col, row } : null);
  };

  const ranking = useMemo(() => (summary ? rankZones(summary.zones) : { best: [], worst: [] }), [summary]);

  const selectedZone = selected && summary ? summary.zones.find((z) => z.col === selected.col && z.row === selected.row) : null;

  const percent = (rate) => `${Math.round(rate * 100)} %`;

  return (
    <div>
      <PlatformFilterToggle platforms={platforms} platform={platform} onChange={setPlatform} />

      <CollapsibleCard id="heatmap-duels" title={t('heatmap.duel.title')} className="gs-card">
        <p className="label">{t('heatmap.duel.description')}</p>

        {mapNames.length === 0 ? (
          <p className="label">{t('heatmap.duel.noGames')}</p>
        ) : (
          <div className="hd-maps">
            {mapNames.map((name) => (
              <button
                key={name}
                type="button"
                className="hd-map"
                data-active={name === selectedMap ? 'true' : 'false'}
                style={mapImages.get(name) ? { backgroundImage: `url(${mapImages.get(name)})` } : undefined}
                onClick={() => setSelectedMap(name)}
              >
                <span className="hd-map-name">{name}</span>
                <span className="hd-map-count">{t('heatmap.duel.mapGames', { count: playedCounts.get(name) })}</span>
              </button>
            ))}
          </div>
        )}

        <div className="filter-bar">
          <select value={matchId} onChange={(e) => setMatchId(e.target.value)} disabled={mapMatches.length === 0}>
            <option value="">{t('heatmap.duel.allGames', { count: mapMatches.length })}</option>
            {mapMatches.map((match) => (
              <option key={match.metadata?.matchid} value={match.metadata?.matchid}>{matchLabel(match)}</option>
            ))}
          </select>
          {SIDES.map((s) => (
            <button key={s.id} className={s.id === side ? 'strategy-tool active' : 'strategy-tool'} onClick={() => setSide(s.id)}>
              {t(s.labelKey)}
            </button>
          ))}
          <button className="strategy-tool" onClick={() => setRotation((r) => (r + 90) % 360)} title={t('heatmap.rotate')}>
            <Icon icon={RotateCw} size={16} /> {t('heatmap.rotate')}
          </button>
        </div>

        {summary && summary.total > 0 ? (
          <div className="hd-tiles">
            <div>
              <b>{summary.total}</b>
              <small>{t('heatmap.duel.tileDuels')}</small>
            </div>
            <div data-tone="win">
              <b>{summary.wins}</b>
              <small>{t('heatmap.duel.tileWins')}</small>
            </div>
            <div data-tone="loss">
              <b>{summary.losses}</b>
              <small>{t('heatmap.duel.tileLosses')}</small>
            </div>
            <div>
              <b>{percent(summary.rate)}</b>
              <small>{t('heatmap.duel.tileRate')}</small>
            </div>
            <div className="hd-legend">
              <div className="heatmap-legend">
                <span>0 %</span>
                <span className="heatmap-legend-bar duels" />
                <span>100 %</span>
              </div>
              <small>{t('heatmap.duel.legendHint')}</small>
            </div>
          </div>
        ) : (
          <p className="label">{t('heatmap.duel.noData')}</p>
        )}

        <div className="hd-stage">
        <ZoneRanking
          zones={ranking.best}
          tone="win"
          icon={TrendingUp}
          title={t('heatmap.duel.bestZones')}
          emptyText={t('heatmap.duel.rankEmpty')}
          t={t}
          onOpen={setSelected}
          onFocus={setFocus}
        />
        <div className="heatmap-canvas-wrap" style={{ position: 'relative' }}>
          <canvas className="hd-canvas" ref={canvasRef} onMouseMove={onMove} onMouseLeave={() => setHover(null)} onClick={onClick} style={{ cursor: hover ? 'pointer' : 'default' }} />
          {hover &&
            // Hors du cadre de la carte (qui découpe ses bords) et positionnée
            // par rapport à la fenêtre : elle passe de l'autre côté du curseur
            // près d'un bord au lieu d'être coupée ou écrasée.
            createPortal(
              <div
                className="heatmap-tooltip"
                style={{
                  position: 'fixed',
                  left: hover.x > window.innerWidth - 280 ? hover.x - 16 : hover.x + 16,
                  top: hover.y > window.innerHeight - 170 ? hover.y - 16 : hover.y + 16,
                  transform: `translate(${hover.x > window.innerWidth - 280 ? '-100%' : '0'}, ${hover.y > window.innerHeight - 170 ? '-100%' : '0'})`,
                  zIndex: 300,
                  width: 'max-content',
                }}
              >
                <b>{t('heatmap.duel.zoneDuels', { count: hover.zone.total })}</b>
                <span>{t('heatmap.duel.zoneScore', { wins: hover.zone.wins, losses: hover.zone.losses, percent: percent(hover.zone.rate) })}</span>
                {!hover.zone.reliable && <small>{t('heatmap.duel.fewDuels')}</small>}
              </div>,
              document.body,
            )}
        </div>
        <ZoneRanking
          zones={ranking.worst}
          tone="loss"
          icon={TrendingDown}
          title={t('heatmap.duel.worstZones')}
          emptyText={t('heatmap.duel.rankEmpty')}
          t={t}
          onOpen={setSelected}
          onFocus={setFocus}
        />
        </div>
        <p className="label hd-hint">{t('heatmap.duel.hint')}</p>
        {selectedZone && <ZoneDuelsModal zone={selectedZone} onClose={() => setSelected(null)} t={t} locale={i18n.language} />}
      </CollapsibleCard>
    </div>
  );
}

export default DuelHeatmap;
