const { requireProfile } = require("../../utils/requireProfile");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getOrCreateUser } = require("../../utils/getOrCreateUser");
const { processBadges } = require("../../services/badges");
const { incrementProgress } = require("../../services/quests");
const { getRedis } = require("../../services/redis");

const ADVENTURE_DURATION_MS = 6 * 60 * 60 * 1000;

function computeRewards(combatPower) {
  const base = 500 + Math.round(combatPower * 0.05);
  const goldMin = Math.round(base * 0.8);
  const goldMax = Math.round(base * 1.2);
  const gold = goldMin + Math.floor(Math.random() * (goldMax - goldMin + 1));
  const expPerCard = Math.round(50 + combatPower * 0.01);
  return { gold, expPerCard };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("adventure")
    .setDescription("Manage your adventures")
    .addSubcommand(sub =>
      sub.setName("start")
        .setDescription("Send your team on a 6-hour adventure")
    )
    .addSubcommand(sub =>
      sub.setName("claim")
        .setDescription("Claim your adventure rewards")
    )
    .addSubcommand(sub =>
      sub.setName("status")
        .setDescription("Check your current adventure status")
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const user = await requireProfile(interaction);
    if (!user) return;
    const sub = interaction.options.getSubcommand();

    if (sub === "start") {
      if (user.adventure.isActive) {
        const endsTs = Math.floor(user.adventure.endsAt.getTime() / 1000);
        return interaction.editReply({
          content: `Your team is already on an adventure! Returns <t:${endsTs}:R>.`,
        });
      }

      const teamIds = user.team.map(t => t.playerCardId).filter(Boolean);
      if (!teamIds.length) {
        return interaction.editReply({ content: "Set up your team with `/team set` first." });
      }

      const now = new Date();
      user.adventure.isActive = true;
      user.adventure.startedAt = now;
      user.adventure.endsAt = new Date(now.getTime() + ADVENTURE_DURATION_MS);
      await user.save();

      const endsTs = Math.floor(user.adventure.endsAt.getTime() / 1000);
      const embed = new EmbedBuilder()
        .setTitle("Adventure Started!")
        .setDescription(`Your team has set off on a **6-hour** adventure.\nReturns <t:${endsTs}:R>.`)
        .setColor(0x66BB6A);

      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === "status") {
      if (!user.adventure.isActive) {
        return interaction.editReply({ content: "No adventure in progress. Use `/adventure start`." });
      }
      const endsTs = Math.floor(user.adventure.endsAt.getTime() / 1000);
      const done = new Date() >= user.adventure.endsAt;
      return interaction.editReply({
        content: done
          ? "Adventure complete! Use `/adventure claim` to collect your rewards."
          : `Adventure in progress — returns <t:${endsTs}:R>.`,
      });
    }

    if (sub === "claim") {
      if (!user.adventure.isActive) {
        return interaction.editReply({ content: "No adventure in progress." });
      }

      if (new Date() < user.adventure.endsAt) {
        const endsTs = Math.floor(user.adventure.endsAt.getTime() / 1000);
        return interaction.editReply({ content: `Not done yet! Returns <t:${endsTs}:R>.` });
      }

      const { gold, expPerCard } = computeRewards(user.combatPower);

      const { calculateStats, expToNextLevel } = require("../../services/cardStats");
      const PlayerCard = require("../../models/PlayerCard");
      const Card = require("../../models/Card");

      const teamIds = user.team.map(t => t.playerCardId).filter(Boolean);
      const teamCards = await PlayerCard.find({ _id: { $in: teamIds } });

      const levelUps = [];
      for (const pc of teamCards) {
        pc.exp += expPerCard;
        const maxLevel = pc.isAscended ? 125 : 100;

        while (pc.level < maxLevel && pc.exp >= expToNextLevel(pc.level)) {
          pc.exp -= expToNextLevel(pc.level);
          pc.level++;

          if (pc.level === 100 && !pc.isAscended) {
            levelUps.push(`**${pc.cardId}** reached level 100 — Ascension available!`);
          }
        }

        const card = await Card.findOne({ cardId: pc.cardId });
        if (card) {
          pc.cachedStats = calculateStats(card, pc.level);
        }

        await pc.save();
      }

      user.currency.gold += gold;
      user.stats.totalGoldEverEarned += gold;
      user.adventure.isActive = false;
      user.adventure.startedAt = null;
      user.adventure.endsAt = null;
      await user.save();

      // Check gold + PS badges
      await processBadges(user, interaction, "daily");
      const _redis = getRedis();
      await incrementProgress(_redis, interaction.user.id, "daily", "adventure", 1);
      await incrementProgress(_redis, interaction.user.id, "weekly", "adventure", 1);

      const embed = new EmbedBuilder()
        .setTitle("Adventure Complete!")
        .setColor(0x66BB6A)
        .addFields(
          { name: "Nyang Earned", value: `**${gold.toLocaleString()}** <:Nyan:1495048966528831508>`, inline: true },
          { name: "EXP per Card", value: `**+${expPerCard}** ⭐`, inline: true },
        );

      if (levelUps.length) {
        embed.addFields({ name: "Level Up!", value: levelUps.join("\n"), inline: false });
        const _redisLvl = require("../../services/redis").getRedis();
        await incrementProgress(_redisLvl, interaction.user.id, "daily",  "card_levelup", levelUps.length);
        await incrementProgress(_redisLvl, interaction.user.id, "weekly", "card_levelup", levelUps.length);
      }

      return interaction.editReply({ embeds: [embed] });
    }
  },
};
