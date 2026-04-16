const { requireProfile } = require("../../utils/requireProfile");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const User = require("../../models/User");
const PlayerCard = require("../../models/PlayerCard");
const Card = require("../../models/Card");

const BADGE_LABEL = {
  pioneer:         "🏅 Pioneer",
  anniversary_1:   "🎂 1st Anniversary",
  anniversary_2:   "🎂 2nd Anniversary",
  christmas:       "🎄 Christmas",
  halloween:       "🎃 Halloween",
  collector_1:     "📦 Collector I",
  collector_2:     "📦 Collector II",
  collector_3:     "📦 Collector III",
  gold_small_lord: "💰 Small Lord",
  gold_lord:       "💰 Lord",
  gold_king:       "👑 King",
  gold_emperor:    "👑 Emperor",
  gold_god:        "🌕 God of Wealth",
  duck_glock:      "🦆 Glock Duck",
  duck_kalash:     "🦆 Kalash Duck",
  duck_nuclear:    "🦆 Nuclear Duck",
};

// Thin XP progress bar using block chars
function buildExpBar(current, needed) {
  const pct = Math.min(current / needed, 1);
  const filled = Math.round(pct * 15);
  const empty = 15 - filled;
  const bar = "▰".repeat(filled) + "▱".repeat(empty);
  const pctStr = Math.round(pct * 100);
  return `${bar} ${pctStr}%\n\`${current.toLocaleString()} / ${needed.toLocaleString()} XP\``;
}

// Two-column key/value table using zero-width spaces for alignment
function twoCol(rows) {
  return rows.map(([k, v]) => `**${k}** \u200b\n${v}`).join("\n");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View your profile or another player's profile")
    .addUserOption(opt =>
      opt.setName("user").setDescription("Target player (optional)")
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const profileCheck = await requireProfile(interaction);
    if (!profileCheck) return;

    const target = interaction.options.getUser("user") ?? interaction.user;

    let user;
    if (target.id !== interaction.user.id) {
      user = await User.findOne({ userId: target.id });
      if (!user) return interaction.editReply({ content: `**${target.username}** doesn't have a profile yet.` });
    } else {
      user = profileCheck;
    }

    // Favorite card
    let favoriteValue = "*No favorite card set*";
    if (user.favoriteCardId) {
      const pc = await PlayerCard.findById(user.favoriteCardId);
      if (pc) {
        const card = await Card.findOne({ cardId: pc.cardId });
        if (card) favoriteValue = `🃏 **${card.name}**\n${card.anime} · Lv.${pc.level} · Print #${pc.printNumber}`;
      }
    }

    // Badges
    const badgeStr = user.badges.length
      ? user.badges.map(b => BADGE_LABEL[b.badgeId] ?? b.badgeId).join("  ")
      : "*No badges yet*";

    // Level & XP
    const expNeeded = Math.round(100 * Math.pow(user.accountLevel, 1.4));
    const expBar = buildExpBar(user.accountExp, expNeeded);

    // CP with duck badge
    const duckBadge = user.badges.find(b => b.badgeId.startsWith("duck_"));
    const cpLabel = duckBadge ? `${BADGE_LABEL[duckBadge.badgeId]}` : "⚔️ Combat Power";

    const embed = new EmbedBuilder()
      .setColor(0x5B21B6)
      .setAuthor({
        name: `${target.username}'s Profile`,
        iconURL: target.displayAvatarURL(),
      })
      .setThumbnail(target.displayAvatarURL())

      // ── Level + XP bar ──
      .addFields({
        name: `✦ Level ${user.accountLevel}`,
        value: expBar,
        inline: false,
      })

      // ── 3 stat pills inline ──
      .addFields(
        {
          name: cpLabel,
          value: `**${user.combatPower.toLocaleString()}**`,
          inline: true,
        },
        {
          name: "🔥 Login Streak",
          value: `**${user.loginStreak}** day${user.loginStreak !== 1 ? "s" : ""}`,
          inline: true,
        },
        {
          name: "🎰 Total Pulls",
          value: `**${user.stats.totalPullsDone}**`,
          inline: true,
        },
      )

      // ── Divider + Favorite card ──
      .addFields({
        name: "⸻⸻⸻  Favorite Card",
        value: favoriteValue,
        inline: false,
      })

      // ── Statistics ──
      .addFields({
        name: "📊 Statistics",
        value: [
          `📦 Cards obtained  **${user.stats.totalCardsEverObtained}**`,
          `💰 Gold earned  **${user.stats.totalGoldEverEarned.toLocaleString()}**`,
          `⚔️ Raid damage  **${user.stats.raidDamageTotal.toLocaleString()}**`,
        ].join("\n"),
        inline: true,
      })

      // ── Wallet ──
      .addFields({
        name: "👛 Wallet",
        value: [
          `💰 Gold  **${user.currency.gold.toLocaleString()}**`,
          `💎 Premium  **${user.currency.premiumCurrency}**`,
          `<:pickup_ticket:1494294616495620128> Pick Up  **${user.currency.pickupTickets}**`,
          `<:perma_ticket:1494292877491310666> Regular  **${user.currency.regularTickets}**`,
        ].join("\n"),
        inline: true,
      })

      // ── Badges ──
      .addFields({
        name: "🏆 Badges",
        value: badgeStr,
        inline: false,
      })

      .setFooter({ text: `Member since ${user.firstJoinDate.toLocaleDateString("en-US")}` });

    return interaction.editReply({ embeds: [embed] });
  },
};
