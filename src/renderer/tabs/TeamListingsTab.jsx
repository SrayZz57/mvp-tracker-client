import TeamListings from '../TeamListings.jsx';

function TeamListingsTab({ myId, isAdmin, myRank, profile, apiKey }) {
  return <TeamListings myId={myId} isAdmin={isAdmin} myRank={myRank} profile={profile} apiKey={apiKey} />;
}

export default TeamListingsTab;
