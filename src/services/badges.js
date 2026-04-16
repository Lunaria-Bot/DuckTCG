const { EmbedBuilder } = require("discord.js");
const User = require("../models/User");
const PlayerCard = require("../models/PlayerCard");

// ─── Badge definitions ────────────────────────────────────────────────────────

const BADGE_META = {
  // Fixed — event / date based (awarded manually via admin or cron)
  pioneer:       { label: "Pioneer",        emoji: "🏅", description: "Here in the first 6 months of the bot" },
  anniversary_1: { label: "1st Anniversary",emoji: "🎂", description: "Bot's 1st anniversary" },
  anniversary_2: { label: "2nd Anniversary",emoji: "🎂", description: "Bot's 2nd anniversary" },
  christmas:     { label: "Christmas",       emoji: "🎄", description: "Christmas event" },
  halloween:     { label: "Halloween",       emoji: "🎃", description: "Halloween event" },

  // Collector — upgradable (card count)
  collector_1:   { label: "Collector I",    emoji: "📦", description: "Own 100 cards",   tier: 1 },
  collector_2:   { label: "Collector II",   emoji: "📦", description: "Own 500 cards",   tier: 2 },
  collector_3:   { label: "Collector III",  emoji: "📦", description: "Own 1000 cards",  tier: 3 },

  // Gold wealth
  gold_small_lord: { label: "Small Lord",     emoji: "💰", description: "Earn 100K Gold total" },
  gold_lord:       { label: "Lord",           emoji: "💰", description: "Earn 500K Gold total" },
  gold_king:       { label: "King",           emoji: "👑", description: "Earn 1M Gold total" },
  gold_emperor:    { label: "Emperor",        emoji: "👑", description: "Earn 10M Gold total" },
  gold_god:        { label: "God of Wealth",  emoji: "🌕", description: "Earn 100M Gold total" },

  // Duck CP
  duck_glock:   { label: "Glock Duck",   emoji: "🦆", description: "Combat Power below 1,000" },
  duck_kalash:  { label: "Kalash Duck",  emoji: "🦆", description: "Combat Power 1K–100K" },
  duck_nuclear: { label: "Nuclear Duck", emoji: "🦆", description: "Combat Power above 100K" },
};

// ─── Check logic ──────────────────────────────────────────────────────────────

function hasBadge(user, badgeId) {
  return user.badges.some(b => b.badgeId === badgeId);
}

function addBadge(user, badgeId, tier = 1) {
  user.badges.push({ badgeId, tier, earnedAt: new Date() });
}

function upgradeBadge(user, badgeId, tier) {
  const badge = user.badges.find(b => b.badgeId === badgeId);
  if (badge) badge.tier = tier;
}

/**
 * Check all auto-badges for a user and return list of newly earned badge IDs.
 * @param {Object} user - Mongoose User document
 * @param {String} trigger - "realtime" | "daily" | "all"
 * @returns {String[]} newly earned badgeIds
 */
