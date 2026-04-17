const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ComponentType,
} = require("discord.js");
const { requireProfile } = require("../../utils/requireProfile");
const PlayerCard = require("../../models/PlayerCard");
const Card = require("../../models/Card");
const User = require("../../models/User");

const RARITY_EMOJI = { exceptional: "🌟", special: "🟪", rare: "🟦", common: "⬜" };
const RARITY_ORDER = { exceptional: 0, special: 1, rare: 2, common: 3 };
const DUCK_COIN    = "<:duck_coin:1494344514465431614>";
const TRADE_TIMEOUT = 5 * 60 * 1000;

async function getCardOptions(userId) {
  const playerCards = await PlayerCard.find({ userId, isBurned: false, isInTeam: false })
    .sort({ createdAt: -1 }).limit(100);
  const cardIds = [...new Set(playerCards.map(pc => pc.cardId))];
  const cards   = await Card.find({ cardId: { $in: cardIds } });
  const cardMap = Object.fromEntries(cards.map(c => [c.cardId, c]));
  return playerCards
    .filter(pc => cardMap[pc.cardId])
    .sort((a, b) => (RARITY_ORDER[cardMap[a.cardId]?.rarity] ?? 9) - (RARITY_ORDER[cardMap[b.cardId]?.rarity] ?? 9))
    .slice(0, 24) // leave 1 slot for "None"
    .map(pc => {
      const card = cardMap[pc.cardId];
      return {
        pcId: pc._id.toString(), label: `${card.name} — Lv.${pc.level}`,
        description: `${card.anime} · Print #${pc.printNumber} · ${card.rarity}`,
        emoji: RARITY_EMOJI[card.rarity] ?? "⬜",
        cardName: card.name, printNumber: pc.printNumber,
        imageUrl: card.imageUrl, rarity: card.rarity,
      };
    });
}

