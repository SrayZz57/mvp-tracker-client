import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, XCircle } from 'lucide-react';
import Icon from './Icon.jsx';
import { analyzeRoundBuys, summarizeRoundBuys, listMatchesWithRounds, recommendBuy } from './buySimulator.js';
import { agentAbilityBudget, AGENT_ABILITY_COSTS, ABILITY_COSTS_SOURCE_DATE } from './abilityCosts.js';
import { useShopWeapons, useShopArmors, useWeaponIcons } from './weaponIcons.js';
import { useAgentIcons, useAgentRoles, useAgentAbilities } from './agentIcons.js';
import LoadingState from './LoadingState.jsx';
import PlatformFilterToggle from './PlatformFilterToggle.jsx';
import usePlatformFilter from './usePlatformFilter.js';
import CollapsibleCard from './CollapsibleCard.jsx';

function BuyAnalysisSection({ settings, matches }) {
  const { t, i18n } = useTranslation();
  const weaponIcons = useWeaponIcons();
  const eligibleMatches = useMemo(
    () => listMatchesWithRounds(matches, settings.name, settings.tag),
    [matches, settings.name, settings.tag],
  );
  const [selectedMatchId, setSelectedMatchId] = useState('');

  const selectedMatch = eligibleMatches.find((m) => m.metadata.matchid === selectedMatchId) ?? eligibleMatches[0] ?? null;

  const rounds = useMemo(
    () => (selectedMatch ? analyzeRoundBuys(t, selectedMatch, settings.name, settings.tag) : []),
    [t, selectedMatch, settings.name, settings.tag],
  );
  const summary = useMemo(() => summarizeRoundBuys(rounds), [rounds]);

  if (eligibleMatches.length === 0) {
    return <p>{t('buySim.noRoundData')}</p>;
  }

  return (
    <>
      <div className="filter-bar">
        <select value={selectedMatch?.metadata.matchid ?? ''} onChange={(e) => setSelectedMatchId(e.target.value)}>
          {eligibleMatches.map((m) => (
            <option key={m.metadata.matchid} value={m.metadata.matchid}>
              {m.metadata.map} — {new Date(m.metadata.game_start * 1000).toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'fr-FR')}
            </option>
          ))}
        </select>
        {summary.percent !== null && (
          <span className="heatmap-point-count">
            {t('buySim.coherentRounds', { coherent: summary.coherent, total: summary.total, percent: summary.percent.toFixed(0) })}
          </span>
        )}
      </div>

      <div className="buy-round-list">
        {rounds.map((r) => (
          <div key={r.roundNumber} className={`buy-round-row ${r.verdict}`}>
            <span className="buy-round-number">R{r.roundNumber}</span>
            <span className="buy-round-weapon">
              {weaponIcons.get(r.weapon) && <img src={weaponIcons.get(r.weapon)} alt="" className="weapon-icon" />}
              {r.weapon ?? '?'}
            </span>
            <span className={`buy-round-badge ${r.verdict}`}>
              {r.verdict === 'coherent' ? t('buySim.coherent') : t('buySim.toReview')}
            </span>
            <span className="buy-round-explanation label">{r.explanation}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function BuyCalculatorSection() {
  const { t } = useTranslation();
  const weapons = useShopWeapons();
  const armors = useShopArmors();
  const agentIcons = useAgentIcons();
  const agentRoles = useAgentRoles();
  const agentAbilities = useAgentAbilities();
  const [credits, setCredits] = useState(4000);
  const [agent, setAgent] = useState('');

  const recommendation = useMemo(() => {
    if (weapons.length === 0 || armors.length === 0) return null;
    const role = agentRoles.get(agent)?.roleName ?? null;
    return recommendBuy(t, credits, weapons, armors, role);
  }, [t, credits, weapons, armors, agent, agentRoles]);

  const abilityBudget = useMemo(() => {
    if (!agent) return null;
    return agentAbilityBudget(agent, agentAbilities.get(agent));
  }, [agent, agentAbilities]);

  return (
    <>
      <div className="buy-calc-panel">
        <label className="buy-calc-field">
          {t('buySim.availableCredits')}
          <input
            type="number"
            min="0"
            step="50"
            value={credits}
            onChange={(e) => setCredits(Math.max(0, Number(e.target.value)))}
          />
        </label>
        <select value={agent} onChange={(e) => setAgent(e.target.value)}>
          <option value="">{t('buySim.chooseAgentOptional')}</option>
          {[...agentIcons.keys()].sort().map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {recommendation && (
        <div className="buy-recommendation">
          {recommendation.weapon || recommendation.shield ? (
            <div className="gs-figures fm-figures fm-figures-3">
              <div className="gs-figure">
                <span className="gs-figure-label">{recommendation.weapon ? t('buySim.creditsSuffix', { cost: recommendation.weapon.cost }) : '—'}</span>
                <span className="gs-figure-value">{recommendation.weapon?.name ?? t('buySim.noWeapon')}</span>
              </div>
              <div className="gs-figure">
                <span className="gs-figure-label">{recommendation.shield ? t('buySim.creditsSuffix', { cost: recommendation.shield.cost }) : '—'}</span>
                <span className="gs-figure-value">{recommendation.shield?.name ?? t('buySim.noShield')}</span>
              </div>
              <div className="gs-figure">
                <span className="gs-figure-label">{t('buySim.remainingCredits')}</span>
                <span className="gs-figure-value">{recommendation.remaining}</span>
              </div>
            </div>
          ) : (
            <p>{t('buySim.tooLowBudget')}</p>
          )}
          {recommendation.roleNote && <p className="label" style={{ marginTop: '0.75rem' }}>{recommendation.roleNote}</p>}
        </div>
      )}

      {agent && (
        <div className="buy-ability-section">
          <h4>{t('buySim.abilitiesOf', { agent })}</h4>
          {abilityBudget && abilityBudget.length > 0 ? (
            <>
              {abilityBudget.map((a) => {
                const affordable = recommendation ? a.cost <= recommendation.remaining : false;
                return (
                  <div key={a.name} className={`buy-ability-row ${recommendation ? (affordable ? 'affordable' : 'unaffordable') : ''}`}>
                    <img src={a.icon} alt="" className="wiki-ability-icon" />
                    <span className="buy-ability-name">{a.name}</span>
                    <span className="buy-ability-cost">{a.cost === 0 ? t('buySim.free') : t('buySim.creditsSuffix', { cost: a.cost })}</span>
                    {recommendation && <span className="buy-ability-status"><Icon icon={affordable ? CheckCircle2 : XCircle} size={16} /></span>}
                  </div>
                );
              })}
              <p className="label" style={{ marginTop: '0.6rem' }}>
                {t('buySim.costsResearched', {
                  date: ABILITY_COSTS_SOURCE_DATE,
                  suffix: recommendation
                    ? t('buySim.costsResearchedSuffixWithRemaining', { remaining: recommendation.remaining })
                    : t('buySim.costsResearchedSuffixPeriod'),
                })}
              </p>
            </>
          ) : (
            <p className="label">{t('buySim.noAbilityCosts', { agent })}</p>
          )}
        </div>
      )}

      <p className="label buy-calc-disclaimer">{t('buySim.disclaimer')}</p>
    </>
  );
}

function BuySimulator({ settings, matches, loading }) {
  const { t } = useTranslation();
  const { platforms, platform, setPlatform, filteredMatches } = usePlatformFilter(matches);

  if (matches.length === 0) {
    if (loading) return <LoadingState />;
    return <p>{t('buySim.noMatchesYet')}</p>;
  }

  return (
    <div>
      <PlatformFilterToggle platforms={platforms} platform={platform} onChange={setPlatform} />

      <CollapsibleCard id="buySim.roundAnalysis" title={t('buySim.roundAnalysisTitle')}>
        <p className="label">{t('buySim.roundAnalysisHint')}</p>
        <BuyAnalysisSection settings={settings} matches={filteredMatches} />
      </CollapsibleCard>

      <CollapsibleCard id="buySim.calculator" title={t('buySim.calculatorTitle')}>
        <p className="label">{t('buySim.calculatorHint')}</p>
        <BuyCalculatorSection />
      </CollapsibleCard>
    </div>
  );
}

export default BuySimulator;
