import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, ExternalLink, Film, Play, Search, ShieldAlert, Swords, X } from 'lucide-react';
import Icon from './Icon.jsx';
import appIcon from '../assets/app-icon.png';
import logoText from '../assets/logo-text.png';
import { supabase } from './supabaseClient.js';
import { useAgentIcons, useAgentPortraits, useAgentRoles } from './agentIcons.js';
import { useMapImages } from './mapImages.js';
import {
  MAP_AGENT_STATS,
  MAP_AGENT_TIERS,
  MAP_PRO_PICKS,
  MAP_STATS_SOURCE,
  PRO_PICKS_SOURCE,
  proPickRate,
  rankAgentsOnMap,
  recommendComp,
  verdictFor,
} from './mapAgentTiers.js';
import { formatDuration, formatViews, searchLineups, shortEmbedUrl, shortWatchUrl } from './lineupSearch.js';

// =============================================================================
// BOÎTE À OUTILS EN JEU — fenêtre de référence ouverte par un raccourci global
// (voir createToolkitWindow dans main.js). Deux parcours :
//   1. « Agent par map » : on choisit la map et on voit tout de suite quels
//      agents y sont VRAIMENT efficaces (taux de victoire réels, voir
//      mapAgentTiers.js), ceux à éviter, et une compo conseillée. Des onglets
//      filtrent par rôle ;
//   2. « Lineups »       : on choisit l'agent et les lineups COURTES (YouTube
//      Shorts, 40 s max) sortent aussitôt ; la map, le côté et le site affinent.
//      La recherche passe par l'Edge Function lineup-search (voir lineupSearch.js)
//      et la vidéo se lit dans la fenêtre. Ce n'est PAS la bibliothèque de
//      lineups de la communauté MVP Tracker (agent_techs), laissée à l'onglet Lineups.
// Elle ne lit rien du jeu : l'utilisateur choisit tout lui-même.
// =============================================================================

// Ordre d'affichage des rôles (noms en français, comme renvoyés par l'API).
const ROLE_ORDER = ['Duelliste', 'Initiateur', 'Contrôleur', 'Sentinelle'];

// Filtres de la recherche de lineups : le côté et le site s'ajoutent à la requête
// envoyée à YouTube (et font remonter les vidéos qui les citent).
const SIDES = [
  { key: 'attack', labelKey: 'toolkit.filterAttack' },
  { key: 'defense', labelKey: 'toolkit.filterDefense' },
];
// Haven et Lotus ont trois sites, les autres maps deux.
const THREE_SITE_MAPS = ['Haven', 'Lotus'];
const sitesOf = (map) => (THREE_SITE_MAPS.includes(map) ? ['A', 'B', 'C'] : ['A', 'B']);

