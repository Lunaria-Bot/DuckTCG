const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { requireProfile } = require("../../utils/requireProfile");
const User = require("../../models/User");
const { processBadges } = require("../../services/badges");
const { incrementProgress } = require("../../services/quests");
const { getRedis } = require("../../services/redis");

const NYAN   = "<:Nyan:1495048966528831508>";
const JADE   = "<:Jade:1495038405866688703>";
const PERMA  = "<:perma_ticket:1494344593863344258>";
const PICKUP = "<:pickup_ticket:1494344547046523091>";

// ─── Reward table (28-day cycle) ──────────────────────────────────────────────
function getDayRewards(cycleDay) {
  const rewards = {
    gold: 300 + cycleDay * 50,
    regularTickets: 0,
    pickupTickets: 0,
    premiumCurrency: 0,
  };
  if (cycleDay === 7)  { rewards.regularTickets = 1; rewards.gold = 2000; }
  if (cycleDay === 14) { rewards.pickupTickets = 1;  rewards.gold = 4000; }
  if (cycleDay === 21) { rewards.pickupTickets = 1;  rewards.gold = 6000; rewards.regularTickets = 1; }
  if (cycleDay === 28) { rewards.pickupTickets = 2;  rewards.gold = 10000; rewards.premiumCurrency = 50; }
  if (cycleDay % 7 === 0 && ![7,14,21,28].includes(cycleDay)) rewards.regularTickets = 1;
  return rewards;
}

function isMilestone(day) { return day % 7 === 0; }

function rewardLine(r, short = false) {
  const parts = [];
  if (r.gold)            parts.push(`${NYAN} **${r.gold.toLocaleString()}**`);
  if (r.regularTickets)  parts.push(`${PERMA} **${r.regularTickets}**`);
  if (r.pickupTickets)   parts.push(`${PICKUP} **${r.pickupTickets}**`);
  if (r.premiumCurrency) parts.push(`${JADE} **${r.premiumCurrency}**`);
  return parts.join("  ");
}

// ─── 7-day upcoming preview ────────────────────────────────────────────────────
function buildUpcoming(currentStreak) {
  const cycleDay = ((currentStreak - 1) % 28) + 1;
  const lines = [];
  for (let i = 1; i <= 6; i++) {
    const futureStreak = currentStreak + i;
    const futureCycle  = ((futureStreak - 1) % 28) + 1;
    const r = getDayRewards(futureCycle);
    const mile = isMilestone(futureCycle);
    const prefix = mile ? "⭐ " : "·  ";
    const reward = r.pickupTickets  ? `${PICKUP} Pick Up`
                 : r.regularTickets ? `${PERMA} Regular Ticket`
                 : `${NYAN} ${r.gold.toLocaleString()}`;
    lines.push(`${prefix}Day **${futureStreak}** — ${reward}`);
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

    const now         = new Date();
    const todayUTC    = now.toISOString().slice(0, 10);
    const lastLogin   = user.lastLoginDate ? new Date(user.lastLoginDate) : null;
    const lastUTC     = lastLogin ? lastLogin.toISOString().slice(0, 10) : null;

    // ── Already claimed ──────────────────────────────────────────────────────
    if (lastUTC === todayUTC) {
      const nextReset = new Date(now);
      nextReset.setUTCHours(24, 0, 0, 0);
      const cycleDay = ((user.loginStreak - 1) % 28) + 1;
      const nextR = getDayRewards(((user.loginStreak) % 28) + 1);

      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setTitle("Already claimed today")
          .setDescription(`Come back <t:${Math.floor(nextReset.getTime() / 1000)}:R>`)
          .setColor(0x4a4a6a)
          .addFields(
            { name: "Current streak", value: `🔥 **${user.loginStreak}** day${user.loginStreak !== 1 ? "s" : ""}`, inline: true },
            { name: "Cycle",          value: `Day **${cycleDay}** / 28`, inline: true },
            { name: "Next reward",    value: rewardLine(nextR), inline: false },
          )
          .setThumbnail(interaction.user.displayAvatarURL())
        ],
      });
    }

    // ── Streak check ─────────────────────────────────────────────────────────
    const yesterdayUTC = new Date(now);
    yesterdayUTC.setUTCDate(yesterdayUTC.getUTCDate() - 1);
    const yesterdayStr = yesterdayUTC.toISOString().slice(0, 10);

    const streakReset = !!(lastUTC && lastUTC !== yesterdayStr);
    const newStreak   = lastUTC === yesterdayStr ? (user.loginStreak ?? 0) + 1 : 1;
    const cycleDay    = ((newStreak - 1) % 28) + 1;
    const rewards     = getDayRewards(cycleDay);
    const milestone   = isMilestone(cycleDay);

    // Apply rewards
    await User.findOneAndUpdate({ userId: interaction.user.id }, {
      $inc: {
        "currency.gold":             rewards.gold,
        "currency.regularTickets":   rewards.regularTickets,
        "currency.pickupTickets":    rewards.pickupTickets,
        "currency.premiumCurrency":  rewards.premiumCurrency,
        "stats.totalGoldEverEarned": rewards.gold,
      },
      $set: { loginStreak: newStreak, lastLoginDate: now },
    });

    const updatedUser = await User.findOne({ userId: interaction.user.id });
    await processBadges(updatedUser, interaction, "all");
    const _redis = getRedis();
    await incrementProgress(_redis, interaction.user.id, "daily", "daily", 1);
    await incrementProgress(_redis, interaction.user.id, "weekly", "daily", 1);

    // ── Embed ─────────────────────────────────────────────────────────────────
    const color = milestone     ? 0xFFD700
                : streakReset   ? 0xEF4444
                : newStreak >= 14 ? 0x8b5cf6
                : 0x6d28d9;

    const titlePrefix = milestone   ? "<:Exceptional:1496532355719102656> Milestone — "
                      : streakReset ? "Daily Reward"
                      : "Daily Reward";

    const embed = new EmbedBuilder()
      .setTitle(titlePrefix)
      .setColor(color)
      .setThumbnail(interaction.user.displayAvatarURL())
      .setDescription(streakReset
        ? `⚠️ Your streak was reset. Starting over from Day 1.`
        : `🔥 **${newStreak}-day streak!**  *(Cycle day ${cycleDay}/28)*`
      )
      .addFields(
        {
          name: `Today's Reward — Day ${newStreak}`,
          value: rewardLine(rewards),
          inline: false,
        },
        {
          name: "Coming Up",
          value: buildUpcoming(newStreak),
          inline: false,
        },

      );

    return interaction.editReply({ embeds: [embed] });
  },
};
