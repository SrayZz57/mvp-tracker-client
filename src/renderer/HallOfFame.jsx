import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bomb, Flame, Target, Star, Lock, Plus } from 'lucide-react';
import { computeHallOfFame } from './hallOfFame.js';
import { deriveAchievements } from './achievements.js';
import { useAgentPortraits } from './agentIcons.js';
import { supabase } from './supabaseClient.js';
import ConfettiBurst from './ConfettiBurst.jsx';
import LoadingState from './LoadingState.jsx';
import CollapsibleCard from './CollapsibleCard.jsx';
import Icon from './Icon.jsx';

function formatDate(locale, ms) {
  if (!ms) return '?';
  return new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

function TrophyCard({ icon, color, title, value, valueLabel, context, portrait, empty, t }) {
  return (
    <div
      className={`trophy-card ${empty ? 'empty' : ''}`}
      style={!empty && portrait ? { backgroundImage: `url(${portrait})` } : undefined}
    >
      <div className="trophy-card-overlay">
        <div className="trophy-header">
          <span className="trophy-icon" style={{ color }}><Icon icon={icon} size={20} /></span>
          <span className="trophy-title">{title}</span>
        </div>
        {empty ? (
          <p className="label">{t('hallOfFame.noneUnlockedYet')}</p>
        ) : (
          <>
            <div className="trophy-value">
              {value}
              {valueLabel && <span className="trophy-value-label">{valueLabel}</span>}
            </div>
            <div className="trophy-context">{context}</div>
          </>
        )}
      </div>
    </div>
  );
}

function AchievementBadge({ icon, color, title, description, unlocked, contextText, progressPercent }) {
  return (
    <div className={`achievement-badge ${unlocked ? 'unlocked' : 'locked'}`} title={description}>
      <div className="achievement-badge-icon" style={unlocked ? { color } : undefined}>
        {unlocked ? <Icon icon={icon} /> : <Icon icon={Lock} />}
      </div>
      <div className="achievement-badge-title">{title}</div>
      {unlocked ? (
        <div className="achievement-badge-context">{contextText}</div>
      ) : (
        <>
          <div className="achievement-badge-context">{description}</div>
          <div className="achievement-badge-progress">
            <div className="achievement-badge-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </>
      )}
    </div>
  );
}

// Réutilise la table contact_messages (même pipeline que "Nous contacter" /
// le formulaire du site : Database Webhook + fonction Edge contact-notify
// déjà en place) plutôt que de créer un circuit dédié pour une simple boîte
// à suggestions.
function SuggestAchievementModal({ onClose, t }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState(null); // null | 'sending' | 'sent' | 'error'

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setStatus('sending');
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('contact_messages').insert({
      name: userData?.user?.user_metadata?.display_name || userData?.user?.email || 'Joueur',
      email: userData?.user?.email ?? '',
      message: `[Suggestion de succès] ${trimmed}`,
    });
    setStatus(error ? 'error' : 'sent');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose}>{t('detail.close')}</button>
        <h3>{t('hallOfFame.suggestTitle')}</h3>
        {status === 'sent' ? (
          <p className="label">{t('hallOfFame.suggestSent')}</p>
        ) : (
          <form className="account-auth-form" onSubmit={handleSubmit}>
            <textarea
              className="account-contact-textarea"
              placeholder={t('hallOfFame.suggestPlaceholder')}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              autoFocus
              required
            />
            <button type="submit" disabled={status === 'sending'}>
              {status === 'sending' ? t('hallOfFame.suggestSending') : t('hallOfFame.suggestSend')}
            </button>
            {status === 'error' && <p className="warning">{t('hallOfFame.suggestError')}</p>}
          </form>
        )}
      </div>
    </div>
  );
}