const normalize = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function GameToolkit() {
  const { t, i18n } = useTranslation();
  const agentIcons = useAgentIcons();
  const agentPortraits = useAgentPortraits();
  const agentRoles = useAgentRoles();
  const mapImages = useMapImages();

  const [mode, setMode] = useState(null); // null (accueil) | 'agent' | 'lineup'
  const [map, setMap] = useState(null);
  const [role, setRole] = useState(null); // onglet de rôle du parcours « agent » (null = tous)
  const [agent, setAgent] = useState(null);
  const [query, setQuery] = useState('');
  const [side, setSide] = useState(null); // 'attack' | 'defense' | null
  const [site, setSite] = useState(null); // 'A' | 'B' | 'C' | null (seulement si une map est choisie)
  const [search, setSearch] = useState({ status: 'idle', results: [], stale: false });
  const [selected, setSelected] = useState(null); // vidéo ouverte dans le lecteur
  const [searchTick, setSearchTick] = useState(0); // incrémenté par « Réessayer »
  const [hotkey, setHotkey] = useState('');
  const bodyRef = useRef(null);

  useEffect(() => {
    window.electronAPI?.getGameToolkit?.().then((info) => setHotkey(info?.hotkey ?? ''));
  }, []);

  const maps = useMemo(() => [...mapImages.keys()].sort((a, b) => a.localeCompare(b)), [mapImages]);

  // Rôles et agents, dans l'ordre habituel (duelliste, initiateur, contrôleur, sentinelle).
  const roles = useMemo(() => {
    const byRole = new Map();
    agentRoles.forEach(({ roleName, roleIcon }, agentName) => {
      if (!roleName) return;
      if (!byRole.has(roleName)) byRole.set(roleName, { name: roleName, icon: roleIcon, agents: [] });
      byRole.get(roleName).agents.push(agentName);
    });
    byRole.forEach((entry) => entry.agents.sort((a, b) => a.localeCompare(b)));
    const rank = (name) => (ROLE_ORDER.includes(name) ? ROLE_ORDER.indexOf(name) : 99);
    return [...byRole.values()].sort((a, b) => rank(a.name) - rank(b.name));
  }, [agentRoles]);

  const roleOf = (name) => agentRoles.get(name)?.roleName ?? null;

  // Recherche de lineups courtes : relancée à chaque changement d'agent, de map,
  // de côté ou de site. Les réponses d'une recherche périmée sont ignorées
  // (`cancelled`), pour qu'un clic rapide ne remette pas d'anciens résultats.
  useEffect(() => {
    if (mode !== 'lineup' || !agent) return undefined;
    let cancelled = false;
    setSearch({ status: 'loading', results: [], stale: false });
    searchLineups(supabase, { agent, map: map ?? '', side, site: map ? site : null }).then((outcome) => {
      if (!cancelled) setSearch(outcome);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, agent, map, side, site, searchTick]);

  // Retour en haut à chaque changement d'étape.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [mode, map, role, agent, selected]);

  function reset() {
    setMode(null);
    setMap(null);
    setRole(null);
    setAgent(null);
    setQuery('');
    setSide(null);
    setSite(null);
    setSelected(null);
    setSearch({ status: 'idle', results: [], stale: false });
  }

  // Retour d'un cran : on défait la dernière sélection faite.
  function goBack() {
    if (selected) return setSelected(null);
    if (mode === 'agent' && map) {
      setRole(null);
      return setMap(null);
    }
    if (mode === 'lineup' && agent) {
      // De la liste de résultats, on revient au choix de l'agent (filtres remis à zéro).
      setQuery('');
      setMap(null);
      setSide(null);
      setSite(null);
      setSearch({ status: 'idle', results: [], stale: false });
      return setAgent(null);
    }
    return reset();
  }

  // Retour arrière / flèche gauche, sauf pendant une saisie.
  useEffect(() => {
    const onKey = (event) => {
      if (event.target?.tagName === 'INPUT') return;
      if ((event.key === 'Backspace' || event.key === 'ArrowLeft') && mode) {
        event.preventDefault();
        goBack();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const crumbs = [
    mode === 'agent' ? t('toolkit.homeAgentTitle') : mode === 'lineup' ? t('toolkit.homeLineupTitle') : null,
    mode === 'lineup' ? agent : null,
    map,
    mode === 'agent' && role ? role : null,
  ].filter(Boolean);

  const title = (() => {
    if (!mode) return t('toolkit.title');
    if (selected) return selected.title;
    if (mode === 'agent') return map ? t('toolkit.mapTitle', { map }) : t('toolkit.pickMap');
    return agent ? t('toolkit.lineupsOf', { agent }) : t('toolkit.pickAgent');
  })();

  // --- Briques d'affichage ----------------------------------------------------

  function renderMapGrid() {
    return (
      <div className="toolkit-map-grid">
        {maps.map((name) => (
          <button
            key={name}
            type="button"
            className="toolkit-map-card"
            style={{ backgroundImage: `url(${mapImages.get(name)})` }}
            onClick={() => setMap(name)}
          >
            <span className="toolkit-map-name">{name}</span>
            {!MAP_AGENT_STATS[name] && <span className="toolkit-map-count">{t('toolkit.oldData')}</span>}
          </button>
        ))}
      </div>
    );
  }

  const verdictLabel = (verdict) => t(`toolkit.verdict.${verdict}`);
  const rateText = (entry) => `${entry.winrate.toFixed(1)} %`;
  const gamesText = (entry) => t('toolkit.games', { count: entry.matches, formatted: entry.matches.toLocaleString(i18n.language) });

  // Carte d'un agent recommandé : portrait, taux de victoire et jauge.
  function renderPick(entry, index) {
    const verdict = verdictFor(entry.winrate);
    const portrait = agentPortraits.get(entry.name);
    const pro = proPickRate(map, entry.name);
    return (
      <div key={entry.name} className={`toolkit-pick toolkit-pick-${verdict}`}>
        {portrait && <img className="toolkit-pick-portrait" src={portrait} alt="" />}
        <span className="toolkit-pick-rank">#{index + 1}</span>
        <div className="toolkit-pick-info">
          <span className="toolkit-pick-name">{entry.name}</span>
          <span className="toolkit-pick-role">
            {agentRoles.get(entry.name)?.roleIcon && <img src={agentRoles.get(entry.name).roleIcon} alt="" />}
            {roleOf(entry.name)}
          </span>
          <span className="toolkit-pick-badges">
            <span className={`toolkit-badge toolkit-badge-${verdict}`}>{verdictLabel(verdict)}</span>
            {pro >= 20 && <span className="toolkit-pro">{t('toolkit.proBadge', { rate: pro })}</span>}
            {pro >= 25 && <span className="toolkit-sure">{t('toolkit.sure')}</span>}
          </span>
          <strong className="toolkit-pick-rate">{rateText(entry)}</strong>
          <span className="toolkit-pick-games">{gamesText(entry)}</span>
          <span className="toolkit-meter">
            <span style={{ width: `${Math.min(100, Math.max(0, ((entry.winrate - 40) / 20) * 100))}%` }} />
          </span>
        </div>
      </div>
    );
  }

  // Ligne compacte pour les agents moins intéressants.
  function renderRow(entry, muted) {
    const verdict = verdictFor(entry.winrate);
    const pro = proPickRate(map, entry.name);
    return (
      <div key={entry.name} className={`toolkit-row${muted ? ' toolkit-row-muted' : ''}`}>
        {agentIcons.get(entry.name) && <img src={agentIcons.get(entry.name)} alt="" />}
        <span className="toolkit-row-name">{entry.name}</span>
        {pro >= 20 && <span className="toolkit-pro">{t('toolkit.proBadge', { rate: pro })}</span>}
        {!muted && <span className={`toolkit-badge toolkit-badge-${verdict}`}>{verdictLabel(verdict)}</span>}
        <span className="toolkit-row-rate">{rateText(entry)}</span>
        <span className="toolkit-row-games">{gamesText(entry)}</span>
      </div>
    );
  }

  function renderComp() {
    const comp = recommendComp(map, roleOf, ROLE_ORDER);
    if (comp.length === 0) return null;
    return (
      <section className="toolkit-section">
        <h3 className="toolkit-section-title">{t('toolkit.compTitle')}</h3>
        <div className="toolkit-comp">
          {comp.map((entry) => (
            <div key={entry.name} className="toolkit-comp-slot">
              {agentIcons.get(entry.name) && <img src={agentIcons.get(entry.name)} alt="" />}
              <span className="toolkit-comp-name">{entry.name}</span>
              <span className="toolkit-comp-role">{entry.flex ? t('toolkit.compFlex') : entry.role}</span>
              <span className="toolkit-comp-rate">{rateText(entry)}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  // Ce que jouent les équipes pro sur la map, avec le verdict ranked à côté :
  // un second avis, pas un classement (voir la note affichée).
  function renderProSection(names) {
    const pro = MAP_PRO_PICKS[map];
    if (!pro) {
      return (
        <section className="toolkit-section">
          <h3 className="toolkit-section-title">{t('toolkit.proTitle')}</h3>
          <p className="toolkit-note">{t('toolkit.proNoData', { map })}</p>
        </section>
      );
    }
    const list = Object.entries(pro.picks)
      .filter(([name]) => names.includes(name))
      .slice(0, 5);
    if (list.length === 0) return null;
    const stats = MAP_AGENT_STATS[map] ?? {};
    return (
      <section className="toolkit-section">
        <h3 className="toolkit-section-title">{t('toolkit.proTitle')}</h3>
        <div className="toolkit-rows">
          {list.map(([name, share]) => {
            const entry = stats[name];
            const reliable = entry && entry[1] >= 300;
            const verdict = reliable ? verdictFor(entry[0]) : null;
            return (
              <div key={name} className="toolkit-row">
                {agentIcons.get(name) && <img src={agentIcons.get(name)} alt="" />}
                <span className="toolkit-row-name">{name}</span>
                <span className="toolkit-share">
                  <span style={{ width: `${share}%` }} />
                </span>
                <span className="toolkit-row-rate">{share} %</span>
                {verdict && (
                  <span className={`toolkit-badge toolkit-badge-${verdict}`}>
                    {t('toolkit.rankedPrefix')} · {verdictLabel(verdict)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <p className="toolkit-source">
          {t('toolkit.proNote', { count: pro.maps, source: PRO_PICKS_SOURCE.name, date: PRO_PICKS_SOURCE.date })}
        </p>
      </section>
    );
  }

  // --- Page d'une map (parcours 1) -------------------------------------------
  function renderMapPage() {
    const roleEntry = roles.find((entry) => entry.name === role);
    const names = roleEntry ? roleEntry.agents : roles.flatMap((entry) => entry.agents);

    const tabs = (
      <div className="toolkit-tabs">
        <button type="button" className={`toolkit-tab${role ? '' : ' toolkit-tab-active'}`} onClick={() => setRole(null)}>
          {t('toolkit.rolesAll')}
        </button>
        {roles.map((entry) => (
          <button
            key={entry.name}
            type="button"
            className={`toolkit-tab${role === entry.name ? ' toolkit-tab-active' : ''}`}
            onClick={() => setRole(entry.name)}
          >
            {entry.icon && <img src={entry.icon} alt="" />}
            {entry.name}
          </button>
        ))}
      </div>
    );

    const banner = (
      <div className="toolkit-banner" style={{ backgroundImage: `url(${mapImages.get(map)})` }}>
        <div className="toolkit-banner-text">
          <strong>{map}</strong>
          <span>{MAP_AGENT_STATS[map] ? t('toolkit.bannerStats') : t('toolkit.oldData')}</span>
        </div>
      </div>
    );

    // Icebox : plus de statistiques, ancien avis communautaire seulement.
    if (!MAP_AGENT_STATS[map]) {
      const tiers = MAP_AGENT_TIERS[map];
      const top = tiers
        ? [
            ...names.filter((name) => tiers.S.includes(name)).map((name) => ({ name, tier: 'S' })),
            ...names.filter((name) => tiers.A.includes(name)).map((name) => ({ name, tier: 'A' })),
          ]
        : [];
      return (
        <>
          {banner}
          {tabs}
          <p className="toolkit-note toolkit-note-warn">
            <Icon icon={ShieldAlert} size={16} />
            {tiers ? t('toolkit.legacyNote', { map }) : t('toolkit.noTierData', { map })}
          </p>
          {top.length > 0 ? (
            <div className="toolkit-agent-grid">
              {top.map(({ name, tier }) => (
                <div key={name} className="toolkit-agent-tile">
                  {agentIcons.get(name) && <img src={agentIcons.get(name)} alt="" />}
                  <span>{name}</span>
                  <span className={`toolkit-tier toolkit-tier-${tier}`}>{t(`toolkit.tier${tier}`)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="toolkit-empty">{t('toolkit.noneInRole')}</p>
          )}
        </>
      );
    }

    const ranked = rankAgentsOnMap(map, names);
    const reliable = ranked.filter((entry) => entry.reliable);
    const strong = reliable.filter((entry) => ['great', 'good'].includes(verdictFor(entry.winrate)));
    const correct = reliable.filter((entry) => verdictFor(entry.winrate) === 'ok');
    const avoid = reliable.filter((entry) => verdictFor(entry.winrate) === 'bad');
    const small = ranked.filter((entry) => !entry.reliable);
    const picks = strong.slice(0, role ? 3 : 5);
    const moreStrong = strong.slice(picks.length);

    return (
      <>
        {banner}
        {tabs}
        {!role && renderComp()}

        <section className="toolkit-section">
          <h3 className="toolkit-section-title">{t('toolkit.sectionBest')}</h3>
          {picks.length > 0 ? (
            <div className="toolkit-picks">{picks.map(renderPick)}</div>
          ) : (
            <p className="toolkit-note">{t('toolkit.noStandout')}</p>
          )}
          {moreStrong.length > 0 && <div className="toolkit-rows">{moreStrong.map((entry) => renderRow(entry, false))}</div>}
        </section>

        {renderProSection(names)}

        {correct.length > 0 && (
          <section className="toolkit-section">
            <h3 className="toolkit-section-title">{t('toolkit.sectionOk')}</h3>
            <div className="toolkit-rows">{correct.map((entry) => renderRow(entry, false))}</div>
          </section>
        )}

        {avoid.length > 0 && (
          <section className="toolkit-section toolkit-section-avoid">
            <h3 className="toolkit-section-title">{t('toolkit.sectionAvoid')}</h3>
            <div className="toolkit-rows">{avoid.map((entry) => renderRow(entry, false))}</div>
          </section>
        )}

        {small.length > 0 && (
          <section className="toolkit-section">
            <h3 className="toolkit-section-title">{t('toolkit.smallSample')}</h3>
            <div className="toolkit-rows">{small.map((entry) => renderRow(entry, true))}</div>
          </section>
        )}

        <p className="toolkit-source">{t('toolkit.sourceNote', { source: MAP_STATS_SOURCE.name, date: MAP_STATS_SOURCE.date })}</p>
      </>
    );
  }

  // --- Parcours lineups -------------------------------------------------------
  function renderAgentPicker() {
    const needle = normalize(query.trim());
    return (
      <>
        <label className="toolkit-search">
          <Icon icon={Search} size={16} />
          <input
            autoFocus
            type="text"
            value={query}
            placeholder={t('toolkit.searchPlaceholder')}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {roles.map((entry) => {
          const list = entry.agents.filter((name) => !needle || normalize(name).includes(needle));
          if (list.length === 0) return null;
          return (
            <section key={entry.name} className="toolkit-section">
              <h3 className="toolkit-section-title">
                {entry.icon && <img src={entry.icon} alt="" />}
                {entry.name}
              </h3>
              <div className="toolkit-agent-grid">
                {list.map((name) => (
                  <button key={name} type="button" className="toolkit-agent-tile toolkit-agent-tile-button" onClick={() => setAgent(name)}>
                    {agentIcons.get(name) && <img src={agentIcons.get(name)} alt="" />}
                    <span>{name}</span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </>
    );
  }

  // Un Short dans le lecteur YouTube intégré, avec passage au précédent/suivant.
  function renderShortPlayer() {
    const results = search.results;
    const index = results.findIndex((item) => item.id === selected.id);
    const go = (offset) => setSelected(results[index + offset]);
    return (
      <div className="toolkit-player">
        <div className="toolkit-short-frame">
          <iframe
            key={selected.id}
            src={shortEmbedUrl(selected.id)}
            title={selected.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        <div className="toolkit-short-meta">
          <span>{selected.channel}</span>
          <span>
            {formatDuration(selected.seconds)} · {t('toolkit.views', { count: selected.views, formatted: formatViews(selected.views, i18n.language) })}
          </span>
        </div>
        <div className="toolkit-player-nav">
          <button type="button" disabled={index <= 0} onClick={() => go(-1)}>
            <Icon icon={ChevronLeft} size={16} />
            {t('toolkit.prev')}
          </button>
          <button type="button" onClick={() => window.electronAPI?.openExternal(shortWatchUrl(selected.id))}>
            <Icon icon={ExternalLink} size={15} />
            {t('toolkit.openYoutube')}
          </button>
          <button type="button" disabled={index < 0 || index >= results.length - 1} onClick={() => go(1)}>
            {t('toolkit.next')}
            <Icon icon={ChevronRight} size={16} />
          </button>
        </div>
      </div>
    );
  }

  // Résultats de la recherche : filtres en haut (map, côté, site), puis les Shorts.
  function renderShortsPage() {
    const { status, results, stale } = search;
    return (
      <>
        <div className="toolkit-search-bar">
          <select
            className="toolkit-select"
            aria-label={t('toolkit.allMaps')}
            value={map ?? ''}
            onChange={(e) => {
              setMap(e.target.value || null);
              setSite(null);
            }}
          >
            <option value="">{t('toolkit.allMaps')}</option>
            {maps.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <div className="toolkit-chips">
            {SIDES.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className={`toolkit-filter${side === entry.key ? ' toolkit-filter-active' : ''}`}
                onClick={() => setSide(side === entry.key ? null : entry.key)}
              >
                {t(entry.labelKey)}
              </button>
            ))}
            {map &&
              sitesOf(map).map((letter) => (
                <button
                  key={letter}
                  type="button"
                  className={`toolkit-filter${site === letter ? ' toolkit-filter-active' : ''}`}
                  onClick={() => setSite(site === letter ? null : letter)}
                >
                  {t('toolkit.siteLabel', { site: letter })}
                </button>
              ))}
          </div>
        </div>

        {status === 'loading' && <p className="toolkit-empty">{t('toolkit.searching')}</p>}

        {status === 'ok' && (
          <>
            {stale && <p className="toolkit-note">{t('toolkit.staleNote')}</p>}
            {results.length === 0 ? (
              <p className="toolkit-empty">{t('toolkit.noShorts')}</p>
            ) : (
              <div className="toolkit-short-grid">
                {results.map((item) => (
                  <button key={item.id} type="button" className="toolkit-short" onClick={() => setSelected(item)}>
                    <span className="toolkit-short-thumb">
                      <img src={item.thumbnail} alt="" loading="lazy" />
                      <span className="toolkit-short-play">
                        <Icon icon={Play} size={20} />
                      </span>
                      <span className="toolkit-short-duration">{formatDuration(item.seconds)}</span>
                    </span>
                    <span className="toolkit-short-title">{item.title}</span>
                    <span className="toolkit-short-info">
                      {item.channel} · {t('toolkit.views', { count: item.views, formatted: formatViews(item.views, i18n.language) })}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <p className="toolkit-source">{t('toolkit.shortsNote')}</p>
          </>
        )}

        {['unavailable', 'quota', 'auth', 'error'].includes(status) && (
          <div className="toolkit-empty">
            <p>{t(`toolkit.search_${status}`)}</p>
            {status !== 'unavailable' && (
              <button type="button" className="toolkit-retry" onClick={() => setSearchTick((n) => n + 1)}>
                {t('toolkit.retry')}
              </button>
            )}
          </div>
        )}
      </>
    );
  }

  function renderBody() {
    if (!mode) {
      const cards = [
        { key: 'agent', number: '01', icon: Swords, title: t('toolkit.homeAgentTitle'), desc: t('toolkit.homeAgentDesc') },
        { key: 'lineup', number: '02', icon: Film, title: t('toolkit.homeLineupTitle'), desc: t('toolkit.homeLineupDesc') },
      ];
      return (
        <>
          <section className="toolkit-hero">
            <div className="toolkit-hero-text">
              <img className="toolkit-hero-logo" src={logoText} alt="MVP Tracker" />
              <h2 className="toolkit-hero-title">{t('toolkit.heroTitle')}</h2>
              <p className="toolkit-hero-sub">{t('toolkit.heroSub')}</p>
            </div>
          </section>

          <div className="toolkit-home">
            {cards.map(({ key, number, icon, title: cardTitle, desc }) => (
              <div key={key} className="toolkit-home-slot">
                <button type="button" className="toolkit-home-card" onClick={() => setMode(key)}>
                  <span className="toolkit-home-inner">
                    <span className="toolkit-home-number">{number}</span>
                    <span className="toolkit-home-icon">
                      <Icon icon={icon} size={26} />
                    </span>
                    <strong>{cardTitle}</strong>
                    <span className="toolkit-home-desc">{desc}</span>
                    <span className="toolkit-home-cta">
                      {t('toolkit.open')}
                      <Icon icon={ArrowRight} size={16} />
                    </span>
                  </span>
                </button>
              </div>
            ))}
          </div>

          <p className="toolkit-source">{t('toolkit.homeFoot', { date: MAP_STATS_SOURCE.date })}</p>
        </>
      );
    }

    if (mode === 'agent') return map ? renderMapPage() : renderMapGrid();

    if (!agent) return renderAgentPicker();
    return selected ? renderShortPlayer() : renderShortsPage();
  }

  return (
    <div className="toolkit-root">
      <header className="toolkit-header">
        {mode ? (
          <button type="button" className="toolkit-icon-button" onClick={goBack} aria-label={t('toolkit.back')}>
            <Icon icon={ArrowLeft} size={18} />
          </button>
        ) : (
          <img className="toolkit-brand" src={appIcon} alt="MVP Tracker" />
        )}
        <div className="toolkit-heading">
          <h1 className="toolkit-title">{title}</h1>
          {crumbs.length > 0 && <span className="toolkit-crumbs">{crumbs.join('  ›  ')}</span>}
        </div>
        <button type="button" className="toolkit-icon-button" onClick={() => window.electronAPI?.closeGameToolkit()} aria-label={t('toolkit.close')}>
          <Icon icon={X} size={18} />
        </button>
      </header>
      <main ref={bodyRef} className="toolkit-body">
        <div key={`${mode}-${role}-${agent}-${selected?.id}-${mode === 'agent' ? map : ''}`} className="toolkit-step">
          {renderBody()}
        </div>
      </main>
      <footer className="toolkit-footer">
        {hotkey && <kbd>{hotkey}</kbd>} {t('toolkit.footerHint')}
      </footer>
    </div>
  );
}