async function checkBadges(user, trigger = "all") {
  const earned = [];

  // Card count (needs DB query)
  const cardCount = await PlayerCard.countDocuments({ userId: user.userId, isBurned: false });

  // ── Collector (realtime) ──────────────────────────────────────────────
  if (trigger !== "daily") {
    if (cardCount >= 1000) {
      if (!hasBadge(user, "collector_3")) {
        if (hasBadge(user, "collector_2")) upgradeBadge(user, "collector_2", 3);
        else if (hasBadge(user, "collector_1")) upgradeBadge(user, "collector_1", 3);
        else addBadge(user, "collector_3", 3);
        // Replace lower tiers
        user.badges = user.badges.filter(b => !["collector_1","collector_2"].includes(b.badgeId));
        if (!hasBadge(user, "collector_3")) addBadge(user, "collector_3", 3);
        earned.push("collector_3");
      }
    } else if (cardCount >= 500) {
      if (!hasBadge(user, "collector_2") && !hasBadge(user, "collector_3")) {
        if (hasBadge(user, "collector_1")) {
          user.badges = user.badges.filter(b => b.badgeId !== "collector_1");
        }
        addBadge(user, "collector_2", 2);
        earned.push("collector_2");
      }
    } else if (cardCount >= 100) {
      if (!hasBadge(user, "collector_1") && !hasBadge(user, "collector_2") && !hasBadge(user, "collector_3")) {
        addBadge(user, "collector_1", 1);
        earned.push("collector_1");
      }
    }
  }

  // ── Gold wealth (daily) ───────────────────────────────────────────────
  if (trigger !== "realtime") {
    const gold = user.stats.totalGoldEverEarned;
    const goldBadges = [
      { id: "gold_god",       threshold: 100_000_000 },
      { id: "gold_emperor",   threshold: 10_000_000 },
      { id: "gold_king",      threshold: 1_000_000 },
      { id: "gold_lord",      threshold: 500_000 },
      { id: "gold_small_lord",threshold: 100_000 },
    ];
    for (const { id, threshold } of goldBadges) {
      if (gold >= threshold && !hasBadge(user, id)) {
        // Remove lower gold badges
        const lowerIds = goldBadges.filter(g => g.threshold < threshold).map(g => g.id);
        user.badges = user.badges.filter(b => !lowerIds.includes(b.badgeId));
        addBadge(user, id);
        earned.push(id);
        break; // Only award highest applicable
      }
    }
  }

  // ── Duck CP (realtime) ────────────────────────────────────────────────
  if (trigger !== "daily") {
    const cp = user.combatPower;
    const currentDuck = user.badges.find(b => b.badgeId.startsWith("duck_"));

    if (cp > 100_000) {
      if (!hasBadge(user, "duck_nuclear")) {
        user.badges = user.badges.filter(b => !b.badgeId.startsWith("duck_"));
        addBadge(user, "duck_nuclear");
        earned.push("duck_nuclear");
      }
    } else if (cp >= 1_000) {
      if (!hasBadge(user, "duck_kalash") && !hasBadge(user, "duck_nuclear")) {
        user.badges = user.badges.filter(b => !b.badgeId.startsWith("duck_"));
        addBadge(user, "duck_kalash");
        earned.push("duck_kalash");
      }
    } else {
      if (!currentDuck) {
        addBadge(user, "duck_glock");
        earned.push("duck_glock");
      }
    }
  }

  return earned;
}

// ─── Notification embed ───────────────────────────────────────────────────────

/**
 * Send badge notification to the channel where the player last interacted.
 * @param {Object} interaction - Discord interaction (for channel reference)
 * @param {String[]} newBadgeIds - list of newly earned badge IDs
 */
async function notifyBadges(interaction, newBadgeIds) {
  if (!newBadgeIds.length) return;

  const lines = newBadgeIds.map(id => {
    const meta = BADGE_META[id];
    if (!meta) return null;
    return `${meta.emoji} **${meta.label}** — ${meta.description}`;
  }).filter(Boolean);

  if (!lines.length) return;

  const embed = new EmbedBuilder()
    .setTitle("Achievement Unlocked!")
    .setDescription(lines.join("\n"))
    .setColor(0xFFD700)
    .setThumbnail(interaction.user.displayAvatarURL())
    .setFooter({ text: `Use /achievements to see all your badges` });

  // Send in the channel where the command was used
  try {
    await interaction.channel.send({
      content: `<@${interaction.user.id}>`,
      embeds: [embed],
    });
  } catch {
    // Channel not available — try followUp as fallback
    try {
      await interaction.followUp({ embeds: [embed], ephemeral: false });
    } catch {}
  }
}

/**
 * Run badge check + save + notify. Call this after any action that could trigger badges.
 * @param {Object} user - Mongoose User document (will be saved)
 * @param {Object} interaction - Discord interaction
 * @param {String} trigger - "realtime" | "daily" | "all"
 */
async function processBadges(user, interaction, trigger = "realtime") {
  const newBadges = await checkBadges(user, trigger);
  if (newBadges.length) {
    await user.save();
    await notifyBadges(interaction, newBadges);
  }
  return newBadges;
}

module.exports = { checkBadges, processBadges, notifyBadges, BADGE_META, hasBadge };
