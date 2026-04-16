const { requireProfile } = require("../../utils/requireProfile");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getOrCreateUser } = require("../../utils/getOrCreateUser");
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

// EXP bar — 12 blocks, uses filled/empty chars with a gradient feel
function buildExpBar(current, needed) {
  const pct = Math.min(current / needed, 1);
  const filled = Math.round(pct * 12);
  const bar = "█".repeat(filled) + "░".repeat(12 - filled);
  const pctStr = Math.round(pct * 100);
  return `\`[${bar}]\` ${pctStr}%\n${current.toLocaleString()} / ${needed.toLocaleString()} XP`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View your profile or another player's profile")
    .addUserOption(opt =>
      opt.setName("user")
        .setDescription("Target player (optional)")
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const profileCheck = await requireProfile(interaction);
    if (!profileCheck) return;

    const target = interaction.options.getUser("user") ?? interaction.user;

    let user;
    if (target.id !== interaction.user.id) {
      user = await User.findOne({ userId: target.id });
      if (!user) {
        return interaction.editReply({
          content: `**${target.username}** doesn't have a profile yet.`,
        });
      }
    } else {
      user = profileCheck;
    }

    // Favorite card
    let favoriteField = "*No favorite card set*";
    if (user.favoriteCardId) {
      const pc = await PlayerCard.findById(user.favoriteCardId);
      if (pc) {
        const card = await Card.findOne({ cardId: pc.cardId });
        if (card) favoriteField = `**${card.name}** — Lv.${pc.level} | Print #${pc.printNumber}`;
      }
    }

    // Badges
    const badgeStr = user.badges.length
      ? user.badges.map(b => BADGE_LABEL[b.badgeId] ?? b.badgeId).join("  ")
      : "*No badges yet*";

    // EXP bar
    const expNeeded = Math.round(100 * Math.pow(user.accountLevel, 1.4));
    const expBar = buildExpBar(user.accountExp, expNeeded);

    // Duck CP badge label
    const duckBadge = user.badges.find(b => b.badgeId.startsWith("duck_"));
    const cpDisplay = duckBadge
      ? `${BADGE_LABEL[duckBadge.badgeId] ?? ""} — **${user.combatPower.toLocaleString()}**`
      : `**${user.combatPower.toLocaleString()}**`;

    const embed = new EmbedBuilder()
      .setTitle(`${target.username}'s Profile`)
      .setThumbnail(target.displayAvatarURL())
      .setColor(0x7E57C2)
      .addFields(
        // Level + XP bar
        {
          name: `Level ${user.accountLevel}`,
          value: expBar,
          inline: false,
        },
        // Stats row
        {
          name: "Combat Power",
          value: cpDisplay,
          inline: true,
        },
        {
          name: "🔥 Login Streak",
          value: `**${user.loginStreak}** day${user.loginStreak !== 1 ? "s" : ""}`,
          inline: true,
        },
        {
          name: "Total Pulls",
          value: `**${user.stats.totalPullsDone}**`,
          inline: true,
        },
        // Favorite card
        { name: "Favorite Card", value: favoriteField, inline: false },
        // Statistics
        {
          name: "Statistics",
          value: [
            `📦 Cards obtained: **${user.stats.totalCardsEverObtained}**`,
            `💰 Total gold earned: **${user.stats.totalGoldEverEarned.toLocaleString()}**`,
            `⚔️ Total raid damage: **${user.stats.raidDamageTotal.toLocaleString()}**`,
          ].join("\n"),
          inline: false,
        },
        // Wallet
        {
          name: "Wallet",
          value: [
            `💰 Gold: **${user.currency.gold.toLocaleString()}**`,
            `💎 Premium: **${user.currency.premiumCurrency}**`,
            `<:pickup_ticket:1494294616495620128> Pick Up Tickets: **${user.currency.pickupTickets}**`,
            `<:perma_ticket:1494292877491310666> Regular Tickets: **${user.currency.regularTickets}**`,
          ].join("\n"),
          inline: false,
        },
        // Badges
        { name: "Badges", value: badgeStr, inline: false },
      )
      .setFooter({ text: `Member since ${user.firstJoinDate.toLocaleDateString("en-US")}` });

    return interaction.editReply({ embeds: [embed] });
  },
};
