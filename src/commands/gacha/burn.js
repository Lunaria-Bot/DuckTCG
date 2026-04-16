const { requireProfile } = require("../../utils/requireProfile");
const { incrementProgress } = require("../../services/quests");
const { getRedis } = require("../../services/redis");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const PlayerCard = require("../../models/PlayerCard");
const Card = require("../../models/Card");
const User = require("../../models/User");

const BURN_VALUE = {
  common:      50,
  rare:        200,
  special:     800,
  exceptional: 3000,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("burn")
    .setDescription("Burn a card to receive Duckcoin")
    .addStringOption(opt =>
      opt.setName("card_id")
        .setDescription("ObjectId of the PlayerCard to burn")
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const user = await requireProfile(interaction);
    if (!user) return;

    const cardObjId = interaction.options.getString("card_id");
    const pc = await PlayerCard.findOne({
      _id: cardObjId,
      userId: interaction.user.id,
      isBurned: false,
      isInTeam: false,
      isFavorite: false,
    });

    if (!pc) {
      return interaction.editReply({
        content: "Card not found, already burned, currently in your team, or marked as favorite.",
      });
    }

    const card = await Card.findOne({ cardId: pc.cardId });
    if (!card) return interaction.editReply({ content: "Card data not found." });

    const gold = BURN_VALUE[card.rarity] ?? 50;

    pc.isBurned = true;
    await pc.save();

    await User.findOneAndUpdate(
      { userId: interaction.user.id },
      { $inc: { "currency.gold": gold, "stats.totalGoldEverEarned": gold } }
    );
    const _redis = getRedis();
    await incrementProgress(_redis, interaction.user.id, "daily", "burn", 1);
    await incrementProgress(_redis, interaction.user.id, "weekly", "burn", 1);

    const embed = new EmbedBuilder()
      .setTitle("Card Burned")
      .setDescription(`**${card.name}** (Print #${pc.printNumber}) has been destroyed.`)
      .setColor(0xFF7043)
      .addFields({ name: "Duckcoin Received", value: `**${gold.toLocaleString()}** <:duck_coin:1494344514465431614>`, inline: true });

    return interaction.editReply({ embeds: [embed] });
  },
};
