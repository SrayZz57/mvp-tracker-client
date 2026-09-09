import TeammatesRivals from '../TeammatesRivals.jsx';

function TeammatesRivalsTab({ settings, matches, loading, myPuuid, onViewPlayer }) {
  return (
    <TeammatesRivals
      settings={settings}
      matches={matches}
      loading={loading}
      myPuuid={myPuuid}
      onViewPlayer={onViewPlayer}
    />
  );
}

export default TeammatesRivalsTab;
