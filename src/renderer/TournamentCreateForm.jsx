import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from './supabaseClient.js';
import { useRankLadder } from './rankData.js';

// Formulaire de création d'un tournoi — utilisé par AdminPage.jsx (crée un
// tournoi "officiel", is_official posé côté base par un trigger sur
// created_by) ET par TournamentsTab.jsx (n'importe quel compte connecté peut
// créer un tournoi "communauté", voir sql/tournaments_community.sql pour les
// policies). Extrait de AdminPage.jsx pour être partagé tel quel entre les
// deux, plutôt que dupliqué.
// <input type="datetime-local"> donne une heure LOCALE sans fuseau ("2026-09-25T20:00").
// Envoyée telle quelle à une colonne timestamptz, Postgres la lit dans SON
// fuseau (UTC) : 20:00 saisies à Paris devenaient 20:00 UTC = 22:00 heure de
// Paris, donc une date limite décalée de 1 à 2 h. new Date(valeur) l'interprète
// dans le fuseau de l'appareil, toISOString() la convertit en instant précis.
function localInputToIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function TournamentCreateForm({ myId, onCreated }) {
  const { t } = useTranslation();
  const ladder = useRankLadder();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [gameMode, setGameMode] = useState('classic');
  const [maxTeams, setMaxTeams] = useState(8);
  const [registrationDeadline, setRegistrationDeadline] = useState('');
  const [startDate, setStartDate] = useState('');
  // Critères de rang — mêmes conventions que team_listings (tier numérique,
  // vide = pas de contrainte) : servent au filtre de recherche côté
  // communauté (voir TournamentsTab.jsx).
  const [rankMin, setRankMin] = useState('');
  const [rankMax, setRankMax] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || maxTeams < 2) return;
    setSaving(true);
    setError(null);

    const { error: insertError } = await supabase.from('tournaments').insert({
      name: name.trim(),
      description: description.trim() || null,
      game_mode: gameMode,
      max_teams: maxTeams,
      registration_deadline: localInputToIso(registrationDeadline),
      start_date: localInputToIso(startDate),
      rank_min: rankMin ? Number(rankMin) : null,
      rank_max: rankMax ? Number(rankMax) : null,
      created_by: myId,
    });

    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }

    setName('');
    setDescription('');
    setGameMode('classic');
    setMaxTeams(8);
    setRegistrationDeadline('');
    setStartDate('');
    setRankMin('');
    setRankMax('');
    onCreated();
  }

  return (
    <form className="tournament-create-form" onSubmit={handleSubmit}>
      <h2>{t('admin.tournaments.createTitle')}</h2>

      <label>
        {t('admin.tournaments.name')}
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
      </label>

      <label>
        {t('admin.tournaments.description')}
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={500} />
      </label>

      <label>
        {t('admin.tournaments.gameMode')}
        <select value={gameMode} onChange={(e) => setGameMode(e.target.value)}>
          <option value="classic">{t('tournaments.gameMode.classic')}</option>
          <option value="2v2">{t('tournaments.gameMode.2v2')}</option>
          <option value="1v1">{t('tournaments.gameMode.1v1')}</option>
        </select>
      </label>

      <label>
        {t('admin.tournaments.maxTeams')}
        <input
          type="number"
          min={2}
          max={128}
          value={maxTeams}
          onChange={(e) => setMaxTeams(Number(e.target.value))}
          required
        />
      </label>
      {/* Pas limité aux puissances de 2 : la génération du bracket (étape
          suivante) calculera les "byes" nécessaires pour les autres nombres. */}
      <p className="label">{t('admin.tournaments.maxTeamsHint')}</p>

      <label>
        {t('admin.tournaments.registrationDeadline')}
        <input
          type="datetime-local"
          value={registrationDeadline}
          onChange={(e) => setRegistrationDeadline(e.target.value)}
        />
      </label>

      <label>
        {t('admin.tournaments.startDate')}
        <input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </label>

      <label>
        {t('admin.tournaments.rankRange')}
        <div className="tournament-rank-range">
          <select value={rankMin} onChange={(e) => setRankMin(e.target.value)}>
            <option value="">{t('teamListings.noMin')}</option>
            {ladder.map((tier) => (
              <option key={tier.tier} value={tier.tier}>{tier.tierName}</option>
            ))}
          </select>
          <select value={rankMax} onChange={(e) => setRankMax(e.target.value)}>
            <option value="">{t('teamListings.noMax')}</option>
            {ladder.map((tier) => (
              <option key={tier.tier} value={tier.tier}>{tier.tierName}</option>
            ))}
          </select>
        </div>
      </label>

      {error && <p className="error-banner">{error}</p>}

      <button type="submit" disabled={saving}>
        {saving ? t('admin.tournaments.creating') : t('admin.tournaments.create')}
      </button>
    </form>
  );
}

export default TournamentCreateForm;
