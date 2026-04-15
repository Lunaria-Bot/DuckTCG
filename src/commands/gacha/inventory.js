const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ComponentType,
} = require("discord.js");
const PlayerCard = require("../../models/PlayerCard");
const Card = require("../../models/Card");

const PAGE_SIZE = 10;

const RARITY_EMOJI = {
  common:      "⬜",
  rare:        "🟦",
  special:     "🟪",
  exceptional: "🌟",
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("inventory")
    .setDescription("View your card inventory")
    .addStringOption(opt =>
      opt.setName("filter")
        .setDescription("Filter by rarity")
        .addChoices(
          { name: "All", value: "all" },
          { name: "Common", value: "common" },
          { name: "Rare", value: "rare" },
          { name: "Special", value: "special" },
          { name: "Exceptional", value: "exceptional" },
        )
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const filter = interaction.options.getString("filter") ?? "all";
    const userId = interaction.user.id;

    let playerCards = await PlayerCard.find({ userId, isBurned: false }).sort({ createdAt: -1 });

    if (filter !== "all") {
      const matchingCards = await Card.find({ rarity: filter }).select("cardId");
      const matchingIds = new Set(matchingCards.map(c => c.cardId));
      playerCards = playerCards.filter(pc => matchingIds.has(pc.cardId));
    }

    if (!playerCards.length) {
      return interaction.editReply({ content: "Your inventory is empty." });
    }

    const cardIds = [...new Set(playerCards.map(pc => pc.cardId))];
    const cards = await Card.find({ cardId: { $in: cardIds } });
    const cardMap = Object.fromEntries(cards.map(c => [c.cardId, c]));

    const totalPages = Math.ceil(playerCards.length / PAGE_SIZE);
    let page = 0;

    const buildEmbed = (p) => {
      const slice = playerCards.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);
      const lines = slice.map(pc => {
        const card = cardMap[pc.cardId];
        const emoji = RARITY_EMOJI[card?.rarity] ?? "⬜";
        return `${emoji} **${card?.name ?? pc.cardId}** — Lv.${pc.level} | Print #${pc.printNumber}`;
      });

      return new EmbedBuilder()
        .setTitle(`${interaction.user.username}'s Inventory`)
        .setDescription(lines.join("\n"))
        .setColor(0x7E57C2)
        .setFooter({ text: `Page ${p + 1}/${totalPages} — ${playerCards.length} cards` });
    };

    const buildRow = (p) => new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("inv_prev")
        .setLabel("◀")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(p === 0),
      new ButtonBuilder()
        .setCustomId("inv_next")
        .setLabel("▶")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(p >= totalPages - 1),
    );

    const msg = await interaction.editReply({
      embeds: [buildEmbed(page)],
      components: totalPages > 1 ? [buildRow(page)] : [],
    });

    if (totalPages <= 1) return;

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === interaction.user.id,
      time: 60_000,
    });

    collector.on("collect", async i => {
      if (i.customId === "inv_prev") page = Math.max(0, page - 1);
      if (i.customId === "inv_next") page = Math.min(totalPages - 1, page + 1);
      await i.update({ embeds: [buildEmbed(page)], components: [buildRow(page)] });
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
