import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowDown, ArrowUp, BarChart3, CheckCircle2, Clock, Copy, Crosshair, Flame, Map, Pencil, Play, Plus, Radio, Square, Target, Trash2, TrendingDown, TrendingUp, X } from 'lucide-react';
import Icon from './Icon.jsx';
import { MODES } from './aimTrainerModes.js';
import { buildSessionPlan } from './sessionPlan.js';
import { buildReport, compareReports, hydratePlan, liveProgress, matchesSince, pickPreviousReport, serializePlan, warmupModeIds, warmupProgress } from './sessionProgram.js';
import { BUILT_IN_TEMPLATES, TEMPLATE_LIMITS, VALORANT_WARMUP_OPTIONS, applyTemplate, estimateWarmupMinutes, loadTemplates, sanitizeTemplate, saveTemplates } from './sessionTemplates.js';
import LoadingState from './LoadingState.jsx';
import PlatformFilterToggle from './PlatformFilterToggle.jsx';
import usePlatformFilter from './usePlatformFilter.js';
import CollapsibleCard from './CollapsibleCard.jsx';

// Exercices proposables en échauffement : les modes d'entraînement génériques
// (ni armes spécifiques comme le sniper, ni arènes ou situations).
const WARMUP_MODE_IDS = Object.entries(MODES)
  .filter(([id, mode]) => id !== 'custom' && !mode.sniper && !mode.arena)
  .map(([id]) => id);
const VALID_MODES = new Set(WARMUP_MODE_IDS);
const durationOfMode = (id) => MODES[id]?.preset?.duration;

// « Deathmatch ×2 » pour une étape suivie, « Champ de tir 5 min » sinon.
function valorantStepLabel(t, step) {
  const option = VALORANT_WARMUP_OPTIONS.find((o) => o.id === step.mode);
  const name = t(`session.valorantModes.${step.mode}`);
  return option?.tracked ? `${name} ×${step.amount}` : `${name} ${step.amount} min`;
}

function buildChecklist(t, plan, latestStrategy, onLaunchWarmup, warmupSteps) {
  const modes = plan.warmupModes ?? [];
  const items = [
    {
      id: 'warmup',
      icon: Flame,
      title: t('session.warmupTitle', { count: plan.warmup.minutes }),
      detail: modes.length > 0 ? `${plan.warmup.reason} — ${modes.map((id) => t(MODES[id]?.labelKey)).join(' → ')}` : plan.warmup.reason,
      level: 'info',
      action: modes.length > 0 ? { label: t('session.launchWarmup'), onClick: () => onLaunchWarmup(modes) } : null,
      // Étapes dans Valorant : suivies automatiquement quand ce sont des parties.
      progress: warmupSteps.map((step) => ({
        key: step.mode,
        label: step.tracked ? `${t(`session.valorantModes.${step.mode}`)} ${step.played}/${step.target}` : valorantStepLabel(t, { mode: step.mode, amount: step.target }),
        done: step.tracked && step.done,
        tracked: step.tracked,
      })),
    },
  ];

  if (plan.targetMap) {
    items.push(
      latestStrategy
        ? {
            id: 'strategy',
            icon: Map,
            title: t('session.strategyReviewTitle', { name: latestStrategy.name, map: plan.targetMap }),
            detail: t('session.strategyReviewDetail'),
            level: 'info',
          }
        : {
            id: 'strategy',
            icon: Map,
            title: t('session.noStrategyTitle', { map: plan.targetMap }),
            detail: t('session.noStrategyDetail'),
            level: 'info',
          },
    );
  }

  items.push(
    plan.tilt.isTilted
      ? {
          id: 'tilt',
          icon: AlertTriangle,
          title: t('session.tiltedTitle'),
          detail: t('session.tiltedDetail', { count: plan.matchCount }),
          level: 'warning',
        }
      : {
          id: 'tilt',
          icon: CheckCircle2,
          title: t('session.calmTitle'),
          detail: t('session.calmDetail'),
          level: 'good',
        },
  );

  items.push({
    id: 'objective',
    icon: Target,
    title: t('session.objectiveTitle'),
    detail: plan.objective,
    level: 'info',
  });

  return items;
}

