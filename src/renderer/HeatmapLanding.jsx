import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Flame, Skull, Swords } from 'lucide-react';
import Icon from './Icon.jsx';
import { useMapMinimaps } from './mapImages.js';
import { useAgentsData } from './agentIcons.js';
import { useWeaponIcons } from './weaponIcons.js';
import './heatmapLanding.css';

// Page d'accueil de l'onglet Heatmap : deux grandes cartes, une par vue. Les
// visuels viennent de valorant-api.com (minimap, portrait d'agent, icône
// d'arme) ; les taches de chaleur et les cases de duels sont du CSS pur, pour
// montrer d'un coup d'œil ce que chaque vue affiche.

// Cases d'exemple de la carte « duels » : rouge = duels perdus, vert = gagnés.
const SAMPLE_CELLS = [
  { tone: 'win', text: '4-1', style: { left: '18%', top: '30%' } },
  { tone: 'mid', text: '2-2', style: { left: '38%', top: '52%' } },
  { tone: 'loss', text: '1-4', style: { left: '58%', top: '26%' } },
  { tone: 'win', text: '3-0', style: { left: '30%', top: '68%' } },
  { tone: 'loss', text: '0-3', style: { left: '66%', top: '62%' } },
];

const pick = (map, key) => (map instanceof Map ? map.get(key) : undefined);

function Card({ id, tone, icon, title, tagline, description, tags, minimap, portrait, weaponIcon, weaponName, gamesLabel, openLabel, onOpen, children }) {
  return (
    <button type="button" className="hl-card" data-tone={tone} onClick={() => onOpen(id)}>
      <span className="hl-art" aria-hidden="true">
        <span className="hl-map">
          {minimap && <img className="hl-minimap" src={minimap} alt="" loading="lazy" />}
          {children}
        </span>
        {portrait && <img className="hl-portrait" src={portrait} alt="" loading="lazy" />}
      </span>
      <span className="hl-shade" aria-hidden="true" />

      <span className="hl-body">
        <span className="hl-badge">
          <Icon icon={icon} size={15} /> {tagline}
        </span>
        <strong className="hl-title">{title}</strong>
        <span className="hl-desc">{description}</span>
        <span className="hl-tags">
          {tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </span>
        <span className="hl-foot">
          <span className="hl-games">
            {weaponIcon && <img src={weaponIcon} alt={weaponName} title={weaponName} />}
            {gamesLabel}
          </span>
          <span className="hl-open">
            {openLabel} <Icon icon={ArrowRight} size={16} />
          </span>
        </span>
      </span>
    </button>
  );
}

export default function HeatmapLanding({ matches, onChoose }) {
  const { t } = useTranslation();
  const minimaps = useMapMinimaps();
  const agents = useAgentsData();
  const weaponIcons = useWeaponIcons();

  // Une map différente par carte (les deux premières du pool), sans dépendre
  // de l'ordre exact renvoyé par l'API.
  const [classicMap, duelMap] = useMemo(() => {
    const names = [...minimaps.keys()].sort();
    return [pick(minimaps, names.includes('Ascent') ? 'Ascent' : names[0]), pick(minimaps, names.includes('Haven') ? 'Haven' : names[1] ?? names[0])];
  }, [minimaps]);

  const portrait = (name) => agents.find((a) => a.displayName === name)?.fullPortrait ?? null;
  const gamesLabel = t('heatmap.landing.games', { count: matches.length });
  const open = t('heatmap.landing.open');

  return (
    <div className="hl">
      <header className="hl-head">
        <span className="hl-eyebrow">
          <Icon icon={Flame} size={14} /> {t('heatmap.landing.eyebrow')}
        </span>
        <h2>{t('heatmap.title')}</h2>
        <p>{t('heatmap.landing.subtitle')}</p>
      </header>

      <div className="hl-grid">
        <Card
          id="classic"
          tone="classic"
          icon={Skull}
          title={t('heatmap.views.classic')}
          tagline={t('heatmap.landing.classic.tagline')}
          description={t('heatmap.landing.classic.desc')}
          tags={[t('heatmap.landing.classic.tag1'), t('heatmap.landing.classic.tag2'), t('heatmap.landing.classic.tag3')]}
          minimap={classicMap}
          portrait={portrait('Reyna')}
          weaponIcon={pick(weaponIcons, 'Vandal')}
          weaponName="Vandal"
          gamesLabel={gamesLabel}
          openLabel={open}
          onOpen={onChoose}
        >
          <span className="hl-heat hl-heat-a" />
          <span className="hl-heat hl-heat-b" />
          <span className="hl-heat hl-heat-c" />
        </Card>

        <Card
          id="duels"
          tone="duels"
          icon={Swords}
          title={t('heatmap.views.duels')}
          tagline={t('heatmap.landing.duels.tagline')}
          description={t('heatmap.landing.duels.desc')}
          tags={[t('heatmap.landing.duels.tag1'), t('heatmap.landing.duels.tag2'), t('heatmap.landing.duels.tag3')]}
          minimap={duelMap}
          portrait={portrait('Jett')}
          weaponIcon={pick(weaponIcons, 'Phantom')}
          weaponName="Phantom"
          gamesLabel={gamesLabel}
          openLabel={open}
          onOpen={onChoose}
        >
          {SAMPLE_CELLS.map((cell) => (
            <span key={cell.text} className="hl-cell" data-tone={cell.tone} style={cell.style}>
              {cell.text}
            </span>
          ))}
        </Card>
      </div>
    </div>
  );
}
