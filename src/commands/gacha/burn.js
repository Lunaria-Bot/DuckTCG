const { requireProfile } = require("../../utils/requireProfile");
const { incrementProgress } = require("../../services/quests");
const { getRedis } = require("../../services/redis");
const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ComponentType,
} = require("discord.js");
const PlayerCard = require("../../models/PlayerCard");
const Card = require("../../models/Card");
const User = require("../../models/User");

const BURN_VALUE = { common: 50, rare: 200, special: 800, exceptional: 3000 };
const RARITY_EMOJI = { exceptional: "<:Exceptional:1496204269110563038>", special: "<:Special:1496200970042872010>", rare: "<:Rare:1496150241462849536>", common: "<:Common:1495730171301462186>" };
const RARITY_ORDER = { exceptional: 0, special: 1, rare: 2, common: 3 };
const NYAN = "<:Nyan:1495048966528831508>";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("burn")
    .setDescription("Burn a card to receive Nyang"),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const user = await requireProfile(interaction);
    if (!user) return;

    // Load all owned cards
    const playerCards = await PlayerCard.find({
      userId: interaction.user.id,
      isBurned: false,
      isInTeam: false,
    }).sort({ createdAt: -1 }).limit(100);

    if (!playerCards.length) {
      return interaction.editReply({ content: "You have no burnable cards." });
    }

    const cardIds = [...new Set(playerCards.map(pc => pc.cardId))];
    const cards   = await Card.find({ cardId: { $in: cardIds } });
    const cardMap = Object.fromEntries(cards.map(c => [c.cardId, c]));

    // Sort by rarity asc (common first = easiest to burn)
    const sorted = playerCards
      .filter(pc => cardMap[pc.cardId])
      .sort((a, b) => {
        const rd = (RARITY_ORDER[cardMap[a.cardId]?.rarity] ?? 9) - (RARITY_ORDER[cardMap[b.cardId]?.rarity] ?? 9);
        return rd !== 0 ? -rd : 0; // common first
      })
      .slice(0, 25);

    const options = sorted.map(pc => {
      const card = cardMap[pc.cardId];
      const val  = BURN_VALUE[card.rarity] ?? 50;
      const qty  = pc.quantity > 1 ? ` (x${pc.quantity})` : "";
      return new StringSelectMenuOptionBuilder()
        .setLabel(`${card.name}${qty} — ${val.toLocaleString()} ${NYAN}`)
        .setDescription(`${card.anime} · ${card.rarity} · Lv.${pc.level}`)
        .setValue(pc._id.toString())
        .setEmoji(RARITY_EMOJI[card.rarity] ?? "<:Common:1495730171301462186>");
    });

    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("burn_select")
        .setPlaceholder("Select a card to burn...")
        .addOptions(options)
    );

    const msg = await interaction.editReply({
      content: "Choose a card to burn. If you have duplicates, one copy will be burned.",
      components: [selectRow],
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      filter: i => i.user.id === interaction.user.id,
      time: 60_000,
      max: 1,
    });

    collector.on("collect", async i => {
      await i.deferUpdate();

      const pc = await PlayerCard.findOne({
        _id: i.values[0],
        userId: interaction.user.id,
        isBurned: false,
        isInTeam: false,
      });

      if (!pc) {
        return interaction.editReply({ content: "Card not found or unavailable.", components: [] });
      }

      const card = cardMap[pc.cardId];
      if (!card) return interaction.editReply({ content: "Card data not found.", components: [] });

      const gold = BURN_VALUE[card.rarity] ?? 50;

      if (pc.quantity > 1) {
        // Just decrement quantity
        await PlayerCard.findByIdAndUpdate(pc._id, { $inc: { quantity: -1 } });
      } else {
        // Last copy — mark as burned
        await PlayerCard.findByIdAndUpdate(pc._id, { isBurned: true, quantity: 0 });

        // If it was the favorite, clear it
        if (user.favoriteCardId?.toString() === pc._id.toString()) {
          await User.findOneAndUpdate({ userId: interaction.user.id }, { favoriteCardId: null });
        }
      }

      await User.findOneAndUpdate(
        { userId: interaction.user.id },
        { $inc: { "currency.gold": gold, "stats.totalGoldEverEarned": gold } }
      );

      const redis = getRedis();
      await incrementProgress(redis, interaction.user.id, "daily", "burn", 1);
      await incrementProgress(redis, interaction.user.id, "weekly", "burn", 1);

      const remaining = pc.quantity - 1;
      const embed = new EmbedBuilder()
        .setTitle("Card Burned")
        .setDescription(
          `**${card.name}** has been destroyed.` +
          (remaining > 0 ? `\nYou still have **${remaining}x** ${card.name}.` : "")
        )
        .setColor(0xFF7043)
        .addFields({ name: "Nyang Received", value: `**${gold.toLocaleString()}** ${NYAN}`, inline: true });

      return interaction.editReply({ embeds: [embed], content: "", components: [] });
    });

    collector.on("end", (collected) => {
      if (!collected.size) {
        interaction.editReply({ content: "Burn cancelled.", components: [] }).catch(() => {});
      }
    });
  },
};
