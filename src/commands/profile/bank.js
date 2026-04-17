const { requireProfile } = require("../../utils/requireProfile");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const User = require("../../models/User");

const DUCK_COIN = "<:duck_coin:1494344514465431614>";
const PERMA     = "<:perma_ticket:1494344593863344258>";
const PICKUP    = "<:pickup_ticket:1494344547046523091>";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("bank")
    .setDescription("View your wallet and currency")
    .addUserOption(opt => opt.setName("user").setDescription("View another player's bank (optional)")),

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

    const embed = new EmbedBuilder()
      .setTitle(`${target.username}'s Bank`)
      .setColor(0xFFD700)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        {
          name: "Currency",
          value: [
            `${DUCK_COIN} **${user.currency.gold.toLocaleString()}** Duckcoin`,
            `💎 **${user.currency.premiumCurrency.toLocaleString()}** Premium`,
          ].join("\n"),
          inline: true,
        },
        {
          name: "Tickets",
          value: [
            `${PICKUP} **${user.currency.pickupTickets}** Pick Up`,
            `${PERMA} **${user.currency.regularTickets}** Regular`,
          ].join("\n"),
          inline: true,
        },
        {
          name: "Lifetime",
          value: `${DUCK_COIN} **${user.stats.totalGoldEverEarned.toLocaleString()}** total earned`,
          inline: false,
        },
      )
      .setFooter({ text: "Use /daily and /quests to earn more!" });

    return interaction.editReply({ embeds: [embed] });
  },
};
