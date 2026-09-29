// Règles de la monnaie du jeu (les « MVP Points »). SOURCE DE VÉRITÉ : le
// serveur lit ces valeurs dans la table shop_settings, générée depuis ce fichier
// (scripts/generate-battle-pass-sql.mjs). Le client ne calcule jamais un solde :
// il l'affiche tel que le serveur le donne.
//
// Les MVP Points ne se gagnent QUE par le Battle Pass : chaque niveau du pass
// qui n'a pas d'autre récompense donne PASS_LEVEL_POINTS à réclamer. Chaque
// joueur reçoit en plus un bonus de bienvenue, une seule fois.
//
// Achat avec de l'argent réel : PAS branché. La source 'pack' existe déjà dans
// le registre pour l'accueillir plus tard (paiement, TVA et mentions légales à
// traiter à part).
export const ECONOMY = {
  welcomeBonus: 1000,
  passLevelPoints: 100,
  // Connexion quotidienne : crédité automatiquement à la première ouverture de
  // l'Aim Trainer de chaque jour (jour UTC, comme la rotation de la boutique).
  dailyLoginPoints: 100,
};

// Prix par rareté (skins d'armes) et par type d'exclusivité. Calés sur ce qu'une
// saison rapporte (17 niveaux × 100 + 1000 de bienvenue = 2700) : une saison
// complète paie un Transcendant, ou par exemple un Ultime et un Légendaire.
export const PRICES = {
  common: 200,
  rare: 350,
  epic: 500,
  legendary: 800,
  mythic: 1200,
  ultimate: 1700,
  transcendent: 2500,
  title: 400,
};
