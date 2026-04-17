const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ComponentType,
} = require("discord.js");
const { requireProfile } = require("../../utils/requireProfile");
const PlayerCard = require("../../models/PlayerCard");
const Card = require("../../models/Card");
const User = require("../../models/User");
const { getRedis } = require("../../services/redis");
const { calculateStats } = require("../../services/cardStats");

const RARITY_EMOJI = { exceptional: "🌟", special: "🟪", rare: "🟦", common: "⬜" };
const RARITY_ORDER = { exceptional: 0, special: 1, rare: 2, common: 3 };
const DUCK_COIN    = "<:duck_coin:1494344514465431614>";
const TRADE_TTL    = 30 * 60; // 30 min Redis TTL

// ─── Redis trade session ───────────────────────────────────────────────────────
function tradeKey(userId) { return `trade:${userId}`; }

async function getSession(redis, userId) {
  const raw = await redis.get(tradeKey(userId)).catch(() => null);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function saveSession(redis, session) {
  const ttl = Math.floor((session.expiresAt - Date.now()) / 1000);
  if (ttl <= 0) return;
  await redis.set(tradeKey(session.initiatorId), JSON.stringify(session), "EX", ttl);
  await redis.set(tradeKey(session.targetId),    JSON.stringify(session), "EX", ttl);
}

async function deleteSession(redis, session) {
  await redis.del(tradeKey(session.initiatorId));
  await redis.del(tradeKey(session.targetId));
}

async function touchSession(redis, session) {
  session.expiresAt = Date.now() + TRADE_TTL * 1000;
  await saveSession(redis, session);
}

// ─── Build view embed ──────────────────────────────────────────────────────────
async function buildViewEmbed(session, client) {
  const iOffer = session.offers[session.initiatorId];
  const tOffer = session.offers[session.targetId];

  const [iUser, tUser] = await Promise.all([
    User.findOne({ userId: session.initiatorId }),
    User.findOne({ userId: session.targetId }),
  ]);

  async function offerValue(offer, userId) {
    const lines = [];
    for (const cardId of offer.cardIds) {
      const card = await Card.findOne({ cardId });
      if (card) lines.push(`${RARITY_EMOJI[card.rarity] ?? "⬜"} **${card.name}**`);
    }
    if (offer.gold)    lines.push(`${DUCK_COIN} **${offer.gold.toLocaleString()}** Duckcoin`);
    if (offer.premium) lines.push(`💎 **${offer.premium.toLocaleString()}** Premium`);
    return lines.length ? lines.join("\n") : "*Nothing offered yet*";
  }

  // Get thumbnail from first card in each offer
  async function getThumb(offer) {
    for (const cardId of offer.cardIds) {
      const card = await Card.findOne({ cardId });
      if (card?.imageUrl) return card.imageUrl;
    }
    return null;
  }

  const iValue  = await offerValue(iOffer, session.initiatorId);
  const tValue  = await offerValue(tOffer, session.targetId);
  const iThumb  = await getThumb(iOffer);
  const tThumb  = await getThumb(tOffer);
  const iStatus = iOffer.confirmed ? "✅ Confirmed" : "⏳ Pending";
  const tStatus = tOffer.confirmed ? "✅ Confirmed" : "⏳ Pending";

  const iName = iUser?.username ?? "Player 1";
  const tName = tUser?.username ?? "Player 2";

  const expiresTs = Math.floor(session.expiresAt / 1000);

  // Discord embed image trick: use thumbnail for first card,
  // include second card image in a field if available
  const embed = new EmbedBuilder()
    .setTitle("Active Trade")
    .setDescription(
      `**${iName}** ⇌ **${tName}**\n\nAwaiting confirmations.`
    )
    .addFields(
      {
        name: `${iName} ${iStatus}`,
        value: iValue,
        inline: true,
      },
      {
        name: `${tName} ${tStatus}`,
        value: tValue,
        inline: true,
      },
    )
    .setColor(0x5B21B6)
    .setFooter({ text: `Trade expires <t:${expiresTs}:R> due to inactivity.` });

  // Use first available card image as thumbnail
  if (iThumb) embed.setThumbnail(iThumb);
  else if (tThumb) embed.setThumbnail(tThumb);

  return embed;
}

function buildTradeRow(userId, session) {
  const confirmed = session.offers[userId]?.confirmed;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("trade_confirm_btn")
      .setLabel("Confirm Trade")
      .setStyle(confirmed ? ButtonStyle.Success : ButtonStyle.Success)
      .setDisabled(!!confirmed),
    new ButtonBuilder()
      .setCustomId("trade_commands_btn")
      .setLabel("View Trade Commands")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("trade_cancel_btn")
      .setLabel("Cancel Trade")
      .setStyle(ButtonStyle.Danger),
  );
}

