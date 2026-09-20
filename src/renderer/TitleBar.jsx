import { useEffect, useState } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';
import appIcon from '../assets/app-icon.png';
import Icon from './Icon.jsx';

// Fenêtre principale ouverte sans cadre natif (frame: false côté main.js) —
// cette barre remplace celle de Windows, boutons compris, pour que l'app
// garde son propre style au lieu de la barre blanche par défaut.
function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    window.electronAPI.isWindowMaximized().then(setMaximized);
    return window.electronAPI.onWindowMaximizedChange(setMaximized);
  }, []);

  return (
    <div className="title-bar">
      <div className="title-bar-brand">
        <img src={appIcon} alt="" />
        <span>MVP Tracker</span>
      </div>
      <div className="title-bar-controls">
        <button className="title-bar-btn" onClick={() => window.electronAPI.minimizeWindow()} title="Réduire">
          <Icon icon={Minus} size={15} />
        </button>
        <button
          className="title-bar-btn"
          onClick={() => window.electronAPI.toggleMaximizeWindow()}
          title={maximized ? 'Restaurer' : 'Agrandir'}
        >
          <Icon icon={maximized ? Copy : Square} size={13} />
        </button>
        <button className="title-bar-btn close" onClick={() => window.electronAPI.closeWindow()} title="Fermer">
          <Icon icon={X} size={16} />
        </button>
      </div>
    </div>
  );
}

export default TitleBar;
