import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EyeOff } from 'lucide-react';
import { useRankTiers } from './rankData.js';
import { useAgentsById, useAgentIcons } from './agentIcons.js';
import Icon from './Icon.jsx';

// Fenêtre overlay séparée (voir createMatchRanksOverlay dans main.js) : rangs de
// l'équipe dès la sélection d'agent, puis ceux des adversaires pendant 45 s.
// Purement passive : reçoit des lignes déjà prêtes par IPC, ne calcule rien et
// ne contacte aucun serveur de jeu. Un joueur masqué (mode streamer) arrive sans
// pseudo ni rang — ce composant n'a donc rien à cacher, juste à ne rien inventer.
function PlayerRow({ player, index, tiers, agents }) {
  const { t } = useTranslation();
  const agent = player.agentId ? agents.get(player.agentId.toLowerCase()) : null;
  const hasRank = !player.hidden && player.tier > 0;
  const tier = hasRank ? tiers.get(player.tier) : tiers.get(0);

  return (
    <li
      className={`overlay-ranks-row${player.isMe ? ' me' : ''}${player.hidden ? ' hidden-player' : ''}`}
      style={{ '--i': index }}
    >
      <span className="overlay-ranks-agent">{agent?.icon && <img src={agent.icon} alt="" />}</span>
      {player.hidden ? (
        <span className="overlay-ranks-name muted">
          <Icon icon={EyeOff} size={13} /> {t('matchRanksOverlay.hiddenPlayer')}
        </span>
      ) : (
        <span className="overlay-ranks-name">
          {player.name ?? '—'}
          {player.tag && <small>#{player.tag}</small>}
          {player.isMe && <span className="overlay-ranks-you">{t('matchRanksOverlay.you')}</span>}
        </span>
      )}
      {!player.hidden && (
        <span
          className={`overlay-ranks-tier${hasRank ? '' : ' unranked'}`}
          style={hasRank && tier?.color ? { color: tier.color } : undefined}
        >
          {tier?.icon && <img src={tier.icon} alt="" />}
          <span>{hasRank ? tier?.name ?? '' : t('matchRanksOverlay.unranked')}</span>
        </span>
      )}
    </li>
  );
}

function Panel({ side, title, players, tiers, agents, endsAt }) {
  if (players.length === 0) return null;
  // Barre qui se vide sur le temps restant : une animation CSS (compositée)
  // plutôt qu'un setInterval qui re-rend le composant chaque seconde.
  const remainingMs = endsAt ? Math.max(0, endsAt - Date.now()) : 0;
  return (
    <section className={`overlay-ranks-panel ${side}`}>
      <div className="overlay-ranks-head">
        <h3>{title}</h3>
        <span className="overlay-ranks-count">{players.length}</span>
      </div>
      <ul>
        {players.map((player, index) => (
          <PlayerRow key={index} player={player} index={index} tiers={tiers} agents={agents} />
        ))}
      </ul>
      {remainingMs > 0 && (
        <div className="overlay-ranks-timer" aria-hidden="true">
          <span key={endsAt} style={{ animationDuration: `${remainingMs}ms` }} />
        </div>
      )}
    </section>
  );
}

// Suggestions d'agent pendant la sélection : le winrate perso sur la map s'il y a
// assez de parties, sinon l'avis communautaire ; un badge si l'agent comble un
// rôle qu'aucun coéquipier ne joue.
function SuggestionPanel({ suggestions, agentIcons }) {
  const { t } = useTranslation();
  if (!suggestions || suggestions.length === 0) return null;
  return (
    <section className="overlay-ranks-panel suggest">
      <div className="overlay-ranks-head">
        <h3>{t('matchRanksOverlay.suggestTitle')}</h3>
      </div>
      <ul>
        {suggestions.map((suggestion, index) => (
          <li key={suggestion.agent} className="overlay-ranks-row suggestion" style={{ '--i': index }}>
            <span className="overlay-ranks-agent">
              {agentIcons.get(suggestion.agent) && <img src={agentIcons.get(suggestion.agent)} alt="" />}
            </span>
            <span className="overlay-ranks-name">
              {suggestion.agent}
              <small className="overlay-ranks-reason">
                {suggestion.source === 'personal'
                  ? t('matchRanksOverlay.suggestPersonal', { winrate: suggestion.winrate, games: suggestion.games })
                  : t('matchRanksOverlay.suggestCommunity')}
              </small>
            </span>
            {suggestion.fillsGap && <span className="overlay-ranks-gap">{t('matchRanksOverlay.suggestGap')}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function MatchRanksOverlay() {
  const { t, i18n } = useTranslation();
  // Noms de rang dans la langue de l'app (l'API les renvoie en anglais par défaut).
  const tiers = useRankTiers(i18n.language === 'en' ? 'en-US' : 'fr-FR');
  const agents = useAgentsById();
  const agentIcons = useAgentIcons();
  const [data, setData] = useState(null);

  useEffect(() => {
    document.body.classList.add('overlay-window');
  }, []);

  // On redemande aussi les données à l'ouverture : celles poussées par le process
  // principal arrivent avant que ce composant (chargé en lazy) n'écoute — voir
  // match-ranks-overlay:get-data dans main.js. `prev ??` pour ne jamais écraser
  // des données plus récentes déjà reçues.
  useEffect(() => {
    let cancelled = false;
    window.electronAPI
      .getMatchRanksOverlayData()
      .then((initial) => {
        if (!cancelled && initial) setData((prev) => prev ?? initial);
      })
      .catch(() => {});
    const unsubscribe = window.electronAPI.onMatchRanksOverlayData(setData);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (!data) return null;

  return (
    <div className="overlay-ranks">
      <Panel side="ally" title={t('matchRanksOverlay.allies')} players={data.allies} tiers={tiers} agents={agents} />
      <SuggestionPanel suggestions={data.suggestions} agentIcons={agentIcons} />
      <Panel
        side="enemy"
        title={t('matchRanksOverlay.enemies')}
        players={data.enemies}
        tiers={tiers}
        agents={agents}
        endsAt={data.enemiesEndsAt}
      />
    </div>
  );
}

export default MatchRanksOverlay;