function formatDuration(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} h ${String(minutes).padStart(2, '0')}` : `${minutes} min`;
}

const parseRow = (row) => ({
  id: row.id,
  startedAt: row.started_at,
  endedAt: row.ended_at,
  plan: JSON.parse(row.plan_json),
  result: JSON.parse(row.result_json),
});

// Écart avec la session précédente : flèche verte quand ça s'améliore.
function Delta({ value, unit = '', digits = 0 }) {
  if (value === null || value === undefined || Math.abs(value) < 10 ** -(digits + 1)) return null;
  const up = value > 0;
  return (
    <span className="wrapped-delta" data-up={up ? 'true' : 'false'}>
      <Icon icon={up ? TrendingUp : TrendingDown} size={11} />
      {up ? '+' : ''}
      {value.toFixed(digits)}
      {unit}
    </span>
  );
}

function Tile({ label, value, sub, delta }) {
  return (
    <div className="sg-tile">
      <b>{value}</b>
      <small>{label}</small>
      {sub && <em>{sub}</em>}
      {delta}
    </div>
  );
}

function Checklist({ items, checked, onToggle }) {
  return (
    <div className="session-checklist">
      {items.map((item) => (
        <label key={item.id} className={`session-check-item ${item.level} ${checked[item.id] ? 'done' : ''}`}>
          <input type="checkbox" checked={!!checked[item.id]} onChange={() => onToggle(item.id)} />
          <span className="session-check-icon-badge"><Icon icon={item.icon} size={16} /></span>
          <span className="session-check-body">
            <span className="session-check-title">{item.title}</span>
            <span className="session-check-detail">{item.detail}</span>
            {item.progress?.length > 0 && (
              <span className="sg-wu-chips">
                {item.progress.map((chip) => (
                  <span key={chip.key} className="sg-wu-chip" data-done={chip.done ? 'true' : 'false'} data-tracked={chip.tracked ? 'true' : 'false'}>
                    {chip.done && <Icon icon={CheckCircle2} size={12} />} {chip.label}
                  </span>
                ))}
              </span>
            )}
            {item.action && (
              <button
                type="button"
                className="sg-warmup-btn"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  item.action.onClick();
                }}
              >
                <Icon icon={Crosshair} size={14} /> {item.action.label}
              </button>
            )}
          </span>
        </label>
      ))}
    </div>
  );
}

const newDraft = (base = {}) => ({
  id: `user:${Date.now()}`,
  name: '',
  warmupMinutes: 10,
  warmupModes: [],
  warmupValorant: [],
  matchCount: 3,
  hsTarget: 25,
  pauseLosses: 3,
  targetMap: null,
  ...base,
});

// Éditeur d'un modèle : les réglages de la session, dont l'échauffement (durée
// et liste d'exercices de l'Aim Trainer, lancée d'un clic depuis la checklist).
function TemplateEditor({ draft, setDraft, maps, isNew, onSave, onCancel, onDelete, t }) {
  const patch = (changes) => setDraft((d) => ({ ...d, ...changes }));
  const number = (key, [min, max]) => (e) => patch({ [key]: e.target.value === '' ? '' : Math.min(max, Math.max(min, Number(e.target.value))) });
  const modes = draft.warmupModes;
  const move = (index, delta) => {
    const next = [...modes];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    patch({ warmupModes: next });
  };
  const estimate = estimateWarmupMinutes(modes, durationOfMode);
  const valorant = draft.warmupValorant ?? [];
  const usedValorant = new Set(valorant.map((step) => step.mode));
  const setAmount = (mode, value) =>
    patch({ warmupValorant: valorant.map((step) => (step.mode === mode ? { ...step, amount: value === '' ? '' : Number(value) } : step)) });

  return (
    <div className="sg-editor">
      <label>
        {t('session.editor.name')}
        <input type="text" maxLength={TEMPLATE_LIMITS.name} value={draft.name} placeholder={t('session.editor.namePlaceholder')} onChange={(e) => patch({ name: e.target.value })} />
      </label>

      <div className="sg-editor-grid">
        <label>
          {t('session.editor.warmupMinutes')}
          <input type="number" min={TEMPLATE_LIMITS.warmupMinutes[0]} max={TEMPLATE_LIMITS.warmupMinutes[1]} value={draft.warmupMinutes} onChange={number('warmupMinutes', TEMPLATE_LIMITS.warmupMinutes)} />
        </label>
        <label>
          {t('session.editor.matchCount')}
          <input type="number" min={TEMPLATE_LIMITS.matchCount[0]} max={TEMPLATE_LIMITS.matchCount[1]} value={draft.matchCount} onChange={number('matchCount', TEMPLATE_LIMITS.matchCount)} />
        </label>
        <label>
          {t('session.editor.hsTarget')}
          <input type="number" min={TEMPLATE_LIMITS.hsTarget[0]} max={TEMPLATE_LIMITS.hsTarget[1]} value={draft.hsTarget} onChange={number('hsTarget', TEMPLATE_LIMITS.hsTarget)} />
        </label>
        <label>
          {t('session.editor.pauseLosses')}
          <select value={draft.pauseLosses} onChange={(e) => patch({ pauseLosses: Number(e.target.value) })}>
            {Array.from({ length: TEMPLATE_LIMITS.pauseLosses[1] - TEMPLATE_LIMITS.pauseLosses[0] + 1 }, (_, i) => TEMPLATE_LIMITS.pauseLosses[0] + i).map((n) => (
              <option key={n} value={n}>{t('session.editor.afterLosses', { count: n })}</option>
            ))}
          </select>
        </label>
        <label>
          {t('session.editor.targetMap')}
          <select value={draft.targetMap ?? ''} onChange={(e) => patch({ targetMap: e.target.value || null })}>
            <option value="">{t('session.editor.mapAuto')}</option>
            {maps.map((map) => (
              <option key={map} value={map}>{map}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="sg-editor-modes">
        <span className="sg-editor-title">{t('session.editor.exercises')}</span>
        <p className="sg-hint">{t('session.editor.exercisesHint')}</p>
        {modes.length > 0 && (
          <ol>
            {modes.map((id, index) => (
              <li key={`${id}-${index}`}>
                <span className="sg-editor-mode-n">{index + 1}</span>
                <span className="sg-editor-mode-name">{t(MODES[id]?.labelKey)}</span>
                <button type="button" className="sg-icon-btn" onClick={() => move(index, -1)} disabled={index === 0} aria-label={t('session.editor.moveUp')}>
                  <Icon icon={ArrowUp} size={14} />
                </button>
                <button type="button" className="sg-icon-btn" onClick={() => move(index, 1)} disabled={index === modes.length - 1} aria-label={t('session.editor.moveDown')}>
                  <Icon icon={ArrowDown} size={14} />
                </button>
                <button type="button" className="sg-icon-btn" onClick={() => patch({ warmupModes: modes.filter((_, i) => i !== index) })} aria-label={t('session.editor.remove')}>
                  <Icon icon={X} size={14} />
                </button>
              </li>
            ))}
          </ol>
        )}
        <div className="sg-editor-add">
          <select
            value=""
            disabled={modes.length >= TEMPLATE_LIMITS.warmupModes}
            onChange={(e) => e.target.value && patch({ warmupModes: [...modes, e.target.value] })}
          >
            <option value="">{t('session.editor.addExercise')}</option>
            {WARMUP_MODE_IDS.map((id) => (
              <option key={id} value={id}>{t(MODES[id].labelKey)}</option>
            ))}
          </select>
          {modes.length > 0 && <small>{t('session.editor.estimate', { count: estimate })}</small>}
        </div>
      </div>

      <div className="sg-editor-modes">
        <span className="sg-editor-title">{t('session.editor.valorantTitle')}</span>
        <p className="sg-hint">{t('session.editor.valorantHint')}</p>
        {valorant.length > 0 && (
          <ol>
            {valorant.map((step) => {
              const option = VALORANT_WARMUP_OPTIONS.find((o) => o.id === step.mode);
              return (
                <li key={step.mode}>
                  <span className="sg-editor-mode-name">{t(`session.valorantModes.${step.mode}`)}</span>
                  <input
                    className="sg-editor-amount"
                    type="number"
                    min={option.amountRange[0]}
                    max={option.amountRange[1]}
                    value={step.amount}
                    onChange={(e) => setAmount(step.mode, e.target.value)}
                  />
                  <span className="sg-editor-unit">{option.tracked ? t('session.editor.games') : t('session.editor.minutes')}</span>
                  <button type="button" className="sg-icon-btn" onClick={() => patch({ warmupValorant: valorant.filter((s) => s.mode !== step.mode) })} aria-label={t('session.editor.remove')}>
                    <Icon icon={X} size={14} />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        <div className="sg-editor-add">
          <select
            value=""
            disabled={valorant.length >= TEMPLATE_LIMITS.warmupValorant || usedValorant.size >= VALORANT_WARMUP_OPTIONS.length}
            onChange={(e) => {
              const option = VALORANT_WARMUP_OPTIONS.find((o) => o.id === e.target.value);
              if (option) patch({ warmupValorant: [...valorant, { mode: option.id, amount: option.amountRange[0] }] });
            }}
          >
            <option value="">{t('session.editor.addValorant')}</option>
            {VALORANT_WARMUP_OPTIONS.filter((o) => !usedValorant.has(o.id)).map((o) => (
              <option key={o.id} value={o.id}>{t(`session.valorantModes.${o.id}`)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="sg-editor-actions">
        <button type="button" className="refresh" onClick={onSave} disabled={!draft.name.trim()}>
          {t('session.editor.save')}
        </button>
        <button type="button" onClick={onCancel}>{t('session.editor.cancel')}</button>
        {!isNew && (
          <button type="button" className="sg-danger" onClick={onDelete}>
            <Icon icon={Trash2} size={14} /> {t('session.editor.delete')}
          </button>
        )}
      </div>
    </div>
  );
}

// Session guidée : un programme en trois temps — avant (plan + checklist, avec
// échauffement), pendant (suivi des parties jouées depuis le lancement, conseils)
// et après (bilan comparé à la session précédente, conservé dans l'historique).
// Le plan peut venir d'un modèle réutilisable (voir sessionTemplates.js). Le suivi
// se met à jour à chaque synchronisation des parties (bouton Rafraîchir).
function SessionGuide({ settings, matches, loading: matchesLoading, myId, apiKey, rank, profile }) {
  const { t, i18n } = useTranslation();
  const { platforms, platform, setPlatform, filteredMatches } = usePlatformFilter(matches);
  const accountKey = settings?.puuid ?? settings?.name ?? 'me';
  const [plan, setPlan] = useState(null); // plan en préparation, pas encore démarré
  const [latestStrategy, setLatestStrategy] = useState(null);
  const [checked, setChecked] = useState({});
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(null); // { id, startedAt, plan } — session en cours
  const [history, setHistory] = useState([]);
  const [finished, setFinished] = useState(null); // { report, previous, sameTemplate, templateName }
  const [now, setNow] = useState(() => Date.now());
  const [templates, setTemplates] = useState(() => loadTemplates(accountKey, VALID_MODES));
  const [selectedId, setSelectedId] = useState('auto');
  const [editing, setEditing] = useState(null); // { draft, isNew }

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const loadStrategy = async (targetMap) => {
    if (!targetMap) return setLatestStrategy(null);
    const strategies = await window.electronAPI.listStrategies(targetMap);
    setLatestStrategy(strategies[0] ?? null);
  };

  // Reprend une session encore ouverte (app relancée en cours de route) et charge l'historique.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [row, rows] = await Promise.all([window.electronAPI.getActiveGuidedSession(), window.electronAPI.getGuidedSessionHistory(10)]);
      if (cancelled) return;
      setHistory(rows.map(parseRow));
      if (row) {
        const saved = JSON.parse(row.plan_json);
        setActive({ id: row.id, startedAt: row.started_at, plan: saved });
        loadStrategy(saved.targetMap);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const allTemplates = useMemo(() => [...BUILT_IN_TEMPLATES, ...templates], [templates]);
  const selectedTemplate = allTemplates.find((tpl) => tpl.id === selectedId) ?? null;
  const templateName = (tpl) => (tpl.builtin ? t(tpl.nameKey) : tpl.name);
  const maps = useMemo(
    () => [...new Set(matches.map((m) => m.metadata?.map).filter((map) => map && !map.toLowerCase().startsWith('skirmish')))].sort(),
    [matches],
  );

  const launchWarmup = (modes) => {
    window.electronAPI.openAimTrainer({
      userId: myId,
      apiKey,
      name: settings?.name,
      tag: settings?.tag,
      rank: rank ? { tierId: rank.tierId, tierName: rank.tierName, cardUuid: rank.cardUuid } : null,
      avatarCardUuid: profile?.avatar_card_uuid ?? rank?.cardUuid ?? null,
      displayName: profile?.display_name ?? null,
      playlist: modes,
    });
  };

  const viewPlan = useMemo(() => plan ?? (active ? hydratePlan(active.plan) : null), [plan, active]);

  // Parties d'échauffement dans Valorant (Deathmatch...) : cherchées depuis la
  // préparation du plan, puisque l'échauffement se fait souvent avant « Démarrer ».
  // Elles ne comptent PAS dans les parties de la session (voir matchesSince).
  const warmupSince = (savedPlan, startedAt) => {
    const since = Math.min(savedPlan?.preparedAt ?? Infinity, startedAt ?? Infinity);
    return Number.isFinite(since) ? since : Date.now();
  };
  const warmupSteps = useMemo(
    () => (viewPlan?.warmupValorant?.length ? warmupProgress(viewPlan, matches, settings.name, settings.tag, warmupSince(viewPlan, active?.startedAt)) : []),
    [viewPlan, active, matches, settings.name, settings.tag],
  );

  const checklist = useMemo(() => (viewPlan ? buildChecklist(t, viewPlan, latestStrategy, launchWarmup, warmupSteps) : []), [t, viewPlan, latestStrategy, warmupSteps]); // eslint-disable-line react-hooks/exhaustive-deps

  const progress = useMemo(() => {
    if (!active) return null;
    return liveProgress(active.plan, matchesSince(matches, active.startedAt, Infinity, warmupModeIds(active.plan)), settings.name, settings.tag);
  }, [active, matches, settings.name, settings.tag]);

  async function handlePrepare() {
    setBusy(true);
    setFinished(null);
    const base = buildSessionPlan(t, filteredMatches, settings.name, settings.tag);
    const tpl = selectedTemplate;
    const newPlan = tpl
      ? applyTemplate(base, tpl, {
          templateName: templateName(tpl),
          warmupReason: t('session.templateWarmupReason', { name: templateName(tpl) }),
          objective: t('session.objectiveNoMap', { count: tpl.matchCount, hsTarget: tpl.hsTarget }),
        })
      : base;
    setPlan({ ...newPlan, preparedAt: Date.now() });
    setChecked({});
    await loadStrategy(newPlan.targetMap);
    setBusy(false);
  }

  async function handleStart() {
    const saved = serializePlan(plan);
    const row = await window.electronAPI.startGuidedSession(JSON.stringify(saved));
    if (!row) return;
    setActive({ id: row.id, startedAt: row.started_at, plan: saved });
    setPlan(null);
    setFinished(null);
  }

  async function handleEnd() {
    const endedAt = Date.now();
    const warmup = warmupProgress(active.plan, matches, settings.name, settings.tag, warmupSince(active.plan, active.startedAt), endedAt);
    const sessionMatches = matchesSince(matches, active.startedAt, endedAt, warmupModeIds(active.plan));
    const report = buildReport(active.plan, sessionMatches, settings.name, settings.tag, active.startedAt, endedAt, warmup);
    const previous = pickPreviousReport(history, active.plan.templateId);
    await window.electronAPI.endGuidedSession(active.id, JSON.stringify(report));
    setFinished({ report, previous: previous?.result ?? null, sameTemplate: Boolean(previous?.sameTemplate), templateName: active.plan.templateName });
    setActive(null);
    setChecked({});
    const rows = await window.electronAPI.getGuidedSessionHistory(10);
    setHistory(rows.map(parseRow));
  }

  function toggleChecked(id) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function commitTemplates(next) {
    setTemplates(next);
    saveTemplates(accountKey, next);
  }

  function handleSaveTemplate() {
    const clean = sanitizeTemplate(editing.draft, VALID_MODES);
    if (!clean) return;
    const exists = templates.some((tpl) => tpl.id === clean.id);
    commitTemplates(exists ? templates.map((tpl) => (tpl.id === clean.id ? clean : tpl)) : [...templates, clean]);
    setSelectedId(clean.id);
    setEditing(null);
  }

  function handleDeleteTemplate() {
    commitTemplates(templates.filter((tpl) => tpl.id !== editing.draft.id));
    setSelectedId('auto');
    setEditing(null);
  }

  // Un modèle fourni se personnalise en en faisant une copie modifiable.
  function handleCustomize(tpl) {
    setEditing({
      isNew: true,
      draft: newDraft({
        name: `${templateName(tpl)} (${t('session.templates.copy')})`,
        warmupMinutes: tpl.warmupMinutes,
        warmupModes: tpl.warmupModes,
        warmupValorant: tpl.warmupValorant ?? [],
        matchCount: tpl.matchCount,
        hsTarget: tpl.hsTarget,
        pauseLosses: tpl.pauseLosses,
        targetMap: tpl.targetMap,
      }),
    });
  }

  if (matches.length === 0 && !active) {
    if (matchesLoading) return <LoadingState />;
    return <p>{t('session.noMatchesYet')}</p>;
  }

  const percent = (value) => (value === null || value === undefined ? '?' : `${value.toFixed(0)}%`);
  const checkedCount = Object.values(checked).filter(Boolean).length;
  const delta = finished ? compareReports(finished.report, finished.previous) : null;

  return (
    <div>
      <PlatformFilterToggle platforms={platforms} platform={platform} onChange={setPlatform} />

      {!active && (
        <CollapsibleCard id="session.intro" title={t('session.title')}>
          <p className="label">{t('session.description')}</p>
          <ol className="sg-steps">
            {[
              ['before', Target],
              ['during', Radio],
              ['after', BarChart3],
            ].map(([id, icon], index) => (
              <li key={id}>
                <span className="sg-step-n">{index + 1}</span>
                <Icon icon={icon} size={18} />
                <span>
                  <b>{t(`session.steps.${id}.title`)}</b>
                  <small>{t(`session.steps.${id}.text`)}</small>
                </span>
              </li>
            ))}
          </ol>

          <div className="sg-templates">
            <span className="sg-editor-title">{t('session.templates.title')}</span>
            <div className="sg-chips">
              <button type="button" className="sg-chip" data-active={selectedId === 'auto' ? 'true' : 'false'} onClick={() => setSelectedId('auto')}>
                {t('session.templates.auto')}
              </button>
              {allTemplates.map((tpl) => (
                <button key={tpl.id} type="button" className="sg-chip" data-active={selectedId === tpl.id ? 'true' : 'false'} onClick={() => setSelectedId(tpl.id)}>
                  {templateName(tpl)}
                </button>
              ))}
              <button type="button" className="sg-chip sg-chip-add" onClick={() => setEditing({ isNew: true, draft: newDraft() })}>
                <Icon icon={Plus} size={14} /> {t('session.templates.create')}
              </button>
            </div>

            <p className="sg-template-summary">
              {selectedTemplate
                ? [
                    selectedTemplate.builtin ? t(selectedTemplate.descKey) : null,
                    t('session.templates.summary', {
                      warmup: selectedTemplate.warmupMinutes,
                      count: selectedTemplate.matchCount,
                      losses: selectedTemplate.pauseLosses,
                    }),
                    selectedTemplate.warmupModes.length > 0 ? selectedTemplate.warmupModes.map((id) => t(MODES[id]?.labelKey)).join(' → ') : null,
                    (selectedTemplate.warmupValorant ?? []).length > 0 ? selectedTemplate.warmupValorant.map((step) => valorantStepLabel(t, step)).join(' + ') : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : t('session.templates.autoDesc')}
              {selectedTemplate &&
                (selectedTemplate.builtin ? (
                  <button type="button" className="sg-link-btn" onClick={() => handleCustomize(selectedTemplate)}>
                    <Icon icon={Copy} size={13} /> {t('session.templates.customize')}
                  </button>
                ) : (
                  <button type="button" className="sg-link-btn" onClick={() => setEditing({ isNew: false, draft: { ...selectedTemplate } })}>
                    <Icon icon={Pencil} size={13} /> {t('session.templates.edit')}
                  </button>
                ))}
            </p>
          </div>

          {editing && (
            <TemplateEditor
              draft={editing.draft}
              setDraft={(update) => setEditing((current) => ({ ...current, draft: typeof update === 'function' ? update(current.draft) : update }))}
              maps={maps}
              isNew={editing.isNew}
              onSave={handleSaveTemplate}
              onCancel={() => setEditing(null)}
              onDelete={handleDeleteTemplate}
              t={t}
            />
          )}

          <button className="refresh" onClick={handlePrepare} disabled={busy}>
            {plan || finished ? t('session.newSession') : t('session.launch')}
          </button>
        </CollapsibleCard>
      )}

      {plan && (
        <button className="refresh sg-start" onClick={handleStart}>
          <Icon icon={Play} size={16} /> {t('session.start')}
        </button>
      )}

      {active && progress && (
        <section className="sg-live" data-advice={progress.advice}>
          <header>
            <div>
              <span className="sg-eyebrow">{active.plan.templateName ? `${t('session.liveTitle')} · ${active.plan.templateName}` : t('session.liveTitle')}</span>
              <h3>{t('session.progress', { played: progress.played, target: progress.target })}</h3>
            </div>
            <span className="sg-elapsed">
              <Icon icon={Clock} size={14} /> {formatDuration(now - active.startedAt)}
            </span>
          </header>

          <div className="achievement-group-track">
            <div className="achievement-group-fill" style={{ width: `${Math.min(100, (progress.played / Math.max(1, progress.target)) * 100)}%` }} />
          </div>

          <div className="sg-tiles">
            <Tile label={t('session.tileRecord')} value={`${progress.wins}-${progress.losses}`} />
            <Tile label={t('session.tileWinrate')} value={percent(progress.winrate)} />
            <Tile label={t('session.tileKd')} value={progress.kd === null ? '?' : progress.kd.toFixed(2)} />
            <Tile label={t('session.tileHs')} value={percent(progress.hsPercent)} sub={t('session.hsTarget', { target: progress.hsTarget })} />
          </div>

          <p className="sg-advice">
            <Icon icon={progress.advice === 'pause' ? AlertTriangle : progress.advice === 'done' ? CheckCircle2 : Flame} size={16} />
            {t(`session.advice.${progress.advice}`, { remaining: Math.max(0, progress.target - progress.played), count: progress.losingStreak })}
          </p>
          <p className="sg-hint">{t('session.refreshHint')}</p>

          <button className="sg-end" onClick={handleEnd}>
            <Icon icon={Square} size={14} /> {t('session.end')}
          </button>
        </section>
      )}

      {viewPlan && (
        <CollapsibleCard
          id="session.checklist"
          title={viewPlan.templateName ? `${t('session.checklistTitle')} · ${viewPlan.templateName}` : t('session.checklistTitle')}
          headerExtra={
            <span className="achievement-group-count">
              {checkedCount}/{checklist.length}
            </span>
          }
        >
          <div className="achievement-group-track">
            <div className="achievement-group-fill" style={{ width: `${(checkedCount / checklist.length) * 100}%` }} />
          </div>
          <Checklist items={checklist} checked={checked} onToggle={toggleChecked} />
        </CollapsibleCard>
      )}

      {finished && (
        <section className="sg-report">
          <header>
            <div>
              <span className="sg-eyebrow">{finished.templateName ? `${t('session.reportEyebrow')} · ${finished.templateName}` : t('session.reportEyebrow')}</span>
              <h3>{t('session.reportTitle')}</h3>
            </div>
            <button type="button" className="sg-close" onClick={() => setFinished(null)} aria-label={t('session.close')}>
              <Icon icon={X} size={16} />
            </button>
          </header>

          {finished.report.games === 0 ? (
            <p className="label">{t('session.reportNoGames')}</p>
          ) : (
            <>
              <div className="sg-tiles">
                <Tile label={t('session.tileGames')} value={finished.report.games} sub={`${finished.report.wins}V · ${finished.report.losses}D`} delta={delta && <Delta value={delta.games} />} />
                <Tile label={t('session.tileWinrate')} value={percent(finished.report.winrate)} delta={delta && <Delta value={delta.winrate} unit=" pts" />} />
                <Tile label={t('session.tileKd')} value={finished.report.kd === null ? '?' : finished.report.kd.toFixed(2)} delta={delta && <Delta value={delta.kd} digits={2} />} />
                <Tile label={t('session.tileHs')} value={percent(finished.report.hsPercent)} delta={delta && <Delta value={delta.hsPercent} unit=" pts" />} />
              </div>

              <ul className="sg-objectives">
                <li data-ok={finished.report.objective.gamesDone ? 'true' : 'false'}>
                  <Icon icon={finished.report.objective.gamesDone ? CheckCircle2 : X} size={16} />
                  {t('session.objectiveGames', { played: finished.report.games, target: finished.report.objective.matchCount })}
                </li>
                {(finished.report.warmup ?? []).map((step) => (
                  <li key={step.mode} data-ok={step.played >= step.target ? 'true' : 'false'}>
                    <Icon icon={step.played >= step.target ? CheckCircle2 : X} size={16} />
                    {t('session.reportWarmup', { label: t(`session.valorantModes.${step.mode}`), played: step.played, target: step.target })}
                  </li>
                ))}
                <li data-ok={finished.report.objective.hsReached === null ? 'none' : finished.report.objective.hsReached ? 'true' : 'false'}>
                  <Icon icon={finished.report.objective.hsReached ? CheckCircle2 : X} size={16} />
                  {finished.report.objective.hsReached === null
                    ? t('session.objectiveHsNone', { target: finished.report.objective.hsTarget })
                    : t('session.objectiveHs', { value: finished.report.hsPercent.toFixed(0), target: finished.report.objective.hsTarget })}
                </li>
              </ul>
            </>
          )}

          <p className="sg-hint">
            {t('session.reportDuration', { time: formatDuration(finished.report.durationMs) })} ·{' '}
            {!finished.previous
              ? t('session.noPrevious')
              : finished.sameTemplate
                ? t('session.vsPreviousTemplate', { name: finished.templateName })
                : t('session.vsPrevious')}
          </p>
        </section>
      )}

      {history.length > 0 && (
        <CollapsibleCard id="session.history" title={t('session.historyTitle')}>
          <div className="sg-history">
            {history.map((row) => (
              <div key={row.id} className="sg-history-row">
                <span className="sg-history-date">
                  {new Date(row.startedAt).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })}
                  <small>{row.plan.templateName ? `${row.plan.templateName} · ` : ''}{formatDuration(row.result.durationMs)}</small>
                </span>
                <span>{t('session.historyGames', { count: row.result.games })}</span>
                <span>{row.result.games > 0 ? `${row.result.wins}V · ${row.result.losses}D` : '—'}</span>
                <span>{percent(row.result.winrate)}</span>
                <span>{row.result.kd === null ? '?' : `${row.result.kd.toFixed(2)} K/D`}</span>
              </div>
            ))}
          </div>
        </CollapsibleCard>
      )}
    </div>
  );
}

export default SessionGuide;
