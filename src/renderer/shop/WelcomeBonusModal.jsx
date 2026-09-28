import { Gem, X } from 'lucide-react';
import Icon from '../Icon.jsx';
import { ECONOMY } from './economy.js';
import './welcomeBonus.css';

// Fenêtre affichée à l'entrée dans l'Aim Trainer tant que le bonus de
// bienvenue n'a pas été réclamé (voir useShop : welcomeClaimed vient du
// registre serveur, pas d'un simple flag local — fermer sans cliquer
// « Obtenir » la fait juste réapparaître à la prochaine entrée).
export default function WelcomeBonusModal({ t, claiming, onClaim, onClose }) {
  return (
    <div className="wb-modal" role="dialog" aria-modal="true" aria-label={t('aimTrainer.shop.welcomeTitle')} onClick={onClose}>
      <div className="wb-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="wb-close" onClick={onClose} aria-label={t('aimTrainer.shop.close')}>
          <Icon icon={X} size={16} />
        </button>
        <span className="wb-gem" aria-hidden="true">
          <Icon icon={Gem} size={54} />
        </span>
        <h3>{t('aimTrainer.shop.welcomeTitle')}</h3>
        <p>{t('aimTrainer.shop.welcomeText', { amount: ECONOMY.welcomeBonus.toLocaleString() })}</p>
        <button type="button" className="wb-claim" disabled={claiming} onClick={onClaim}>
          <Icon icon={Gem} size={16} /> {t('aimTrainer.shop.welcomeClaim')}
        </button>
      </div>
    </div>
  );
}