function HallOfFame({ settings, matches, loading }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en-US' : 'fr-FR';
  const agentPortraits = useAgentPortraits();
  const hof = useMemo(() => computeHallOfFame(matches, settings.name, settings.tag), [matches, settings.name, settings.tag]);
  const achievementGroups = useMemo(() => deriveAchievements(t, i18n.language, hof), [t, i18n.language, hof]);
  const totalCount = achievementGroups.reduce((sum, g) => sum + g.items.length, 0);
  const unlockedCount = achievementGroups.reduce((sum, g) => sum + g.items.filter((i) => i.unlocked).length, 0);
  const [celebrate, setCelebrate] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);

  // Compare aux succès déjà vus (stockés localement par compte) pour ne
  // fêter que ceux qui viennent réellement de tomber, pas ceux déjà connus
  // à chaque fois que l'onglet se rouvre.
  useEffect(() => {
    const storageKey = `mvp-achievements-seen:${settings.name}#${settings.tag}`.toLowerCase();
    const seen = new Set(JSON.parse(localStorage.getItem(storageKey) || '[]'));
    const unlockedIds = achievementGroups.flatMap((g) => g.items.filter((i) => i.unlocked).map((i) => i.id));
    const hasNewUnlock = unlockedIds.some((id) => !seen.has(id));

    localStorage.setItem(storageKey, JSON.stringify(unlockedIds));

    if (hasNewUnlock && seen.size > 0) {
      setCelebrate(true);
      const timeout = setTimeout(() => setCelebrate(false), 2600);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [achievementGroups, settings.name, settings.tag]);

  if (matches.length === 0) {
    if (loading) return <LoadingState />;
    return <p>{t('hallOfFame.noMatchesYet')}</p>;
  }

  return (
    <div>
      {celebrate && <ConfettiBurst />}
      <CollapsibleCard id="hallOfFame.intro" title={t('hallOfFame.title')}>
        <p className="label">{t('hallOfFame.description')}</p>
      </CollapsibleCard>

      <div className="trophy-grid">
        <TrophyCard
          t={t}
          icon={Bomb}
          color="var(--hue-red)"
          title={t('hallOfFame.bestAce')}
          empty={!hof.bestAce}
          value={hof.bestAce?.kills}
          valueLabel={t('hallOfFame.killsInRound')}
          portrait={hof.bestAce && agentPortraits.get(hof.bestAce.agent)}
          context={hof.bestAce && `${hof.bestAce.agent} — ${hof.bestAce.map}, ${t('hallOfFame.roundLabel', { n: hof.bestAce.roundNumber })} — ${formatDate(locale, hof.bestAce.date)}`}
        />
        <TrophyCard
          t={t}
          icon={Flame}
          color="var(--hue-orange)"
          title={t('hallOfFame.longestWinStreak')}
          empty={!hof.longestWinStreak}
          value={hof.longestWinStreak?.streak}
          valueLabel={t('hallOfFame.winsInARow')}
          context={
            hof.longestWinStreak &&
            t('hallOfFame.streakRange', { start: formatDate(locale, hof.longestWinStreak.startDate), end: formatDate(locale, hof.longestWinStreak.endDate) })
          }
        />
        <TrophyCard
          t={t}
          icon={Target}
          color="var(--hue-gold)"
          title={t('hallOfFame.bestClutch')}
          empty={!hof.bestClutch}
          value={hof.bestClutch && `1v${hof.bestClutch.enemies}`}
          valueLabel={t('hallOfFame.won')}
          portrait={hof.bestClutch && agentPortraits.get(hof.bestClutch.agent)}
          context={hof.bestClutch && `${hof.bestClutch.agent} — ${hof.bestClutch.map}, ${t('hallOfFame.roundLabel', { n: hof.bestClutch.roundNumber })} — ${formatDate(locale, hof.bestClutch.date)}`}
        />
        <TrophyCard
          t={t}
          icon={Star}
          color="var(--hue-purple)"
          title={t('hallOfFame.bestKdaMatch')}
          empty={!hof.bestKda}
          value={hof.bestKda?.kda.toFixed(2)}
          valueLabel={hof.bestKda && `${hof.bestKda.kills}/${hof.bestKda.deaths}/${hof.bestKda.assists}`}
          portrait={hof.bestKda && agentPortraits.get(hof.bestKda.agent)}
          context={hof.bestKda && `${hof.bestKda.agent} — ${hof.bestKda.map} — ${formatDate(locale, hof.bestKda.date)}`}
        />
      </div>

      <CollapsibleCard
        id="hallOfFame.achievements"
        title={t('hallOfFame.achievementsTitle', { unlocked: unlockedCount, total: totalCount })}
        headerExtra={
          <button type="button" className="hof-suggest-button" onClick={() => setSuggestOpen(true)}>
            <Icon icon={Plus} size={14} /> {t('hallOfFame.suggestButton')}
          </button>
        }
      >
        <p className="label">{t('hallOfFame.achievementsHint')}</p>
      </CollapsibleCard>

      {suggestOpen && <SuggestAchievementModal t={t} onClose={() => setSuggestOpen(false)} />}

      {achievementGroups.map((group) => (
        <CollapsibleCard
          key={group.key}
          id={`hallOfFame.group.${group.key}`}
          title={group.label}
          headerExtra={<span className="achievement-group-count">{group.unlockedCount}/{group.total}</span>}
        >
          <div className="achievement-group-track">
            <div
              className="achievement-group-fill"
              style={{ width: `${(group.unlockedCount / group.total) * 100}%` }}
            />
          </div>
          <div className="achievement-grid">
            {group.items.map((item) => (
              <AchievementBadge key={item.id} {...item} />
            ))}
          </div>
        </CollapsibleCard>
      ))}
    </div>
  );
}

export default HallOfFame;