// ─── Command ──────────────────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName("trade")
    .setDescription("Trade cards and currency with another player")
    .addSubcommand(sub => sub
      .setName("start")
      .setDescription("Start a trade with another player")
      .addUserOption(opt => opt.setName("user").setDescription("Player to trade with").setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName("add")
      .setDescription("Add a card to your trade offer")
      .addStringOption(opt => opt.setName("card").setDescription("Card name (partial match)").setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName("add-currency")
      .setDescription("Add Duckcoin or Premium to your trade offer")
      .addStringOption(opt => opt.setName("type").setDescription("Currency type").setRequired(true)
        .addChoices({ name: "Duckcoin", value: "gold" }, { name: "Premium", value: "premium" }))
      .addIntegerOption(opt => opt.setName("amount").setDescription("Amount to add").setRequired(true).setMinValue(1))
    )
    .addSubcommand(sub => sub
      .setName("remove")
      .setDescription("Remove a card from your trade offer")
      .addStringOption(opt => opt.setName("card").setDescription("Card name to remove").setRequired(true))
    )
    .addSubcommand(sub => sub.setName("view").setDescription("View the current trade"))
    .addSubcommand(sub => sub.setName("confirm").setDescription("Confirm the trade"))
    .addSubcommand(sub => sub.setName("cancel").setDescription("Cancel the trade")),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    const user = await requireProfile(interaction);
    if (!user) return;

    const redis = getRedis();
    const sub   = interaction.options.getSubcommand();
    const uid   = interaction.user.id;

    // ── START ────────────────────────────────────────────────────────────────
    if (sub === "start") {
      const existing = await getSession(redis, uid);
      if (existing) return interaction.editReply({ content: "You already have an active trade. Use `/trade cancel` first." });

      const targetDiscord = interaction.options.getUser("user");
      if (targetDiscord.id === uid) return interaction.editReply({ content: "You can't trade with yourself!" });
      if (targetDiscord.bot) return interaction.editReply({ content: "You can't trade with a bot!" });

      const targetProfile = await User.findOne({ userId: targetDiscord.id });
      if (!targetProfile) return interaction.editReply({ content: `**${targetDiscord.username}** doesn't have a profile yet.` });

      const targetExisting = await getSession(redis, targetDiscord.id);
      if (targetExisting) return interaction.editReply({ content: `**${targetDiscord.username}** already has an active trade.` });

      const session = {
        initiatorId: uid,
        targetId: targetDiscord.id,
        expiresAt: Date.now() + TRADE_TTL * 1000,
        offers: {
          [uid]: { cardIds: [], gold: 0, premium: 0, confirmed: false },
          [targetDiscord.id]: { cardIds: [], gold: 0, premium: 0, confirmed: false },
        },
      };
      await saveSession(redis, session);

      const expiresTs = Math.floor(session.expiresAt / 1000);
      return interaction.editReply({
        content: `✅ Trade started between **${interaction.user.username}** and <@${targetDiscord.id}>!\n\nBoth players can now use:\n\`/trade add <card name>\` — add a card\n\`/trade add-currency <type> <amount>\` — add Duckcoin or Premium\n\`/trade view\` — see the current trade\n\`/trade confirm\` — confirm your side\n\`/trade cancel\` — cancel the trade\n\nTrade expires <t:${expiresTs}:R>.`,
      });
    }

    // All other subcommands require an active session
    const session = await getSession(redis, uid);
    if (!session) return interaction.editReply({ content: "You don't have an active trade. Start one with `/trade start @user`." });

    const isInitiator = session.initiatorId === uid;
    const partnerId   = isInitiator ? session.targetId : session.initiatorId;
    const myOffer     = session.offers[uid];

    // ── ADD CARD ─────────────────────────────────────────────────────────────
    if (sub === "add") {
      const query = interaction.options.getString("card");

      // Find a card in their inventory matching the name
      const playerCards = await PlayerCard.find({ userId: uid, isBurned: false, quantity: { $gt: 0 }, isInTeam: false });
      const cardIds = playerCards.map(pc => pc.cardId);
      const card = await Card.findOne({
        cardId: { $in: cardIds },
        name: { $regex: query, $options: "i" },
      });

      if (!card) return interaction.editReply({ content: `No card matching "**${query}**" found in your inventory.` });
      if (myOffer.cardIds.includes(card.cardId)) return interaction.editReply({ content: `**${card.name}** is already in your offer.` });
      if (myOffer.cardIds.length >= 5) return interaction.editReply({ content: "You can add up to 5 cards per trade." });

      myOffer.cardIds.push(card.cardId);
      myOffer.confirmed = false;
      await touchSession(redis, session);

      return interaction.editReply({ content: `Added **${RARITY_EMOJI[card.rarity] ?? "⬜"} ${card.name}** to your trade offer.` });
    }

    // ── ADD CURRENCY ──────────────────────────────────────────────────────────
    if (sub === "add-currency") {
      const type   = interaction.options.getString("type");
      const amount = interaction.options.getInteger("amount");

      const freshUser = await User.findOne({ userId: uid });
      const balance   = type === "gold" ? (freshUser?.currency.gold ?? 0) : (freshUser?.currency.premiumCurrency ?? 0);
      const label     = type === "gold" ? "Duckcoin" : "Premium";

      if (amount > balance) return interaction.editReply({ content: `You only have **${balance.toLocaleString()}** ${label}.` });

      if (type === "gold") myOffer.gold = amount;
      else myOffer.premium = amount;
      myOffer.confirmed = false;
      await touchSession(redis, session);

      const emoji = type === "gold" ? DUCK_COIN : "💎";
      return interaction.editReply({ content: `Set **${emoji} ${amount.toLocaleString()} ${label}** in your trade offer.` });
    }

    // ── REMOVE CARD ───────────────────────────────────────────────────────────
    if (sub === "remove") {
      const query = interaction.options.getString("card");
      const cards = await Card.find({ cardId: { $in: myOffer.cardIds }, name: { $regex: query, $options: "i" } });
      if (!cards.length) return interaction.editReply({ content: `No card matching "**${query}**" in your offer.` });

      const card = cards[0];
      myOffer.cardIds = myOffer.cardIds.filter(id => id !== card.cardId);
      myOffer.confirmed = false;
      await touchSession(redis, session);

      return interaction.editReply({ content: `Removed **${card.name}** from your offer.` });
    }

    // ── VIEW ──────────────────────────────────────────────────────────────────
    if (sub === "view") {
      const embed = await buildViewEmbed(session);
      const row   = buildTradeRow(uid, session);
      const msg   = await interaction.editReply({ embeds: [embed], components: [row] });

      const collector = msg.createMessageComponentCollector({
        filter: i => i.user.id === uid,
        time: 5 * 60 * 1000,
      });

      collector.on("collect", async i => {
        await i.deferUpdate();

        if (i.customId === "trade_commands_btn") {
          await interaction.followUp({
            content: [
              "**Trade Commands:**",
              "`/trade add <card>` — add a card by name",
              "`/trade add-currency <type> <amount>` — add Duckcoin or Premium",
              "`/trade remove <card>` — remove a card from your offer",
              "`/trade view` — view the current trade",
              "`/trade confirm` — confirm your side",
              "`/trade cancel` — cancel the trade",
            ].join("\n"),
            ephemeral: true,
          });
        } else if (i.customId === "trade_confirm_btn") {
          await interaction.followUp({ content: "Use `/trade confirm` to confirm your side.", ephemeral: true });
        } else if (i.customId === "trade_cancel_btn") {
          await deleteSession(redis, session);
          collector.stop();
          await interaction.editReply({
            embeds: [new EmbedBuilder().setTitle("Trade Cancelled").setDescription("The trade has been cancelled.").setColor(0xE53935)],
            components: [],
          });
        }
      });

      return;
    }

    // ── CONFIRM ───────────────────────────────────────────────────────────────
    if (sub === "confirm") {
      myOffer.confirmed = true;
      await saveSession(redis, session);

      const partnerOffer = session.offers[partnerId];
      const partnerName  = (await User.findOne({ userId: partnerId }))?.username ?? "your partner";

      if (!partnerOffer.confirmed) {
        return interaction.editReply({ content: `✅ You confirmed the trade. Waiting for **${partnerName}** to confirm.` });
      }

      // Both confirmed — execute trade
      try {
        // Validate balances
        const [myFresh, partnerFresh] = await Promise.all([
          User.findOne({ userId: uid }),
          User.findOne({ userId: partnerId }),
        ]);

        if (myOffer.gold > (myFresh?.currency.gold ?? 0)) {
          await deleteSession(redis, session);
          return interaction.editReply({ content: "Trade failed: you don't have enough Duckcoin anymore." });
        }
        if (partnerOffer.gold > (partnerFresh?.currency.gold ?? 0)) {
          await deleteSession(redis, session);
          return interaction.editReply({ content: `Trade failed: **${partnerName}** doesn't have enough Duckcoin anymore.` });
        }

        // Transfer cards
        for (const cardId of myOffer.cardIds) {
          const card = await Card.findOne({ cardId });
          await PlayerCard.findOneAndUpdate({ userId: uid, cardId }, { $inc: { quantity: -1 } });
          await PlayerCard.findOneAndUpdate(
            { userId: partnerId, cardId },
            { $inc: { quantity: 1 }, $setOnInsert: { level: 1, cachedStats: calculateStats(card, 1) } },
            { upsert: true, new: true }
          );
        }
        for (const cardId of partnerOffer.cardIds) {
          const card = await Card.findOne({ cardId });
          await PlayerCard.findOneAndUpdate({ userId: partnerId, cardId }, { $inc: { quantity: -1 } });
          await PlayerCard.findOneAndUpdate(
            { userId: uid, cardId },
            { $inc: { quantity: 1 }, $setOnInsert: { level: 1, cachedStats: calculateStats(card, 1) } },
            { upsert: true, new: true }
          );
        }

        // Transfer currency
        const myGoldDelta    = partnerOffer.gold    - myOffer.gold;
        const myPremiumDelta = partnerOffer.premium - myOffer.premium;
        await User.findOneAndUpdate({ userId: uid },       { $inc: { "currency.gold": myGoldDelta, "currency.premiumCurrency": myPremiumDelta } });
        await User.findOneAndUpdate({ userId: partnerId }, { $inc: { "currency.gold": -myGoldDelta, "currency.premiumCurrency": -myPremiumDelta } });

        await deleteSession(redis, session);

        // Build completion embed
        async function summaryLines(offer, ownerId) {
          const lines = [];
          for (const cardId of offer.cardIds) {
            const card = await Card.findOne({ cardId });
            if (card) lines.push(`${RARITY_EMOJI[card.rarity] ?? "⬜"} **${card.name}**`);
          }
          if (offer.gold)    lines.push(`${DUCK_COIN} **${offer.gold.toLocaleString()}** Duckcoin`);
          if (offer.premium) lines.push(`💎 **${offer.premium.toLocaleString()}** Premium`);
          return lines.length ? lines.join("\n") : "*Nothing*";
        }

        const myName      = myFresh?.username ?? uid;
        const partnerName2 = partnerFresh?.username ?? partnerId;

        const doneEmbed = new EmbedBuilder()
          .setTitle("Trade Completed ✅")
          .setDescription(`**${myName}** ⇌ **${partnerName2}**`)
          .addFields(
            { name: `${myName} gave`,      value: await summaryLines(myOffer, uid),       inline: true },
            { name: `${partnerName2} gave`, value: await summaryLines(partnerOffer, partnerId), inline: true },
          )
          .setColor(0x16a34a)
          .setFooter({ text: "Trade completed." });

        return interaction.editReply({ embeds: [doneEmbed], components: [] });
      } catch (err) {
        await deleteSession(redis, session);
        return interaction.editReply({ content: "Something went wrong during the trade. It has been cancelled." });
      }
    }

    // ── CANCEL ────────────────────────────────────────────────────────────────
    if (sub === "cancel") {
      await deleteSession(redis, session);
      return interaction.editReply({ content: "Trade cancelled." });
    }
  },
};
