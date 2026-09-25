import { useEffect, useState } from 'react';
import Icon from '../Icon.jsx';

function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (target === null || Number.isNaN(target)) return undefined;
    let start = null;
    let raf;
    const step = (ts) => {
      if (start === null) start = ts;
      const progress = Math.min(1, (ts - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setValue(target * eased);
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

function KpiTile({ label, value, suffix = '', decimals = 0, icon }) {
  const animated = useCountUp(value);

  return (
    <div className="gs-figure">
      <span className="gs-figure-label">
        {icon && <Icon icon={icon} size={14} />} {label}
      </span>
      <span className="gs-figure-value">{value === null ? '?' : `${animated.toFixed(decimals)}${suffix}`}</span>
    </div>
  );
}

export default KpiTile;