function formatOffer(card, gold, premium) {
  const parts = [];
  if (card) parts.push(`${RARITY_EMOJI[card.rarity] ?? "⬜"} **${card.cardName}** #${card.printNumber}`);
  if (gold)    parts.push(`${DUCK_COIN} **${gold.toLocaleString()}** Duckcoin`);
  if (premium) parts.push(`💎 **${premium.toLocaleString()}** Premium`);
  return parts.length ? parts.join("\n") : "*Nothing offered*";
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("trade")
    .setDescription("Trade cards and/or currency with another player")
    .addUserOption(opt =>
      opt.setName("user").setDescription("The player you want to trade with").setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const initiator = await requireProfile(interaction);
    if (!initiator) return;

    const targetDiscord = interaction.options.getUser("user");
    if (targetDiscord.id === interaction.user.id) return interaction.editReply({ content: "You can't trade with yourself!" });
    if (targetDiscord.bot) return interaction.editReply({ content: "You can't trade with a bot!" });

    const targetProfile = await User.findOne({ userId: targetDiscord.id });
    if (!targetProfile) return interaction.editReply({ content: `**${targetDiscord.username}** doesn't have a profile yet.` });

    // ── Step 1: Trade request ─────────────────────────────────────────────────
    const requestEmbed = new EmbedBuilder()
      .setTitle("Trade Request")
      .setDescription(`Hey <@${targetDiscord.id}>! **${interaction.user.username}** would like to trade with you.\nDo you want to begin trading?`)
      .setColor(0x5B21B6);

    const requestRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("trade_accept").setLabel("Accepted").setEmoji("✅").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("trade_reject").setLabel("Reject").setEmoji("❌").setStyle(ButtonStyle.Danger),
    );

    const msg = await interaction.editReply({ embeds: [requestEmbed], components: [requestRow] });

    let accepted = false;
    try {
      const response = await msg.awaitMessageComponent({
        filter: i => i.user.id === targetDiscord.id && ["trade_accept","trade_reject"].includes(i.customId),
        time: TRADE_TIMEOUT,
      });
      if (response.customId === "trade_reject") {
        await response.update({ embeds: [new EmbedBuilder().setTitle("Trade Rejected").setDescription(`**${targetDiscord.username}** declined the trade.`).setColor(0xE53935)], components: [] });
        return;
      }
      accepted = true;
      await response.deferUpdate();
    } catch {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setTitle("Trade Request").setDescription(`Hey <@${targetDiscord.id}>! **${interaction.user.username}** would like to trade with you.\n\n*Trade request expired due to inactivity.*`).setColor(0x888888)],
        components: [],
      });
      return;
    }

    // ── Step 2: Build offers ──────────────────────────────────────────────────
    const [initiatorOptions, targetOptions] = await Promise.all([
      getCardOptions(interaction.user.id),
      getCardOptions(targetDiscord.id),
    ]);

    // State for each side
    const offer = {
      [interaction.user.id]: { card: null, gold: 0, premium: 0, confirmed: false },
      [targetDiscord.id]:    { card: null, gold: 0, premium: 0, confirmed: false },
    };

    // ── Helpers ───────────────────────────────────────────────────────────────
    function buildTradeEmbed() {
      const io = offer[interaction.user.id];
      const to = offer[targetDiscord.id];
      return new EmbedBuilder()
        .setTitle("Trade in Progress")
        .setDescription(`**${interaction.user.username}** ⇌ **${targetDiscord.username}**`)
        .addFields(
          {
            name: `${interaction.user.username}${io.confirmed ? " ✅ Confirmed" : ""}`,
            value: formatOffer(io.card, io.gold, io.premium),
            inline: true,
          },
          {
            name: `${targetDiscord.username}${to.confirmed ? " ✅ Confirmed" : ""}`,
            value: formatOffer(to.card, to.gold, to.premium),
            inline: true,
          },
        )
        .setColor(0x5B21B6)
        .setFooter({ text: "Select a card and/or add currency, then confirm." });
    }

    function buildCardSelect(userId) {
      const opts = userId === interaction.user.id ? initiatorOptions : targetOptions;
      const options = [
        new StringSelectMenuOptionBuilder().setLabel("No card").setDescription("Offer currency only").setValue("none").setEmoji("❌"),
        ...opts.map(o =>
          new StringSelectMenuOptionBuilder()
            .setLabel(o.label).setDescription(o.description).setValue(o.pcId).setEmoji(o.emoji)
        ),
      ];
      return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`trade_card_${userId}`)
          .setPlaceholder("Select a card to offer (optional)")
          .addOptions(options)
      );
    }

    function buildCurrencyRow(userId) {
      const o = offer[userId];
      const goldLabel    = o.gold    ? `${o.gold.toLocaleString()} Duckcoin`    : "Add Duckcoin";
      const premiumLabel = o.premium ? `${o.premium.toLocaleString()} Premium`  : "Add Premium";
      const confirmLabel = o.confirmed ? "Confirmed ✅" : "Confirm";
      const canConfirm   = !o.confirmed && (o.card || o.gold > 0 || o.premium > 0);
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`trade_gold_${userId}`).setLabel(goldLabel).setEmoji("🪙").setStyle(o.gold ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`trade_premium_${userId}`).setLabel(premiumLabel).setEmoji("💎").setStyle(o.premium ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`trade_confirm_${userId}`).setLabel(confirmLabel).setStyle(o.confirmed ? ButtonStyle.Success : ButtonStyle.Primary).setDisabled(!canConfirm),
        new ButtonBuilder().setCustomId("trade_cancel").setLabel("Cancel").setStyle(ButtonStyle.Danger),
      );
    }

    function buildComponents() {
      return [
        buildCardSelect(interaction.user.id),
        buildCurrencyRow(interaction.user.id),
        buildCardSelect(targetDiscord.id),
        buildCurrencyRow(targetDiscord.id),
      ];
    }

    await interaction.editReply({ embeds: [buildTradeEmbed()], components: buildComponents() });

    // ── Step 3: Collector ─────────────────────────────────────────────────────
    const collector = msg.createMessageComponentCollector({
      filter: i => [interaction.user.id, targetDiscord.id].includes(i.user.id),
      time: TRADE_TIMEOUT,
    });

    collector.on("collect", async i => {
      const uid    = i.user.id;
      const o      = offer[uid];
      const isInitiator = uid === interaction.user.id;
      const opts   = isInitiator ? initiatorOptions : targetOptions;

      // Only allow each player to interact with their own controls
      const myCardId    = `trade_card_${uid}`;
      const myGoldId    = `trade_gold_${uid}`;
      const myPremiumId = `trade_premium_${uid}`;
      const myConfirmId = `trade_confirm_${uid}`;

      if (![myCardId, myGoldId, myPremiumId, myConfirmId, "trade_cancel"].includes(i.customId)) {
        await i.reply({ content: "That's not your trade section!", ephemeral: true });
        return;
      }

      if (i.customId === "trade_cancel") {
        await i.deferUpdate();
        collector.stop("cancelled");
        return;
      }

      // Card select
      if (i.customId === myCardId) {
        await i.deferUpdate();
        const val = i.values[0];
        o.card = val === "none" ? null : opts.find(x => x.pcId === val) ?? null;
        o.confirmed = false;
      }

      // Gold modal
      else if (i.customId === myGoldId) {
        const userProfile = isInitiator ? initiator : targetProfile;
        const modal = new ModalBuilder()
          .setCustomId(`trade_gold_modal_${uid}`)
          .setTitle("Add Duckcoin to Trade")
          .addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("amount")
              .setLabel(`How much? (you have ${userProfile.currency.gold.toLocaleString()})`)
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("0")
              .setValue(o.gold ? String(o.gold) : "")
              .setRequired(true)
          ));
        await i.showModal(modal);
        try {
          const modalI = await i.awaitModalSubmit({ filter: m => m.customId === `trade_gold_modal_${uid}` && m.user.id === uid, time: 60_000 });
          await modalI.deferUpdate();
          const val = parseInt(modalI.fields.getTextInputValue("amount").replace(/\D/g,"")) || 0;
          const userProf = await User.findOne({ userId: uid });
          o.gold = Math.min(val, userProf?.currency.gold ?? 0);
          o.confirmed = false;
        } catch { return; }
      }

      // Premium modal
      else if (i.customId === myPremiumId) {
        const userProfile = isInitiator ? initiator : targetProfile;
        const modal = new ModalBuilder()
          .setCustomId(`trade_premium_modal_${uid}`)
          .setTitle("Add Premium to Trade")
          .addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("amount")
              .setLabel(`How much? (you have ${userProfile.currency.premiumCurrency})`)
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("0")
              .setValue(o.premium ? String(o.premium) : "")
              .setRequired(true)
          ));
        await i.showModal(modal);
        try {
          const modalI = await i.awaitModalSubmit({ filter: m => m.customId === `trade_premium_modal_${uid}` && m.user.id === uid, time: 60_000 });
          await modalI.deferUpdate();
          const val = parseInt(modalI.fields.getTextInputValue("amount").replace(/\D/g,"")) || 0;
          const userProf = await User.findOne({ userId: uid });
          o.premium = Math.min(val, userProf?.currency.premiumCurrency ?? 0);
          o.confirmed = false;
        } catch { return; }
      }

      // Confirm
      else if (i.customId === myConfirmId) {
        await i.deferUpdate();
        o.confirmed = true;
      }

      // Check both confirmed
      const allConfirmed = offer[interaction.user.id].confirmed && offer[targetDiscord.id].confirmed;
      if (allConfirmed) { collector.stop("completed"); return; }

      await interaction.editReply({ embeds: [buildTradeEmbed()], components: buildComponents() });
    });

    // ── Step 4: Execute ───────────────────────────────────────────────────────
    collector.on("end", async (_, reason) => {
      if (reason === "cancelled") {
        return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("Trade Cancelled").setDescription("The trade was cancelled.").setColor(0xE53935)], components: [] });
      }
      if (reason !== "completed") {
        return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("Trade Expired").setDescription("The trade expired due to inactivity.").setColor(0x888888)], components: [] });
      }

      try {
        const io = offer[interaction.user.id];
        const to = offer[targetDiscord.id];

        // Validate balances one last time
        const [iFresh, tFresh] = await Promise.all([
          User.findOne({ userId: interaction.user.id }),
          User.findOne({ userId: targetDiscord.id }),
        ]);
        if (io.gold    > (iFresh?.currency.gold ?? 0))            return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("Trade Failed").setDescription(`**${interaction.user.username}** doesn't have enough Duckcoin.`).setColor(0xE53935)], components: [] });
        if (io.premium > (iFresh?.currency.premiumCurrency ?? 0)) return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("Trade Failed").setDescription(`**${interaction.user.username}** doesn't have enough Premium.`).setColor(0xE53935)], components: [] });
        if (to.gold    > (tFresh?.currency.gold ?? 0))            return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("Trade Failed").setDescription(`**${targetDiscord.username}** doesn't have enough Duckcoin.`).setColor(0xE53935)], components: [] });
        if (to.premium > (tFresh?.currency.premiumCurrency ?? 0)) return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("Trade Failed").setDescription(`**${targetDiscord.username}** doesn't have enough Premium.`).setColor(0xE53935)], components: [] });

        // Swap cards
        if (io.card) await PlayerCard.findByIdAndUpdate(io.card.pcId, { userId: targetDiscord.id });
        if (to.card) await PlayerCard.findByIdAndUpdate(to.card.pcId, { userId: interaction.user.id });

        // Transfer currency (initiator → target, target → initiator)
        const iGoldDelta    = (to.gold    - io.gold);
        const iPremiumDelta = (to.premium - io.premium);
        await User.findOneAndUpdate({ userId: interaction.user.id }, { $inc: { "currency.gold": iGoldDelta, "currency.premiumCurrency": iPremiumDelta } });
        await User.findOneAndUpdate({ userId: targetDiscord.id },    { $inc: { "currency.gold": -iGoldDelta, "currency.premiumCurrency": -iPremiumDelta } });

        const completedEmbed = new EmbedBuilder()
          .setTitle("Trade Completed")
          .setDescription(`**${interaction.user.username}** ⇌ **${targetDiscord.username}**\n\nStatus: **Completed**`)
          .addFields(
            { name: `${interaction.user.username} ✅ Confirmed`, value: formatOffer(io.card, io.gold, io.premium), inline: true },
            { name: `${targetDiscord.username} ✅ Confirmed`,   value: formatOffer(to.card, to.gold, to.premium),  inline: true },
          )
          .setColor(0x16a34a)
          .setFooter({ text: "Trade completed." });

        if (io.card?.imageUrl) completedEmbed.setThumbnail(io.card.imageUrl);

        await interaction.editReply({ embeds: [completedEmbed], components: [] });
      } catch {
        await interaction.editReply({ embeds: [new EmbedBuilder().setTitle("Trade Error").setDescription("Something went wrong. Please try again.").setColor(0xE53935)], components: [] });
      }
    });
  },
};
