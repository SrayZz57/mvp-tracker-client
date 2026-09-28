import { useRef } from 'react';
import './inputDebug.css';

// Debugger d'input manette — utile pour caler le ressenti VALORANT (voir
// ControllerCalibration.jsx). Les valeurs sont mises à jour PAR MUTATION
// DIRECTE DU DOM depuis la boucle de rendu de AimTrainerGame.jsx (même
// principe que l'overlay Dodge Flash déjà présent dans ce fichier), jamais
// via du state React — sinon un re-render à chaque frame rien que pour ce
// panneau de debug (voir la règle perf du cahier des charges).
//
// `fieldsRef.current` est rempli ici avec les nœuds DOM ; l'appelant y lit
// `.current.rawX.textContent = ...` etc. à chaque frame.
export default function InputDebugOverlay({ fieldsRef, visible }) {
  const stickRef = useRef(null);
  fieldsRef.current = fieldsRef.current ?? {};
  fieldsRef.current.stick = stickRef;

  if (!visible) return null;

  const row = (key, label) => (
    <div className="idbg-row">
      <span>{label}</span>
      <b
        ref={(el) => {
          fieldsRef.current[key] = el;
        }}
      >
        —
      </b>
    </div>
  );

  return (
    <div className="idbg-panel" aria-hidden="true">
      <div className="idbg-stick-box">
        <div className="idbg-stick-outer">
          <div className="idbg-stick-dot" ref={stickRef} />
        </div>
        <small>Stick droit</small>
      </div>
      <div className="idbg-fields">
        {row('controller', 'Manette')}
        {row('rawX', 'Raw X')}
        {row('rawY', 'Raw Y')}
        {row('processedX', 'Processed X')}
        {row('processedY', 'Processed Y')}
        {row('sens', 'Sensibilité')}
        {row('curve', 'Courbe')}
        {row('mode', 'Mode')}
        {row('deadzone', 'Deadzone')}
        {row('rotationSpeed', 'Vitesse de rotation')}
        {row('full360', 'Tour complet (360°)')}
      </div>
    </div>
  );
}
