import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import Icon from '../Icon.jsx';
import Heatmap from '../Heatmap.jsx';
import DuelHeatmap from '../DuelHeatmap.jsx';
import HeatmapLanding from '../HeatmapLanding.jsx';

const VIEWS = [
  { id: 'classic', labelKey: 'heatmap.views.classic' },
  { id: 'duels', labelKey: 'heatmap.views.duels' },
];

// On arrive toujours sur la page d'accueil (deux cartes) ; « Retour » y ramène.
function HeatmapTab({ settings, matches: rawMatches }) {
  const { t } = useTranslation();
  // Les matchs arrivent après le premier rendu : jamais undefined plus bas.
  const matches = rawMatches ?? [];
  const [view, setView] = useState(null);

  if (view === null) return <HeatmapLanding matches={matches} onChoose={setView} />;

  return (
    <div>
      <div className="filter-bar">
        <button className="strategy-tool" onClick={() => setView(null)}>
          <Icon icon={ArrowLeft} size={16} /> {t('heatmap.landing.back')}
        </button>
        {VIEWS.map((v) => (
          <button key={v.id} className={v.id === view ? 'strategy-tool active' : 'strategy-tool'} onClick={() => setView(v.id)}>
            {t(v.labelKey)}
          </button>
        ))}
      </div>
      {view === 'duels' ? <DuelHeatmap settings={settings} matches={matches} /> : <Heatmap settings={settings} matches={matches} />}
    </div>
  );
}

export default HeatmapTab;
