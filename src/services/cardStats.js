// Rarity base multipliers
const RARITY_MULT = {
  common:      1.0,
  rare:        1.5,
  special:     2.5,
  exceptional: 4.0,
};

// Level scaling curve — 1.0 at level 1, ~5.0 at level 100, ~7.5 at level 125 (post-ascension)
function levelMultiplier(level) {
  return 1 + (level - 1) * 0.0415;
}

// Role stat bonus multipliers
const ROLE_BONUS = {
  dps:     { damage: 2.0, mana: 0.6, hp: 0.8 },
  support: { damage: 0.6, mana: 2.0, hp: 0.8 },
  tank:    { damage: 0.7, mana: 0.6, hp: 2.2 },
};

/**
 * Calculate final stats for a PlayerCard
 * @param {Object} card - Card document (baseStats, rarity, role)
 * @param {Number} level - Current level
 * @returns {{ damage, mana, hp, combatPower }}
 */
function calculateStats(card, level) {
  const rarityMult = RARITY_MULT[card.rarity] ?? 1;
  const lvlMult = levelMultiplier(level);
  const roleMult = ROLE_BONUS[card.role] ?? { damage: 1, mana: 1, hp: 1 };

  const damage = Math.round(card.baseStats.damage * rarityMult * lvlMult * roleMult.damage);
  const mana   = Math.round(card.baseStats.mana   * rarityMult * lvlMult * roleMult.mana);
  const hp     = Math.round(card.baseStats.hp     * rarityMult * lvlMult * roleMult.hp);

  const combatPower = Math.round(damage * 1.2 + mana * 1.1 + hp * 0.8);

  return { damage, mana, hp, combatPower };
}

/**
 * EXP required to go from level N to N+1
 */
function expToNextLevel(level) {
  return Math.round(100 * Math.pow(level, 1.6));
}

/**
 * Calculate raid damage from a team's aggregated stats
 */
function calculateRaidDamage(teamStats) {
  const base = teamStats.damage + teamStats.mana * 0.2;
  const variance = 0.85 + Math.random() * 0.3;
  return Math.round(base * variance);
}

/**
 * Calculate total Combat Power for a team of 3 cards
 */
function calculateTeamCP(cardsStats) {
  return cardsStats.reduce((sum, s) => sum + s.combatPower, 0);
}

module.exports = {
  calculateStats,
  expToNextLevel,
  calculateRaidDamage,
  calculateTeamCP,
  RARITY_MULT,
  ROLE_BONUS,
};
