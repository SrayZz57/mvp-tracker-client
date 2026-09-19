import HallOfFame from '../HallOfFame.jsx';

function HallOfFameTab({ settings, matches, loading, puuid }) {
  return <HallOfFame settings={settings} matches={matches} loading={loading} puuid={puuid} />;
}

export default HallOfFameTab;
