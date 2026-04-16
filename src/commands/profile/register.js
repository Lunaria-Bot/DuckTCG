const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
} = require("discord.js");
const User = require("../../models/User");

const WELCOME_GOLD = 1000;
const WELCOME_TICKETS = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("register")
    .setDescription("Create your profile and claim your welcome rewards"),

  async execute(interaction) {
    const existing = await User.findOne({ userId: interaction.user.id });
    if (existing) {
      return interaction.reply({
        content: "You already have a profile! Use `/profile` to view it.",
        ephemeral: true,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId("register_modal")
      .setTitle("Profile Setup");

    const pseudoInput = new TextInputBuilder()
      .setCustomId("pseudo")
      .setLabel("Choose your in-game username")
      .setStyle(TextInputStyle.Short)
      .setMinLength(2)
      .setMaxLength(24)
      .setPlaceholder(interaction.user.username)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(pseudoInput));

    await interaction.showModal(modal);

    let modalInteraction;
    try {
      modalInteraction = await interaction.awaitModalSubmit({
        filter: (i) => i.customId === "register_modal" && i.user.id === interaction.user.id,
        time: 5 * 60 * 1000,
      });
    } catch {
      return;
    }

    await modalInteraction.deferReply();

    const doubleCheck = await User.findOne({ userId: interaction.user.id });
    if (doubleCheck) {
      return modalInteraction.editReply({
        content: "You already have a profile! Use `/profile` to view it.",
      });
    }

    const username = modalInteraction.fields.getTextInputValue("pseudo").trim();

    await User.create({
      userId: interaction.user.id,
      username,
      currency: {
        gold: WELCOME_GOLD,
        premiumCurrency: 0,
        pickupTickets: 0,
        regularTickets: WELCOME_TICKETS,
      },
      stats: {
        totalGoldEverEarned: WELCOME_GOLD,
      },
      firstJoinDate: new Date(),
      lastLoginDate: new Date(),
      loginStreak: 1,
    });

    const embed = new EmbedBuilder()
      .setTitle("Welcome to TCG Bot!")
      .setDescription(
        `Your profile **${username}** has been created successfully.\nGood luck with your pulls!`
      )
      .setColor(0x7E57C2)
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        {
          name: "Welcome Rewards",
          value: [
            `<:perma_ticket:1494344593863344258> **${WELCOME_TICKETS} Regular Tickets** — enough for 1 free multi pull`,
            `<:duck_coin:1494344514465431614> **${WELCOME_GOLD.toLocaleString()} Duckcoin**`,
          ].join("\n"),
          inline: false,
        },
        {
          name: "Getting Started",
          value: [
            "`/banners` — view active gacha banners and pull",
            "`/inventory` — view your card collection",
            "`/profile` — view your profile",
            "`/daily` — claim your daily rewards",
            "`/quests` — view your daily & weekly quests",
          ].join("\n"),
          inline: false,
        }
      )
      .setFooter({ text: "Use /help to see all available commands" });

    return modalInteraction.editReply({ embeds: [embed] });
  },
};
