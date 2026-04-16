const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType,
} = require("discord.js");
const { requireProfile } = require("../../utils/requireProfile");
const { getRedis } = require("../../services/redis");
const {
  getOrCreateQuests, claimQuest,
  getDailyResetTs, getWeeklyResetTs,
} = require("../../services/quests");
const User = require("../../models/User");

// ─── Reward formatter ─────────────────────────────────────────────────────────

function fmtReward(r) {
  const parts = [];
  if (r.gold)           parts.push(`<:duck_coin:1494344514465431614> ${r.gold.toLocaleString()} Duckcoin`);
  if (r.regularTickets) parts.push(`<:perma_ticket:1494344593863344258> ${r.regularTickets} Regular`);
  if (r.pickupTickets)  parts.push(`<:pickup_ticket:1494344547046523091> ${r.pickupTickets} Pick Up`);
  if (r.accountExp)     parts.push(`⭐ ${r.accountExp} XP`);
  return parts.join(" · ");
}

// ─── Build embed ─────────────────────────────────────────────────────────────

function buildQuestsEmbed(dailyData, weeklyData, username) {
  const embed = new EmbedBuilder()
    .setTitle(`${username}'s Quests`)
    .setColor(0x7C3AED);

  // Daily
  const dailyReset = getDailyResetTs();
  const dailyLines = dailyData.quests.map(q => {
    const prog = dailyData.progress[q.id] || 0;
    const claimed = dailyData.claimed[q.id];
    const complete = prog >= q.target;
    const bar = buildMiniBar(prog, q.target);
    const status = claimed ? "✅" : complete ? "🎁" : "🔲";
    return `${status} **${q.label}** (${prog}/${q.target})\n${bar} ${fmtReward(q.reward)}`;
  });

  embed.addFields({
    name: `📅 Daily Quests — resets <t:${dailyReset}:R>`,
    value: dailyLines.join("\n\n") || "*No quests*",
    inline: false,
  });

  // Weekly
  const weeklyReset = getWeeklyResetTs();
  const weeklyLines = weeklyData.quests.map(q => {
    const prog = weeklyData.progress[q.id] || 0;
    const claimed = weeklyData.claimed[q.id];
    const complete = prog >= q.target;
    const bar = buildMiniBar(prog, q.target);
    const status = claimed ? "✅" : complete ? "🎁" : "🔲";
    return `${status} **${q.label}** (${prog}/${q.target})\n${bar} ${fmtReward(q.reward)}`;
  });

  embed.addFields({
    name: `📆 Weekly Quests — resets <t:${weeklyReset}:R>`,
    value: weeklyLines.join("\n\n") || "*No quests*",
    inline: false,
  });

  embed.setFooter({ text: "🎁 = ready to claim  ✅ = claimed  🔲 = in progress" });
  return embed;
}

function buildMiniBar(current, target) {
  const pct = Math.min(current / target, 1);
  const filled = Math.round(pct * 8);
  return `\`${"▰".repeat(filled)}${"▱".repeat(8 - filled)}\``;
}

// ─── Build claim buttons ──────────────────────────────────────────────────────

function buildClaimRows(dailyData, weeklyData) {
  const rows = [];

  // Daily claim buttons
  const dailyButtons = dailyData.quests
    .filter(q => !dailyData.claimed[q.id] && (dailyData.progress[q.id] || 0) >= q.target)
    .map(q =>
      new ButtonBuilder()
        .setCustomId(`claim_daily_${q.id}`)
        .setLabel(`Claim: ${q.label.slice(0, 30)}`)
        .setStyle(ButtonStyle.Success)
    );

  // Weekly claim buttons
  const weeklyButtons = weeklyData.quests
    .filter(q => !weeklyData.claimed[q.id] && (weeklyData.progress[q.id] || 0) >= q.target)
    .map(q =>
      new ButtonBuilder()
        .setCustomId(`claim_weekly_${q.id}`)
        .setLabel(`Claim: ${q.label.slice(0, 30)}`)
        .setStyle(ButtonStyle.Primary)
    );

  const all = [...dailyButtons, ...weeklyButtons];
  // Discord max 5 buttons per row, max 5 rows
  for (let i = 0; i < Math.min(all.length, 10); i += 5) {
    rows.push(new ActionRowBuilder().addComponents(all.slice(i, i + 5)));
  }

  return rows;
}

// ─── Command ─────────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName("quests")
    .setDescription("View and claim your daily & weekly quests"),

  async execute(interaction) {
    await interaction.deferReply();

    const user = await requireProfile(interaction);
    if (!user) return;

    const redis = getRedis();
    const userId = interaction.user.id;

    const [dailyData, weeklyData] = await Promise.all([
      getOrCreateQuests(redis, userId, "daily"),
      getOrCreateQuests(redis, userId, "weekly"),
    ]);

    const embed = buildQuestsEmbed(dailyData, weeklyData, interaction.user.username);
    const rows = buildClaimRows(dailyData, weeklyData);

    const msg = await interaction.editReply({
      embeds: [embed],
      components: rows,
    });

    if (!rows.length) return;

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === interaction.user.id,
      time: 3 * 60 * 1000,
    });

    collector.on("collect", async i => {
      await i.deferUpdate();

      const parts = i.customId.split("_"); // claim_daily_daily_pull_1
      const type = parts[1]; // "daily" or "weekly"
      const questId = parts.slice(2).join("_");

      const reward = await claimQuest(redis, userId, type, questId);

      if (!reward || reward === "already_claimed" || reward === "not_complete") {
        return;
      }

      // Apply rewards
      const expNeeded = Math.round(100 * Math.pow(user.accountLevel, 1.4));
      const updateData = {
        $inc: {
          "currency.gold":            reward.gold || 0,
          "currency.regularTickets":  reward.regularTickets || 0,
          "currency.pickupTickets":   reward.pickupTickets || 0,
          "stats.totalGoldEverEarned": reward.gold || 0,
          accountExp: reward.accountExp || 0,
        },
      };

      const updatedUser = await User.findOneAndUpdate(
        { userId },
        updateData,
        { new: true }
      );

      // Level up check
      let leveledUp = false;
      while (updatedUser.accountExp >= Math.round(100 * Math.pow(updatedUser.accountLevel, 1.4))) {
        updatedUser.accountExp -= Math.round(100 * Math.pow(updatedUser.accountLevel, 1.4));
        updatedUser.accountLevel++;
        leveledUp = true;
      }
      if (leveledUp) await updatedUser.save();

      // Rebuild embed + buttons with fresh data
      const [newDaily, newWeekly] = await Promise.all([
        getOrCreateQuests(redis, userId, "daily"),
        getOrCreateQuests(redis, userId, "weekly"),
      ]);

      const newEmbed = buildQuestsEmbed(newDaily, newWeekly, interaction.user.username);
      const newRows = buildClaimRows(newDaily, newWeekly);

      // Send reward notification
      const rewardMsg = [`Reward claimed! ${fmtReward(reward)}`];
      if (leveledUp) rewardMsg.push(`🎉 Level up! You are now **Level ${updatedUser.accountLevel}**!`);

      await interaction.followUp({
        content: rewardMsg.join("\n"),
        ephemeral: true,
      });

      await interaction.editReply({
        embeds: [newEmbed],
        components: newRows,
      });
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
