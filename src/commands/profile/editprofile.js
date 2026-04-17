const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
} = require("discord.js");
const { requireProfile } = require("../../utils/requireProfile");
const PlayerCard = require("../../models/PlayerCard");
const Card = require("../../models/Card");
const User = require("../../models/User");

const RARITY_EMOJI = { common: "⬜", rare: "🟦", special: "🟪", exceptional: "🌟" };

module.exports = {
  data: new SlashCommandBuilder()
    .setName("editprofile")
    .setDescription("Edit your profile — bio, username, favorite card")
    .addSubcommand(sub =>
      sub.setName("bio")
        .setDescription("Set your profile bio (max 150 characters)")
    )
    .addSubcommand(sub =>
      sub.setName("username")
        .setDescription("Change your in-game username")
    )
    .addSubcommand(sub =>
      sub.setName("favorite")
        .setDescription("Set your favorite card displayed on your profile")
    ),

  async execute(interaction) {
    const user = await requireProfile(interaction);
    if (!user) return;

    const sub = interaction.options.getSubcommand();

    // ── Bio ──────────────────────────────────────────────────────────────────
    if (sub === "bio") {
      const modal = new ModalBuilder()
        .setCustomId("editprofile_bio")
        .setTitle("Edit Bio");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("bio")
            .setLabel("Your bio (max 150 characters)")
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(150)
            .setRequired(false)
            .setPlaceholder("Write something about yourself...")
            .setValue(user.bio || "")
        )
      );

      await interaction.showModal(modal);

      let modalInteraction;
      try {
        modalInteraction = await interaction.awaitModalSubmit({
          filter: i => i.customId === "editprofile_bio" && i.user.id === interaction.user.id,
          time: 5 * 60 * 1000,
        });
      } catch { return; }

      await modalInteraction.deferReply({ ephemeral: true });
      const bio = modalInteraction.fields.getTextInputValue("bio").trim() || null;
      await User.findOneAndUpdate({ userId: interaction.user.id }, { bio });

      return modalInteraction.editReply({
        content: bio ? `Bio updated!` : `Bio cleared.`,
      });
    }

    // ── Username ─────────────────────────────────────────────────────────────
    if (sub === "username") {
      const modal = new ModalBuilder()
        .setCustomId("editprofile_username")
        .setTitle("Change Username");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("username")
            .setLabel("New in-game username (2–24 characters)")
            .setStyle(TextInputStyle.Short)
            .setMinLength(2)
            .setMaxLength(24)
            .setRequired(true)
            .setValue(user.username)
        )
      );

      await interaction.showModal(modal);

      let modalInteraction;
      try {
        modalInteraction = await interaction.awaitModalSubmit({
          filter: i => i.customId === "editprofile_username" && i.user.id === interaction.user.id,
          time: 5 * 60 * 1000,
        });
      } catch { return; }

      await modalInteraction.deferReply({ ephemeral: true });
      const username = modalInteraction.fields.getTextInputValue("username").trim();
      await User.findOneAndUpdate({ userId: interaction.user.id }, { username });

      return modalInteraction.editReply({ content: `Username updated to **${username}**!` });
    }

    // ── Favorite card ─────────────────────────────────────────────────────────
    if (sub === "favorite") {
      await interaction.deferReply({ ephemeral: true });

      // Get player's top 25 cards (exceptional first, then special, etc.)
      const rarityOrder = { exceptional: 0, special: 1, rare: 2, common: 3 };
      const playerCards = await PlayerCard.find({
        userId: interaction.user.id,
        isBurned: false,
      }).limit(100);

      if (!playerCards.length) {
        return interaction.editReply({ content: "You don't have any cards yet!" });
      }

      // Get card details
      const cardIds = [...new Set(playerCards.map(pc => pc.cardId))];
      const cards = await Card.find({ cardId: { $in: cardIds } });
      const cardMap = Object.fromEntries(cards.map(c => [c.cardId, c]));

      // Sort by rarity then level
      const sorted = playerCards
        .filter(pc => cardMap[pc.cardId])
        .sort((a, b) => {
          const rarityDiff = (rarityOrder[cardMap[a.cardId]?.rarity] ?? 9) - (rarityOrder[cardMap[b.cardId]?.rarity] ?? 9);
          if (rarityDiff !== 0) return rarityDiff;
          return b.level - a.level;
        })
        .slice(0, 25);

      const options = sorted.map(pc => {
        const card = cardMap[pc.cardId];
        const emoji = RARITY_EMOJI[card.rarity] ?? "⬜";
        return new StringSelectMenuOptionBuilder()
          .setLabel(`${card.name} — Lv.${pc.level}`)
          .setDescription(`${card.anime} · ${card.rarity}`)
          .setValue(pc._id.toString())
          .setEmoji(emoji.codePointAt ? emoji : { name: emoji });
      });

      // Add "clear" option
      options.unshift(
        new StringSelectMenuOptionBuilder()
          .setLabel("Clear favorite")
          .setDescription("Remove your favorite card")
          .setValue("clear")
          .setEmoji("❌")
      );

      const select = new StringSelectMenuBuilder()
        .setCustomId("favorite_select")
        .setPlaceholder("Choose your favorite card...")
        .addOptions(options);

      const row = new ActionRowBuilder().addComponents(select);

      const msg = await interaction.editReply({
        content: "Select your favorite card:",
        components: [row],
      });

      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i => i.user.id === interaction.user.id,
        time: 60_000,
        max: 1,
      });

      collector.on("collect", async i => {
        await i.deferUpdate();
        const selected = i.values[0];

        if (selected === "clear") {
          await User.findOneAndUpdate({ userId: interaction.user.id }, { favoriteCardId: null });
          await interaction.editReply({ content: "Favorite card cleared.", components: [] });
          return;
        }

        const pc = await PlayerCard.findById(selected);
        const card = pc ? cardMap[pc.cardId] : null;

        if (!pc || !card) {
          await interaction.editReply({ content: "Card not found.", components: [] });
          return;
        }

        await User.findOneAndUpdate({ userId: interaction.user.id }, { favoriteCardId: pc._id });
        await interaction.editReply({
          content: `Favorite card set to **${card.name}** (Lv.${pc.level})!`,
          components: [],
        });
      });

      collector.on("end", collected => {
        if (!collected.size) {
          interaction.editReply({ content: "Timed out.", components: [] }).catch(() => {});
        }
      });
    }
  },
};
