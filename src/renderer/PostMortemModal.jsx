import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, CheckCircle2, Minus, XCircle, ScanFace, Gauge, Swords, Crosshair, Check, X } from 'lucide-react';
import { POST_MORTEM_QUESTIONS, ANSWER_LEVELS, computeActualAnswers, gradeAnswers, buildComparisonText } from './postMortem.js';
import { findMe, resultLabel, resultLabelKey, matchScore, excludeDeathmatch } from './valorantStats.js';
import { useAgentIcons, useAgentPortraits } from './agentIcons.js';
import { useMapImages } from './mapImages.js';
import Icon from './Icon.jsx';

const RESULT_ICONS = { unknown: Info, correct: CheckCircle2, close: Minus, incorrect: XCircle };
const QUESTION_ICONS = { overall: Gauge, duels: Swords, aim: Crosshair };
// Teinte et icône de chaque niveau de réponse : le vert/ambre/rouge de l'app
// plutôt qu'un bouton gris identique pour les trois.
const LEVEL_STYLE = { oui: { icon: Check, tone: 'good' }, moyen: { icon: Minus, tone: 'mid' }, non: { icon: X, tone: 'bad' } };

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function PostMortemModal({ settings, matches }) {
  const { t } = useTranslation();
  const agentIcons = useAgentIcons();
  const agentPortraits = useAgentPortraits();
  const mapImages = useMapImages();

  const latestMatch = matches[0] ?? null;
  // Combat à mort & co : pas de vraie victoire ni de duels d'équipe, les trois
  // questions n'y ont pas de sens (la fenêtre s'ouvrait sur « Sans équipe »).
  const eligible = latestMatch ? excludeDeathmatch([latestMatch]).length > 0 : false;
  const matchId = eligible ? latestMatch?.metadata?.matchid ?? null : null;

  const [status, setStatus] = useState('hidden'); // hidden | prompting | answered
  const [answers, setAnswers] = useState({});
  const [graded, setGraded] = useState(null);
  const [dismissed, setDismissed] = useState(() => new Set());

  useEffect(() => {
    if (!matchId || dismissed.has(matchId)) {
      setStatus('hidden');
      return undefined;
    }

    let cancelled = false;
    window.electronAPI.getMatchAssessment(matchId).then((existing) => {
      if (cancelled) return;
      setStatus(existing ? 'hidden' : 'prompting');
      setAnswers({});
      setGraded(null);
    });
    return () => {
      cancelled = true;
    };
  }, [matchId, dismissed]);

  if (status === 'hidden' || !latestMatch) return null;

  function handleDismiss() {
    setDismissed((prev) => new Set(prev).add(matchId));
  }

  function selectAnswer(questionId, levelId) {
    setAnswers((prev) => ({ ...prev, [questionId]: levelId }));
  }

  const answeredCount = POST_MORTEM_QUESTIONS.filter((q) => answers[q.id]).length;
  const allAnswered = answeredCount === POST_MORTEM_QUESTIONS.length;

  async function handleSubmit() {
    const actual = computeActualAnswers(latestMatch, matches, settings.name, settings.tag);
    const results = gradeAnswers(answers, actual ?? {});
    try {
      await window.electronAPI.saveMatchAssessment(
        matchId,
        todayKey(),
        latestMatch.metadata?.map ?? null,
        JSON.stringify(results),
      );
    } catch (err) {
      console.error('[postmortem] échec de l\'enregistrement :', err.message);
      return;
    }
    setGraded(results);
    setStatus('answered');
  }

  // Bannière du match : de QUELLE partie on parle. Pas de K/D/A ici, la
  // question est justement posée avant que le joueur voie ses stats.
  const me = findMe(latestMatch, settings.name, settings.tag);
  const label = me ? resultLabel(latestMatch, me) : null;
  const labelKey = label ? resultLabelKey(label) : null;
  const score = me ? matchScore(latestMatch, me) : null;
  const tone = label === 'Victoire' ? 'win' : label === 'Défaite' ? 'loss' : 'neutral';
  const mapName = latestMatch.metadata?.map ?? null;
  const mapSplash = mapName ? mapImages.get(mapName) : null;
  const agent = me?.character ?? null;
  const agentIcon = agent ? agentIcons.get(agent) : null;
  const agentPortrait = agent ? agentPortraits.get(agent) : null;
  const [myScore, theirScore] = score ? score.split('-') : [null, null];

  const hero = (
    <div className={`pm-hero ${tone}`}>
      {mapSplash && <img className="pm-hero-map" src={mapSplash} alt="" />}
      <div className="pm-hero-shade" />
      {agentPortrait && <img className="pm-hero-agent" src={agentPortrait} alt="" />}
      <div className="pm-hero-content">
        <div className="pm-eyebrow">
          <Icon icon={ScanFace} size={14} />
          {status === 'answered' ? t('postmortem.resultTitle') : t('postmortem.promptTitle')}
        </div>
        <div className="pm-hero-result">
          {label && label !== '?' && <span className="pm-hero-label">{labelKey ? t(labelKey) : label}</span>}
          {myScore !== null && (
            <span className="pm-hero-score">
              <b>{myScore}</b>
              <i>–</i>
              {theirScore}
            </span>
          )}
        </div>
        <div className="pm-hero-meta">
          {agentIcon && <img src={agentIcon} alt="" />}
          <span>{[agent, mapName, latestMatch.metadata?.mode].filter(Boolean).join(' · ')}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="postmortem-backdrop">
      <div className="postmortem-modal">
        {hero}

        {status === 'prompting' ? (
          <div className="pm-body">
            <div className="pm-intro">
              <p>{t('postmortem.promptHint')}</p>
              <span className="pm-count">
                <b>{answeredCount}</b>/{POST_MORTEM_QUESTIONS.length}
              </span>
            </div>
            <div className="pm-progress" aria-hidden="true">
              <span style={{ width: `${(answeredCount / POST_MORTEM_QUESTIONS.length) * 100}%` }} />
            </div>

            {POST_MORTEM_QUESTIONS.map((q, index) => (
              <div key={q.id} className={`pm-question${answers[q.id] ? ' answered' : ''}`}>
                <div className="pm-question-head">
                  <span className="pm-question-num">{String(index + 1).padStart(2, '0')}</span>
                  <Icon icon={QUESTION_ICONS[q.id]} size={16} />
                  <p>{t(q.textKey)}</p>
                </div>
                <div className="pm-segmented" role="radiogroup" aria-label={t(q.textKey)}>
                  {ANSWER_LEVELS.map((level) => {
                    const style = LEVEL_STYLE[level.id];
                    const selected = answers[q.id] === level.id;
                    return (
                      <button
                        key={level.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={`pm-option ${style.tone}${selected ? ' selected' : ''}`}
                        onClick={() => selectAnswer(q.id, level.id)}
                      >
                        <Icon icon={style.icon} size={14} />
                        {t(level.labelKey)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="pm-actions">
              <button type="button" className="pm-later" onClick={handleDismiss}>
                {t('postmortem.later')}
              </button>
              <button type="button" className="refresh pm-submit" onClick={handleSubmit} disabled={!allAnswered}>
                {t('postmortem.seeResult')}
              </button>
            </div>
          </div>
        ) : (
          <div className="pm-body">
            <div className="pm-verdict">
              <span className="pm-verdict-num">
                {graded.filter((r) => r.correct).length}
                <small>/{graded.filter((r) => r.correct !== null).length}</small>
              </span>
              <span className="pm-verdict-label">{t('postmortem.summaryLabel')}</span>
            </div>

            {graded.map((r) => {
              const state = r.correct === null ? 'unknown' : r.correct ? 'correct' : r.close ? 'close' : 'incorrect';
              const userLevel = ANSWER_LEVELS.find((l) => l.id === r.userAnswer);
              const actualLevel = ANSWER_LEVELS.find((l) => l.id === r.actual);
              return (
                <div key={r.id} className={`pm-result ${state}`}>
                  <div className="pm-result-head">
                    <Icon icon={QUESTION_ICONS[r.id]} size={15} />
                    <span>{t(r.textKey)}</span>
                    <Icon icon={RESULT_ICONS[state]} size={17} className="pm-result-state" />
                  </div>
                  <div className="pm-compare">
                    <div className={`pm-pill ${LEVEL_STYLE[r.userAnswer]?.tone ?? ''}`}>
                      <small>{t('postmortem.yourFeeling')}</small>
                      {userLevel ? t(userLevel.labelKey) : '?'}
                    </div>
                    <span className="pm-compare-arrow">→</span>
                    <div className={`pm-pill ${actualLevel ? LEVEL_STYLE[r.actual].tone : ''}`}>
                      <small>{t('postmortem.reality')}</small>
                      {actualLevel ? t(actualLevel.labelKey) : '?'}
                    </div>
                  </div>
                  <p className="pm-result-detail">{buildComparisonText(t, r)}</p>
                </div>
              );
            })}

            <div className="pm-actions end">
              <button type="button" className="refresh pm-submit" onClick={handleDismiss}>
                {t('postmortem.close')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PostMortemModal;
