const { requireProfile } = require("../../utils/requireProfile");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getOrCreateUser } = require("../../utils/getOrCreateUser");
const PlayerCard = require("../../models/PlayerCard");
const Card = require("../../models/Card");

const BADGE_LABEL = {
  pioneer:         "Pioneer",
  anniversary_1:   "1st Anniversary",
  anniversary_2:   "2nd Anniversary",
  christmas:       "Christmas",
  halloween:       "Halloween",
  collector_1:     "Collector I",
  collector_2:     "Collector II",
  collector_3:     "Collector III",
  gold_small_lord: "Small Lord",
  gold_lord:       "Lord",
  gold_king:       "King",
  gold_emperor:    "Emperor",
  gold_god:        "God of Wealth",
  duck_glock:      "Glock Duck",
  duck_kalash:     "Kalash Duck",
  duck_nuclear:    "Nuclear Duck",
};

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
    const user = await getOrCreateUser(target);

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

    // Login streak
    const today = new Date();
    const lastLogin = user.lastLoginDate ? new Date(user.lastLoginDate) : null;
    const isToday = lastLogin && lastLogin.toDateString() === today.toDateString();
    const streak = isToday ? user.loginStreak : 0;

    // EXP bar
    const expNeeded = Math.round(100 * Math.pow(user.accountLevel, 1.4));
    const progress = Math.min(Math.round((user.accountExp / expNeeded) * 10), 10);
    const expBar = `[${"█".repeat(progress)}${"░".repeat(10 - progress)}] ${user.accountExp}/${expNeeded}`;

    const embed = new EmbedBuilder()
      .setTitle(`${target.username}'s Profile`)
      .setThumbnail(target.displayAvatarURL())
      .setColor(0x7E57C2)
      .addFields(
        { name: "Level", value: `**${user.accountLevel}**\n${expBar}`, inline: true },
        { name: "Combat Power", value: `**${user.combatPower.toLocaleString()}**`, inline: true },
        { name: "Login Streak", value: `🔥 ${streak} day(s)`, inline: true },
        { name: "Favorite Card", value: favoriteField, inline: false },
        {
          name: "Statistics",
          value: [
            `Cards obtained: **${user.stats.totalCardsEverObtained}**`,
            `Total gold earned: **${user.stats.totalGoldEverEarned.toLocaleString()}** 💰`,
            `Total pulls: **${user.stats.totalPullsDone}**`,
          ].join("\n"),
          inline: false,
        },
        {
          name: "Wallet",
          value: [
            `Gold: **${user.currency.gold.toLocaleString()}** 💰`,
            `Premium: **${user.currency.premiumCurrency}** 💎`,
            `Pick Up Tickets: **${user.currency.pickupTickets}**`,
            `Regular Tickets: **${user.currency.regularTickets}**`,
          ].join("\n"),
          inline: false,
        },
        { name: "Badges", value: badgeStr, inline: false },
      )
      .setFooter({ text: `Member since ${user.firstJoinDate.toLocaleDateString("en-US")}` });

    return interaction.editReply({ embeds: [embed] });
  },
};
