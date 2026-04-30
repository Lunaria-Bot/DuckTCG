/**
 * Account level system
 * No level cap — players can level up indefinitely
 * XP to next level: 200 * 1.35^(level-1)
 *
 * Note: Mana system (Qi/Dantian) scales up to Lv25 then stays at max values
 */

function xpToNextLevel(level) {
  return Math.round(200 * Math.pow(1.35, level - 1));
}

/**
 * Process XP gain — handles level ups, no cap.
 * Returns { newLevel, newExp, leveledUp, levelsGained }
 */
function applyExp(currentLevel, currentExp, xpGain) {
  let level = currentLevel;
  let exp   = currentExp + xpGain;
  let levelsGained = 0;

  while (true) {
    const needed = xpToNextLevel(level);
    if (exp >= needed) {
      exp -= needed;
      level++;
      levelsGained++;
    } else {
      break;
    }
  }

  return {
    newLevel:    level,
    newExp:      exp,
    leveledUp:   levelsGained > 0,
    levelsGained,
  };
}

module.exports = { xpToNextLevel, applyExp };
