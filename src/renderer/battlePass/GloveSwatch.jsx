import { Hand } from 'lucide-react';
import { handSwatch } from '../handSkins.js';

// Pastille d'un skin de gants dans les menus : le tissu de la manche en fond,
// le gant et son liseré. Les couleurs viennent de la même palette que le jeu.
export default function GloveSwatch({ skin, size = 26, className = '' }) {
  const c = handSwatch(skin);
  return (
    <span
      className={`glove-swatch ${className}`.trim()}
      style={{ '--g-cloth': c.cloth, '--g-glove': c.glove, '--g-plate': c.plate, '--g-accent': c.accent }}
    >
      <Hand size={size} strokeWidth={1.8} />
    </span>
  );
}
