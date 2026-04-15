const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const Banner = require("../../models/Banner");
const { getOrCreateUser } = require("../../utils/getOrCreateUser");
const { doPulls } = require("../../services/gacha");

const RARITY_COLOR = {
  common:      0x9E9E9E,
  rare:        0x42A5F5,
  special:     0xAB47BC,
  exceptional: 0xFFD700,
};

const RARITY_LABEL = {
  common:      "Common",
  rare:        "Rare ✦",
  special:     "Special ✦✦",
  exceptional: "Exceptional ✦✦✦",
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("pull")
    .setDescription("Perform a gacha pull")
    .addStringOption(opt =>
      opt.setName("banner")
        .setDescription("Target banner ID")
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName("type")
        .setDescription("Single (1) or Multi (10)")
        .setRequired(true)
        .addChoices(
          { name: "Single — 1 pull", value: "single" },
          { name: "Multi — 10 pulls", value: "multi" },
        )
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const bannerId = interaction.options.getString("banner");
    const pullType = interaction.options.getString("type");
    const count = pullType === "multi" ? 10 : 1;

    const banner = await Banner.findOne({ bannerId, isActive: true });
    if (!banner) {
      return interaction.editReply({ content: "Banner not found or inactive." });
    }

    const user = await getOrCreateUser(interaction.user);

    const ticketKey = banner.type === "pickup" ? "pickupTickets" : "regularTickets";
    if (user.currency[ticketKey] < count) {
      return interaction.editReply({
        content: `Not enough tickets! You have ${user.currency[ticketKey]}/${count}.`,
      });
    }

    user.currency[ticketKey] -= count;
    await user.save();

    const results = await doPulls(interaction.user.id, banner, count);

    if (!results.length) {
      return interaction.editReply({ content: "Something went wrong during the pull. Please try again." });
    }

    if (count === 1) {
      const { card, playerCard, rarity } = results[0];
      const embed = new EmbedBuilder()
        .setTitle(RARITY_LABEL[rarity])
        .setDescription(`**${card.name}** — *${card.anime}*\nPrint **#${playerCard.printNumber}**`)
        .setColor(RARITY_COLOR[rarity])
        .setThumbnail(card.imageUrl)
        .setFooter({ text: `Remaining tickets: ${user.currency[ticketKey]}` });

      return interaction.editReply({ embeds: [embed] });
    }

    const lines = results.map(({ card, playerCard, rarity }) =>
      `${RARITY_LABEL[rarity]} — **${card.name}** (Print #${playerCard.printNumber})`
    );

    const rarityOrder = ["exceptional", "special", "rare", "common"];
    const best = rarityOrder.find(r => results.some(res => res.rarity === r));

    const embed = new EmbedBuilder()
      .setTitle(`Multi ×10 — ${banner.name}`)
      .setDescription(lines.join("\n"))
      .setColor(RARITY_COLOR[best] ?? 0x9E9E9E)
      .setFooter({ text: `Remaining tickets: ${user.currency[ticketKey]}` });

    return interaction.editReply({ embeds: [embed] });
  },
};
