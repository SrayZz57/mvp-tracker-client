import { ArrowRight, Crosshair, Map as MapIcon, SlidersHorizontal } from 'lucide-react';
import Icon from './Icon.jsx';
import classicShot from '../assets/aim-modes/classic.jpg';
import customShot from '../assets/aim-modes/custom.jpg';
import './modesScreen.css';

// Page « Modes » de l'Aim Trainer : d'abord trois grandes cartes (Classique,
// Valorant, Personnalisé), puis le contenu de la catégorie choisie. Le contenu
// d'une catégorie (grilles de modes, presets) reste construit par le hub, qui
// possède déjà tout l'état nécessaire : ce composant ne fait que la mise en scène.

export const MODE_CATEGORIES = ['classic', 'valorant', 'custom'];

const ICONS = { classic: Crosshair, valorant: MapIcon, custom: SlidersHorizontal };

// Illustrations des cartes, dessinées en SVG (aucun visuel tiers).
function ClassicArt() {
  const targets = [
    [300, 120, 34], [210, 250, 22], [360, 300, 46], [120, 150, 16], [250, 420, 28], [90, 360, 20], [340, 470, 14],
  ];
  return (
    <svg viewBox="0 0 400 560" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
      <defs>
        <radialGradient id="mc-sphere" cx=".35" cy=".3" r=".75">
          <stop offset="0" stopColor="#ffd0d4" />
          <stop offset=".35" stopColor="#ff4655" />
          <stop offset="1" stopColor="#5c0d16" />
        </radialGradient>
        <pattern id="mc-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="#ff4655" strokeOpacity=".09" />
        </pattern>
      </defs>
      <rect width="400" height="560" fill="url(#mc-grid)" />
      {targets.map(([x, y, r], i) => (
        <g key={i} className="mc-float" style={{ animationDelay: `${i * -0.7}s` }}>
          <circle cx={x} cy={y} r={r * 1.9} fill="#ff4655" opacity=".10" />
          <circle cx={x} cy={y} r={r} fill="url(#mc-sphere)" />
        </g>
      ))}
      <g fill="none" stroke="#fff" strokeWidth="2.5" opacity=".9">
        <circle cx="360" cy="300" r="70" strokeDasharray="4 10" className="mc-spin" />
        <path d="M360 214v36M360 350v36M274 300h36M410 300h36" />
      </g>
    </svg>
  );
}

function ValorantArt() {
  return (
    <svg viewBox="0 0 400 560" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
      <defs>
        <linearGradient id="mv-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2f9d97" stopOpacity=".35" />
          <stop offset=".6" stopColor="#2f9d97" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="mv-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d3b3d" />
          <stop offset="1" stopColor="#0c1718" />
        </linearGradient>
      </defs>
      <rect width="400" height="560" fill="url(#mv-sky)" />
      {/* Sol en perspective. */}
      <g stroke="#5fe8d8" strokeOpacity=".16">
        {Array.from({ length: 11 }, (_, i) => (
          <line key={`v${i}`} x1={200} y1={330} x2={-300 + i * 100} y2={560} />
        ))}
        {[360, 395, 440, 495, 560].map((y) => (
          <line key={`h${y}`} x1="0" y1={y} x2="400" y2={y} />
        ))}
      </g>
      {/* Architecture : arches et piliers. */}
      <g fill="url(#mv-wall)" stroke="#5fe8d8" strokeOpacity=".35">
        <path d="M20 340V150h110v190h-24V230a31 31 0 0 0-62 0v110z" />
        <path d="M270 340V110h120v230h-26V210a34 34 0 0 0-68 0v130z" />
        <rect x="150" y="270" width="54" height="54" />
        <rect x="186" y="300" width="44" height="40" />
      </g>
      <g fill="none" stroke="#5fe8d8" strokeOpacity=".5">
        <path d="M150 270l54 54M204 270l-54 54" />
      </g>
      {/* Plaque de site. */}
      <g transform="translate(200 175)">
        <rect x="-38" y="-38" width="76" height="76" transform="rotate(45)" fill="#0c1718" stroke="#5fe8d8" strokeWidth="3" />
        <text textAnchor="middle" y="16" fill="#5fe8d8" fontSize="48" fontWeight="800" fontFamily="sans-serif">A</text>
      </g>
      {/* Silhouette de cible humaine avec le point de tête visé. */}
      <g className="mc-strafe">
        <path d="M112 470c0-38 16-58 30-62-10-6-14-16-14-26 0-14 10-24 22-24s22 10 22 24c0 10-4 20-14 26 14 4 30 24 30 62z" fill="#081012" stroke="#5fe8d8" strokeOpacity=".6" />
        <circle cx="150" cy="382" r="5" fill="#ff4655" />
        <circle cx="150" cy="382" r="14" fill="none" stroke="#ff4655" strokeWidth="2" className="mc-ping" />
      </g>
    </svg>
  );
}

function ClassicPhoto() {
  return <img className="mc-photo mc-photo-classic" src={classicShot} alt="" decoding="async" />;
}

