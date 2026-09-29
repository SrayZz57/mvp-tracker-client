import SessionGuide from '../SessionGuide.jsx';

function SessionGuideTab({ settings, matches, loading, myId, apiKey, rank, profile }) {
  return <SessionGuide settings={settings} matches={matches} loading={loading} myId={myId} apiKey={apiKey} rank={rank} profile={profile} />;
}

export default SessionGuideTab;
