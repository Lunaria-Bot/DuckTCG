const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { requireProfile } = require("../../utils/requireProfile");
const User = require("../../models/User");

// ─── Reward table (28-day cycle) ─────────────────────────────────────────────
// Each entry = rewards for that day in the cycle (1-indexed)
// After day 28 the cycle resets but streak keeps climbing

function getDayRewards(cycleDay) {
  // Base gold scales with cycle day
  const baseGold = 300 + cycleDay * 50;

  const rewards = { gold: baseGold, regularTickets: 0, pickupTickets: 0, premiumCurrency: 0 };

  // Milestone days
  if (cycleDay === 7)  { rewards.regularTickets = 1; rewards.gold = 2000; }
  if (cycleDay === 14) { rewards.pickupTickets = 1;  rewards.gold = 4000; }
  if (cycleDay === 21) { rewards.pickupTickets = 1;  rewards.gold = 6000; rewards.regularTickets = 1; }
  if (cycleDay === 28) { rewards.pickupTickets = 2;  rewards.gold = 10000; rewards.premiumCurrency = 50; }

  // Every 7th day that isn't a major milestone gets a regular ticket
  if (cycleDay % 7 === 0 && ![7,14,21,28].includes(cycleDay)) {
    rewards.regularTickets = 1;
  }

  return rewards;
}

function formatRewards(r) {
  const lines = [];
  if (r.gold)            lines.push(`💰 **${r.gold.toLocaleString()} Gold**`);
  if (r.regularTickets)  lines.push(`🎟️ **${r.regularTickets} Regular Ticket${r.regularTickets > 1 ? "s" : ""}**`);
  if (r.pickupTickets)   lines.push(`✨ **${r.pickupTickets} Pick Up Ticket${r.pickupTickets > 1 ? "s" : ""}**`);
  if (r.premiumCurrency) lines.push(`💎 **${r.premiumCurrency} Premium**`);
  return lines.join("\n");
}

function isMilestone(day) {
  return day % 7 === 0;
}

// Build the 7-day preview grid around current day
function buildWeekPreview(currentStreak) {
  const cycleDay = ((currentStreak - 1) % 28) + 1;
  const lines = [];

  // Show current day + next 6
  for (let i = 0; i < 7; i++) {
    const day = cycleDay + i;
    const actualCycle = ((day - 1) % 28) + 1;
    const r = getDayRewards(actualCycle);
    const isToday = i === 0;
    const isMile = isMilestone(actualCycle);

    const marker = isToday ? "▶ " : (isMile ? "⭐ " : "   ");
    const label = isToday ? `**Day ${currentStreak + i}**` : `Day ${currentStreak + i}`;
    const reward = r.pickupTickets   ? "✨ Pickup Ticket"
                 : r.regularTickets  ? "🎟️ Regular Ticket"
                 : `💰 ${r.gold.toLocaleString()} Gold`;

    lines.push(`${marker}${label} — ${reward}`);
  }

  return lines.join("\n");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily login reward"),

  async execute(interaction) {
    await interaction.deferReply();

    const user = await requireProfile(interaction);
    if (!user) return;

    const now = new Date();
    const lastLogin = user.lastLoginDate ? new Date(user.lastLoginDate) : null;

    // Check if already claimed today (UTC day)
    const todayUTC = now.toISOString().slice(0, 10);
    const lastUTC  = lastLogin ? lastLogin.toISOString().slice(0, 10) : null;

    if (lastUTC === todayUTC) {
      // Already claimed — show next reset time
      const nextReset = new Date(now);
      nextReset.setUTCHours(24, 0, 0, 0);
      const embed = new EmbedBuilder()
        .setTitle("Daily Reward")
        .setDescription(`You already claimed your daily reward today!\nCome back <t:${Math.floor(nextReset.getTime() / 1000)}:R>.`)
        .setColor(0x9E9E9E)
        .addFields({ name: "Upcoming Rewards", value: buildWeekPreview(user.loginStreak) });
      return interaction.editReply({ embeds: [embed] });
    }

    // Check streak continuity — did they claim yesterday?
    const yesterdayUTC = new Date(now);
    yesterdayUTC.setUTCDate(yesterdayUTC.getUTCDate() - 1);
    const yesterdayStr = yesterdayUTC.toISOString().slice(0, 10);

    let newStreak = 1;
    if (lastUTC === yesterdayStr) {
      newStreak = (user.loginStreak ?? 0) + 1;
    }
    // else: missed a day → reset to 1

    const cycleDay = ((newStreak - 1) % 28) + 1;
    const rewards = getDayRewards(cycleDay);

    // Apply rewards
    await User.findOneAndUpdate(
      { userId: interaction.user.id },
      {
        $inc: {
          "currency.gold":            rewards.gold,
          "currency.regularTickets":  rewards.regularTickets,
          "currency.pickupTickets":   rewards.pickupTickets,
          "currency.premiumCurrency": rewards.premiumCurrency,
          "stats.totalGoldEverEarned": rewards.gold,
        },
        $set: {
          loginStreak:   newStreak,
          lastLoginDate: now,
        },
      }
    );

    // Reload for accurate wallet display
    const updatedUser = await User.findOne({ userId: interaction.user.id });

    const streakReset = newStreak === 1 && lastUTC && lastUTC !== yesterdayStr;
    const milestone = isMilestone(cycleDay);

    const embed = new EmbedBuilder()
      .setTitle(milestone ? "Daily Reward — Milestone!" : "Daily Reward")
      .setColor(milestone ? 0xFFD700 : 0x7E57C2)
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        {
          name: streakReset
            ? "Streak Reset"
            : `Day ${newStreak} ${cycleDay !== newStreak ? `(Cycle day ${cycleDay}/28)` : ""}`,
          value: formatRewards(rewards),
          inline: false,
        },
        {
          name: "Upcoming Rewards",
          value: buildWeekPreview(newStreak),
          inline: false,
        },
        {
          name: "Wallet",
          value: [
            `💰 ${updatedUser.currency.gold.toLocaleString()} Gold`,
            `🎟️ ${updatedUser.currency.regularTickets} Regular  ✨ ${updatedUser.currency.pickupTickets} Pick Up`,
            `💎 ${updatedUser.currency.premiumCurrency} Premium`,
          ].join("\n"),
          inline: false,
        },
      )
      .setFooter({ text: `Login streak: ${newStreak} day${newStreak > 1 ? "s" : ""}${streakReset ? " (streak was reset)" : ""}` });

    return interaction.editReply({ embeds: [embed] });
  },
};
