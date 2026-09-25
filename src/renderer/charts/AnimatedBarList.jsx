import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Barres horizontales au style des cartes Stats (.fm-row), vert au-dessus de
// 50 % et rouge en dessous, avec une entrée animée.
function AnimatedBarList({ rows }) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (!rows || rows.length === 0) {
    return <p>{t('charts.notEnoughData')}</p>;
  }

  return (
    <div className="fm-rows">
      {rows.map((row, i) => (
        <div key={row.key} className="fm-row">
          <span className="fm-row-label">{row.key}</span>
          <span className="fm-row-track" aria-hidden="true">
            <span
              className={`fm-row-fill ${row.value >= 50 ? 'good' : 'bad'}`}
              style={{
                width: mounted ? `${row.value}%` : '0%',
                transition: 'width 0.6s ease',
                transitionDelay: `${i * 60}ms`,
              }}
            />
          </span>
          <span className="fm-row-value">{row.value.toFixed(0)}%</span>
          <span className="fm-row-meta">{row.meta}</span>
        </div>
      ))}
    </div>
  );
}

export default AnimatedBarList;
