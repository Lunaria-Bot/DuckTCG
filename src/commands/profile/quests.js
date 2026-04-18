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
const { applyExp } = require("../../services/levels");

const NYAN   = "<:Nyan:1495048966528831508>";
const JADE   = "<:Jade:1495038405866688703>";
const PERMA  = "<:perma_ticket:1494344593863344258>";
const PICKUP = "<:pickup_ticket:1494344547046523091>";
const XP_FULL  = "<:xp_full:1494696138396270592>";
const XP_EMPTY = "<:xp_empty:1494696186525909002>";

function fmtReward(r) {
  const parts = [];
  if (r.gold)           parts.push(`${NYAN} **${r.gold.toLocaleString()}**`);
  if (r.jade)           parts.push(`${JADE} **${r.jade}**`);
  if (r.regularTickets) parts.push(`${PERMA} **${r.regularTickets}**`);
  if (r.pickupTickets)  parts.push(`${PICKUP} **${r.pickupTickets}**`);
  if (r.accountExp)     parts.push(`⭐ **${r.accountExp} XP**`);
  return parts.join("  ");
}

function buildBar(current, target, length = 5) {
  const pct    = Math.min(current / target, 1);
  const filled = Math.round(pct * length);
  return XP_FULL.repeat(filled) + XP_EMPTY.repeat(length - filled);
}

function buildQuestLine(q, progress, claimed) {
  const prog  = progress[q.id] || 0;
  const done  = prog >= q.target;
  const icon  = claimed ? "✅" : done ? "🎁" : "▫️";
  const bar   = buildBar(prog, q.target);
  const label = claimed ? `~~${q.label}~~` : `**${q.label}**`;

  // Bar + counter in the field NAME (256 char limit, safe)
  // Reward in the field VALUE (1024 char limit)
  return {
    name:   `${icon} ${label}  ${bar} \`${prog}/${q.target}\``,
    value:  fmtReward(q.reward) || "\u200b",
    inline: false,
  };
}


function buildQuestsEmbed(dailyData, weeklyData, username) {
  const dailyReset  = getDailyResetTs();
  const weeklyReset = getWeeklyResetTs();

  const dailyFields = dailyData.quests.map(q =>
    buildQuestLine(q, dailyData.progress, dailyData.claimed[q.id])
  );

  const weeklyFields = weeklyData.quests.map(q =>
    buildQuestLine(q, weeklyData.progress, weeklyData.claimed[q.id])
  );

  return new EmbedBuilder()
    .setTitle(`${username}'s Quests`)
    .setColor(0x7C3AED)
    .addFields(
      { name: `📅 Daily — resets <t:${dailyReset}:R>`, value: "\u200b", inline: false },
      ...dailyFields,
      { name: `📆 Weekly — resets <t:${weeklyReset}:R>`, value: "\u200b", inline: false },
      ...weeklyFields,
    )
    .setFooter({ text: "🎁 ready to claim  ✅ claimed  ▫️ in progress" });
}

function buildClaimRows(dailyData, weeklyData) {
  const rows = [];

  const dailyButtons = dailyData.quests
    .filter(q => !dailyData.claimed[q.id] && (dailyData.progress[q.id] || 0) >= q.target)
    .map(q =>
      new ButtonBuilder()
        .setCustomId(`claim_daily_${q.id}`)
        .setLabel(q.label.slice(0, 30))
        .setEmoji("🎁")
        .setStyle(ButtonStyle.Success)
    );

  const weeklyButtons = weeklyData.quests
    .filter(q => !weeklyData.claimed[q.id] && (weeklyData.progress[q.id] || 0) >= q.target)
    .map(q =>
      new ButtonBuilder()
        .setCustomId(`claim_weekly_${q.id}`)
        .setLabel(q.label.slice(0, 30))
        .setEmoji("🎁")
        .setStyle(ButtonStyle.Primary)
    );

  const all = [...dailyButtons, ...weeklyButtons];
  for (let i = 0; i < Math.min(all.length, 10); i += 5) {
    rows.push(new ActionRowBuilder().addComponents(all.slice(i, i + 5)));
  }

  return rows;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("quests")
    .setDescription("View and claim your daily & weekly quests"),

  async execute(interaction) {
    await interaction.deferReply();

    const user = await requireProfile(interaction);
    if (!user) return;

    const redis  = getRedis();
    const userId = interaction.user.id;

    const [dailyData, weeklyData] = await Promise.all([
      getOrCreateQuests(redis, userId, "daily"),
      getOrCreateQuests(redis, userId, "weekly"),
    ]);

    const embed = buildQuestsEmbed(dailyData, weeklyData, interaction.user.username);
    const rows  = buildClaimRows(dailyData, weeklyData);

    const msg = await interaction.editReply({ embeds: [embed], components: rows });

    if (!rows.length) return;

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === interaction.user.id,
      time: 3 * 60 * 1000,
    });

    collector.on("collect", async i => {
      await i.deferUpdate();

      const parts   = i.customId.split("_");
      const type    = parts[1];
      const questId = parts.slice(2).join("_");

      const reward = await claimQuest(redis, userId, type, questId);
      if (!reward || reward === "already_claimed" || reward === "not_complete") return;

      // Apply rewards
      const freshUser = await User.findOne({ userId });
      const lvResult  = applyExp(freshUser.accountLevel, freshUser.accountExp, reward.accountExp || 0);

      await User.findOneAndUpdate({ userId }, {
        $inc: {
          "currency.gold":               reward.gold || 0,
          "currency.regularTickets":     reward.regularTickets || 0,
          "currency.pickupTickets":      reward.pickupTickets || 0,
          "currency.premiumCurrency":    reward.jade || 0,
          "stats.totalGoldEverEarned":   reward.gold || 0,
        },
        accountLevel: lvResult.newLevel,
        accountExp:   lvResult.newExp,
      });

      const [newDaily, newWeekly] = await Promise.all([
        getOrCreateQuests(redis, userId, "daily"),
        getOrCreateQuests(redis, userId, "weekly"),
      ]);

      const rewardMsg = [`✅ Reward claimed! ${fmtReward(reward)}`];
      if (lvResult.leveledUp) rewardMsg.push(`🎉 Level up! You are now **Level ${lvResult.newLevel}**!`);

      await interaction.followUp({ content: rewardMsg.join("\n"), ephemeral: true });
      await interaction.editReply({
        embeds: [buildQuestsEmbed(newDaily, newWeekly, interaction.user.username)],
        components: buildClaimRows(newDaily, newWeekly),
      });
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
