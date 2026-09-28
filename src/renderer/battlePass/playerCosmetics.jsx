import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient.js';

// Cosmétiques publics équipés par les joueurs (titre et carte du Battle Pass),
// affichés à côté de leur nom.
//
// Ils sont lus à part des profils (PROFILE_FIELDS) : si la migration du
// battle pass n'est pas appliquée, les colonnes n'existent pas et une lecture
// jointe casserait la liste d'amis. Ici l'échec est silencieux : on n'affiche
// simplement rien.
//
// Les demandes du même instant sont regroupées en UNE requête, et le résultat
// est gardé pour la session : un classement de 20 lignes ne coûte qu'un appel.

const cache = new Map(); // userId -> { title, card }
const listeners = new Set();
let pending = new Set();
let scheduled = false;
let disabled = false;

const EMPTY = { title: null, card: null };
const notify = () => listeners.forEach((fn) => fn());

async function flush() {
  scheduled = false;
  const ids = [...pending];
  pending = new Set();
  if (ids.length === 0) return;
  const { data, error } = await supabase.from('profiles').select('id, title_id, card_id').in('id', ids);
  if (error) {
    // Colonnes absentes (migration non appliquée) ou réseau : on n'insiste pas.
    console.error(`[battle-pass] lecture des cosmétiques : ${error.message}`);
    disabled = true;
    ids.forEach((id) => cache.set(id, EMPTY));
  } else {
    const found = new Map((data ?? []).map((row) => [row.id, { title: row.title_id ?? null, card: row.card_id ?? null }]));
    ids.forEach((id) => cache.set(id, found.get(id) ?? EMPTY));
  }
  notify();
}

function request(userId) {
  if (disabled || cache.has(userId)) return;
  pending.add(userId);
  if (!scheduled) {
    scheduled = true;
    setTimeout(flush, 0);
  }
}

// À appeler quand le joueur change SES cosmétiques : l'affichage se met à jour
// sans attendre un rechargement. kind : 'title' | 'card'.
export function setKnownCosmetic(userId, kind, rewardId) {
  if (!userId) return;
  cache.set(userId, { ...(cache.get(userId) ?? EMPTY), [kind]: rewardId ?? null });
  notify();
}

function usePlayerCosmetics(userId) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!userId) return undefined;
    const listener = () => force((n) => n + 1);
    listeners.add(listener);
    request(userId);
    return () => listeners.delete(listener);
  }, [userId]);
  return (userId && cache.get(userId)) || EMPTY;
}

export const usePlayerTitle = (userId) => usePlayerCosmetics(userId).title;
export const usePlayerCard = (userId) => usePlayerCosmetics(userId).card;

export const titleName = (t, titleId) => (titleId ? t(`battlePass.titles.${titleId.replace(/^title:/, '')}`, { defaultValue: '' }) : '');

// « Recrue » à côté d'un pseudo ; rien si le joueur n'a pas de titre.
export function PlayerTitle({ userId, className = '' }) {
  const { t } = useTranslation();
  const name = titleName(t, usePlayerTitle(userId));
  if (!name) return null;
  return <span className={`player-title ${className}`.trim()}>« {name} »</span>;
}
