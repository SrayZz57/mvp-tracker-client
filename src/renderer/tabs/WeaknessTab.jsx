import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { computePlayerProfile, getWeaknesses } from '../playerProfile.js';
import CollapsibleCard from '../CollapsibleCard.jsx';

// Onglet dédié dans "Mon compte" — auparavant un bouton sur la carte ADN de
// l'onglet Stats, qui pouvait donc afficher les points faibles de N'IMPORTE
// QUEL profil consulté (settings = celui recherché, pas forcément le sien).
// Ici settings/matches viennent toujours de mySettings/myMatches côté
// App.jsx : uniquement les points à travailler du compte connecté.
function WeaknessTab({ settings, matches, onNavigate }) {
  const { t } = useTranslation();
  const profile = useMemo(
    () => computePlayerProfile(matches, settings.name, settings.tag),
    [matches, settings.name, settings.tag],
  );
  const weaknesses = useMemo(() => (profile.ready ? getWeaknesses(profile.scores) : []), [profile]);

  if (!profile.ready) {
    return (
      <CollapsibleCard id="profile.weaknessTab" title={t('profile.weakness.title')} className="gs-card">
        <p className="label">{t('profile.notReady', { count: profile.minMatches - profile.matchesAnalyzed })}</p>
      </CollapsibleCard>
    );
  }

  return (
    <CollapsibleCard id="profile.weaknessTab" title={t('profile.weakness.title')} className="gs-card">
      {weaknesses.length === 0 ? (
        <p className="label">{t('profile.weakness.none')}</p>
      ) : (
        <div className="weakness-list">
          {weaknesses.map((w) => (
            <div key={w.dimension} className="weakness-item">
              <div>
                <div className="weakness-item-title">{t(`profile.weakness.${w.key}.title`)}</div>
                <p className="label">{t(`profile.weakness.${w.key}.text`)}</p>
              </div>
              <button className="refresh" onClick={() => onNavigate(w.tab, w.mode)}>
                {t(`profile.weakness.${w.key}.action`)}
              </button>
            </div>
          ))}
        </div>
      )}
    </CollapsibleCard>
  );
}

export default WeaknessTab;