// Composition façon écran de sélection d'agent : la carte en fond, virée au
// bicolore, une bande diagonale aux couleurs de l'agent, son nom en grand
// derrière lui, et un réticule posé sur sa tête (seul le headshot compte).
function ValorantScene({ images }) {
  if (!images?.map) return <ValorantArt />;
  return (
    <span className="mc-scene" style={{ '--agent-a': images.colorA, '--agent-b': images.colorB }}>
      <img className="mc-photo mc-photo-map" src={images.map} alt="" decoding="async" />
      <span className="mc-scene-tint" />
      <span className="mc-slash" />
      {images.agentBackground && <img className="mc-agent-bg" src={images.agentBackground} alt="" decoding="async" />}
      {images.agent && (
        <span className="mc-agent">
          <img src={images.agent} alt="" decoding="async" />
          <span className="mc-reticle" />
        </span>
      )}
      <span className="mc-hud">
        <span className="mc-hud-dot" /> HEADSHOT ONLY
      </span>
    </span>
  );
}

// Personnalisé : la vraie fenêtre de réglages de l'app (capture), posée en
// biais sur un décor d'arène violet, avec quelques cibles qui flottent autour.
const CUSTOM_ORBS = [
  { x: 6, y: 6, size: 40 },
  { x: 82, y: 4, size: 56 },
  { x: 90, y: 40, size: 24 },
  { x: 2, y: 34, size: 22 },
];

function CustomWorkshop() {
  return (
    <span className="mc-workshop">
      <span className="mc-floor" />
      {CUSTOM_ORBS.map((orb, i) => (
        <span
          key={i}
          className="mc-orb"
          style={{ left: `${orb.x}%`, top: `${orb.y}%`, width: orb.size, height: orb.size, animationDelay: `${i * -1.1}s` }}
        />
      ))}
      <img className="mc-window" src={customShot} alt="" decoding="async" />
    </span>
  );
}

const ART = { classic: ClassicPhoto, valorant: ValorantScene, custom: CustomWorkshop };

// Illustration d'une catégorie, réutilisée par le lobby de l'accueil.
export function ModeArt({ category, images }) {
  const Art = ART[category];
  return Art ? <Art images={images} /> : null;
}

function CategoryCard({ id, index, stats, images, onPick, onHover, t }) {
  const Art = ART[id];
  return (
    <button type="button" className="mc-card" data-cat={id} onClick={() => onPick(id)} onMouseEnter={onHover}>
      <span className="mc-art">
        <Art images={images} t={t} />
      </span>
      <span className="mc-shade" aria-hidden="true" />
      <span className="mc-index">{String(index + 1).padStart(2, '0')}</span>
      <span className="mc-body">
        <span className="mc-icon">
          <Icon icon={ICONS[id]} size={22} />
        </span>
        <span className="mc-tag">{t(`aimTrainer.modesHub.${id}.tag`)}</span>
        <strong className="mc-name">{t(`aimTrainer.modesHub.${id}.name`)}</strong>
        <span className="mc-desc">{t(`aimTrainer.modesHub.${id}.desc`)}</span>
        <span className="mc-stats">
          {stats.map((s) => (
            <span key={s.key} className="mc-stat">
              <b>
                {s.icon && <Icon icon={s.icon} size={13} />}
                {s.value}
              </b>
              <small>{t(`aimTrainer.modesHub.stats.${s.key}`, { count: s.value })}</small>
            </span>
          ))}
        </span>
        <span className="mc-cta">
          {t('aimTrainer.modesHub.pick')} <Icon icon={ArrowRight} size={16} />
        </span>
      </span>
    </button>
  );
}

// stats : { classic: [{ key, value, icon }], valorant: [...], custom: [...] }
// images : { map, agent } pour la carte Valorant (chargées par le hub).
export default function ModesScreen({ category, stats, images, onPick, onHover, children, t }) {
  if (!category) {
    return (
      <div className="mc-screen">
        <header className="mc-head">
          <span className="mc-eyebrow">{t('aimTrainer.title')}</span>
          <h2>{t('aimTrainer.modesHub.title')}</h2>
          <p>{t('aimTrainer.modesHub.subtitle')}</p>
        </header>
        <div className="mc-cards">
          {MODE_CATEGORIES.map((id, index) => (
            <CategoryCard key={id} id={id} index={index} stats={stats[id] ?? []} images={images} onPick={onPick} onHover={onHover} t={t} />
          ))}
        </div>
      </div>
    );
  }

  const Art = ART[category];
  return (
    <div className="mc-screen mc-detail" data-cat={category}>
      <div className="mc-detail-art" aria-hidden="true">
        <Art images={images} t={t} />
      </div>
      <header className="mc-detail-head">
        <span className="mc-icon">
          <Icon icon={ICONS[category]} size={22} />
        </span>
        <div>
          <span className="mc-eyebrow">
            {t('aimTrainer.modesHub.title')} · {t(`aimTrainer.modesHub.${category}.tag`)}
          </span>
          <h2>{t(`aimTrainer.modesHub.${category}.name`)}</h2>
          <p>{t(`aimTrainer.modesHub.${category}.desc`)}</p>
        </div>
      </header>
      <div className="mc-detail-body">{children}</div>
    </div>
  );
}

