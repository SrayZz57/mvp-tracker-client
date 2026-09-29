import { useEffect, useState } from 'react';
import { Check, Clock, Gem, Gift } from 'lucide-react';
import Icon from '../Icon.jsx';
import { ECONOMY } from './economy.js';
import { dailyStreak, lastDays, msUntilNextDay, utcDayKey } from './dailyLogin.js';
import '../aimPages.css';
import './shop.css';
import './dailyReward.css';

// Page « Récompense quotidienne » : le joueur vient récupérer lui-même ses MVP
// Points du jour (le serveur décide, voir shop_claim_daily). Présentation seule :
// les données viennent de useShop.

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const pad = (n) => String(n).padStart(2, '0');
function countdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

export default function DailyRewardScreen({ t, shop, locale = 'fr' }) {
  const now = useNow();
  const [message, setMessage] = useState(null);

  // Comme la boutique : relit le serveur à chaque ouverture de la page.
  useEffect(() => {
    shop.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const today = utcDayKey(now);
  const days = lastDays(now, 7);
  const claimedToday = shop.dailyDays.has(today);
  const streak = dailyStreak(shop.dailyDays, now);
  const amount = ECONOMY.dailyLoginPoints;

  const claim = async () => {
    const result = await shop.claimDaily();
    if (result === 'ok') setMessage({ ok: true, text: t('aimTrainer.shop.dailyLogin.success', { amount: amount.toLocaleString() }) });
    else if (result === 'already') setMessage({ ok: false, text: t('aimTrainer.shop.dailyLogin.already') });
    else setMessage({ ok: false, text: t(result === 'unavailable' ? 'aimTrainer.shop.closed' : 'aimTrainer.shop.error') });
  };

  let body;
  if (shop.status === 'loading') body = <p className="ap-empty">{t('battlePass.state.loading')}</p>;
  else if (shop.status === 'signed-out') body = <p className="ap-empty">{t('battlePass.state.signedOut')}</p>;
  else if (shop.status === 'unavailable') body = <p className="ap-empty">{t('aimTrainer.shop.closed')}</p>;
  else if (shop.status === 'error') body = <p className="ap-empty">{t('aimTrainer.shop.error')}</p>;
  else {
    body = (
      <div className="dr-body">
        <section className="dr-card" data-claimed={claimedToday ? 'true' : 'false'}>
          <span className="dr-gem" aria-hidden="true">
            <Icon icon={claimedToday ? Check : Gift} size={46} />
          </span>
          <strong className="dr-amount">
            <Icon icon={Gem} size={26} /> +{amount.toLocaleString()}
          </strong>
          <p>{claimedToday ? t('aimTrainer.shop.dailyLogin.claimedText') : t('aimTrainer.shop.dailyLogin.readyText')}</p>
          {claimedToday ? (
            <span className="dr-next">
              <Icon icon={Clock} size={14} /> {t('aimTrainer.shop.dailyLogin.next', { time: countdown(msUntilNextDay(now)) })}
            </span>
          ) : (
            <button type="button" className="dr-claim" disabled={shop.claimingDaily} onClick={claim}>
              <Icon icon={Gem} size={17} /> {t('aimTrainer.shop.dailyLogin.claim')}
            </button>
          )}
          {message && <span className={message.ok ? 'dr-msg dr-msg-ok' : 'dr-msg'}>{message.text}</span>}
        </section>

        <section className="dr-week">
          <header>
            <span className="ap-eyebrow">{t('aimTrainer.shop.dailyLogin.week')}</span>
            <span className="dr-streak">{t('aimTrainer.shop.dailyLogin.streak', { count: streak })}</span>
          </header>
          <ul>
            {days.map((day) => {
              const done = shop.dailyDays.has(day);
              const isToday = day === today;
              const label = new Date(`${day}T12:00:00Z`).toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' });
              return (
                <li key={day} data-done={done ? 'true' : 'false'} data-today={isToday ? 'true' : 'false'}>
                  <small>{isToday ? t('aimTrainer.shop.dailyLogin.today') : label}</small>
                  <span>{done ? <Icon icon={Check} size={16} /> : <Icon icon={Gem} size={15} />}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    );
  }

  return (
    <div className="ap-screen sh-screen dr-screen">
      <header className="sh-head">
        <div className="ap-head">
          <span className="ap-eyebrow">{t('aimTrainer.title')}</span>
          <h2>{t('aimTrainer.shop.dailyLogin.title')}</h2>
          <p>{t('aimTrainer.shop.dailyLogin.subtitle')}</p>
        </div>
        {shop.status === 'ready' && (
          <div className="sh-balance">
            <Icon icon={Gem} size={26} />
            <span>
              <b>{shop.balance.toLocaleString()}</b>
              <small>{t('aimTrainer.shop.currency')}</small>
            </span>
          </div>
        )}
      </header>
      {body}
    </div>
  );
}
