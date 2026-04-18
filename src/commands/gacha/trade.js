const {
  SlashCommandBuilder, EmbedBuilder, AttachmentBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ComponentType,
} = require("discord.js");
const { renderTrade } = require("../../services/tradeRenderer");
const { requireProfile } = require("../../utils/requireProfile");
const PlayerCard = require("../../models/PlayerCard");
const Card = require("../../models/Card");
const User = require("../../models/User");
const { getRedis } = require("../../services/redis");
const { calculateStats } = require("../../services/cardStats");

const RARITY_EMOJI = { exceptional: "🌟", special: "🟪", rare: "🟦", common: "⬜" };
const RARITY_ORDER = { exceptional: 0, special: 1, rare: 2, common: 3 };
const NYAN    = "<:Nyan:1495048966528831508>";
const TRADE_TTL    = 5 * 60; // 5 min Redis TTL

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

// ─── Shared helpers ───────────────────────────────────────────────────────────
async function offerValue(offer) {
  const lines = [];
  for (const cardId of offer.cardIds) {
    const card = await Card.findOne({ cardId });
    if (card) lines.push(`${RARITY_EMOJI[card.rarity] ?? "⬜"} **${card.name}**`);
  }
  if (offer.gold)    lines.push(`${NYAN} **${offer.gold.toLocaleString()}** Nyang`);
  if (offer.premium) lines.push(`💎 **${offer.premium.toLocaleString()}** Premium`);
  return lines.length ? lines.join("\n") : "*Nothing offered yet*";
}

async function getThumb(offer) {
  for (const cardId of offer.cardIds) {
    const card = await Card.findOne({ cardId });
    if (card?.imageUrl) return card.imageUrl;
  }
  return null;
}

async function offerItems(offer) {
  const items = [];
  for (const cardId of offer.cardIds) {
    const card = await Card.findOne({ cardId });
    if (card) items.push({ label: card.name, rarity: card.rarity });
  }
  if (offer.gold)    items.push({ label: `${offer.gold.toLocaleString()} Nyang` });
  if (offer.premium) items.push({ label: `${offer.premium.toLocaleString()} Premium` });
  return items;
}

// ─── Build image payload ──────────────────────────────────────────────────────
async function buildTradePayload(session, completed = false, client = null) {
  const iOffer = session.offers[session.initiatorId];
  const tOffer = session.offers[session.targetId];

  const [iUser, tUser] = await Promise.all([
    User.findOne({ userId: session.initiatorId }),
    User.findOne({ userId: session.targetId }),
  ]);

  const iName = iUser?.username ?? "Player 1";
  const tName = tUser?.username ?? "Player 2";

  const [iItems, tItems] = await Promise.all([
    offerItems(iOffer),
    offerItems(tOffer),
  ]);

  // Fetch Discord avatars
  let iAvatar = null, tAvatar = null;
  if (client) {
    try {
      const [iu, tu] = await Promise.all([
        client.users.fetch(session.initiatorId),
        client.users.fetch(session.targetId),
      ]);
      iAvatar = iu.displayAvatarURL({ extension: "png", size: 128 });
      tAvatar = tu.displayAvatarURL({ extension: "png", size: 128 });
    } catch {}
  }

  const minutesLeft = Math.max(0, Math.round((session.expiresAt - Date.now()) / 60000));

  try {
    const buffer = await renderTrade({
      title:      completed ? "Trade Completed" : "Active Trade",
      subtitle:   `${iName} ⇌ ${tName}`,
      statusText: completed ? "Status: Completed" : "Awaiting confirmations.",
      sections: [
        { name: iName, confirmed: iOffer.confirmed, items: iItems, avatarUrl: iAvatar },
        { name: tName, confirmed: tOffer.confirmed, items: tItems, avatarUrl: tAvatar },
      ],
      footer: completed
        ? "Trade completed."
        : `Trade expires in ${minutesLeft} minute${minutesLeft !== 1 ? "s" : ""} due to inactivity.`,
    });

    const attachment = new AttachmentBuilder(buffer, { name: "trade.png" });
    return { files: [attachment] };
  } catch (err) {
    // Fallback to embed if renderer fails
    console.error("Trade renderer error:", err.message);
    const fallback = new EmbedBuilder()
      .setTitle(completed ? "Trade Completed" : "Active Trade")
      .setDescription(`**${iName}** ⇌ **${tName}**\n\n${completed ? "Status: **Completed**" : "Awaiting confirmations."}`)
      .setColor(completed ? 0x16a34a : 0x5B21B6)
      .addFields(
        { name: `${iName} ${iOffer.confirmed ? "✅" : "⏳"}`, value: (await offerValue(iOffer)), inline: false },
        { name: `${tName} ${tOffer.confirmed ? "✅" : "⏳"}`, value: (await offerValue(tOffer)), inline: false },
      );
    return { embeds: [fallback] };
  }
}

function buildTradeRow(userId, session) {
  const confirmed = session.offers[userId]?.confirmed;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("trade_confirm_btn")
      .setLabel(confirmed ? "Confirmed ✅" : "Confirm Trade")
      .setStyle(ButtonStyle.Success)
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
      .setDescription("Add Nyang or Premium to your trade offer")
      .addStringOption(opt => opt.setName("type").setDescription("Currency type").setRequired(true)
        .addChoices({ name: "Nyang", value: "gold" }, { name: "Premium", value: "premium" }))
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

      // ── Ask target to accept ─────────────────────────────────────────────
      const requestRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("trade_req_accept").setLabel("Accept").setEmoji("✅").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("trade_req_decline").setLabel("Decline").setEmoji("❌").setStyle(ButtonStyle.Danger),
      );

      await interaction.editReply({
        content: `<@${targetDiscord.id}> — **${interaction.user.username}** wants to trade with you!`,
        components: [requestRow],
      });

      let accepted = false;
      try {
        const response = await interaction.fetchReply().then(m =>
          m.awaitMessageComponent({
            filter: i => i.user.id === targetDiscord.id && ["trade_req_accept","trade_req_decline"].includes(i.customId),
            time: 60_000,
          })
        );

        if (response.customId === "trade_req_decline") {
          await response.update({
            content: `❌ **${targetDiscord.username}** declined the trade request.`,
            components: [],
          });
          return;
        }

        accepted = true;
        await response.deferUpdate();
      } catch {
        await interaction.editReply({
          content: `⏰ Trade request expired — **${targetDiscord.username}** didn't respond in time.`,
          components: [],
        });
        return;
      }

      // ── Both agreed — create session ──────────────────────────────────────
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

      // Show the trade embed
      const viewPayload = await buildTradePayload(session, false, interaction.client);
      const tradeRow    = buildTradeRow(uid, session);

      await interaction.editReply({
        content: `✅ Trade started between **${interaction.user.username}** and **${targetDiscord.username}**!\n\nBoth players can now use:\n\`/trade add <card name>\` — add a card\n\`/trade add-currency <type> <amount>\` — add Nyang or Premium\n\`/trade view\` — see the current trade\n\`/trade confirm\` — confirm your side\n\`/trade cancel\` — cancel the trade\n\nTrade expires in 5 minutes.`,
        components: [],
      });

      const msg = await interaction.followUp({ ...viewPayload, components: [tradeRow] });

      // Store message ref so add/remove can update it
      session.liveMessageId = msg.id;
      session.liveChannelId = msg.channelId;
      await saveSession(redis, session);

      // Keep buttons alive for 30 min
      const collector = msg.createMessageComponentCollector({
        filter: i => [uid, targetDiscord.id].includes(i.user.id),
        time: TRADE_TTL * 1000,
      });

      collector.on("collect", async i => {
        await i.deferUpdate();
        if (i.customId === "trade_commands_btn") {
          await i.followUp({
            content: [
              "**Trade Commands:**",
              "`/trade add <card name>` — add a card by name",
              "`/trade add-currency <type> <amount>` — add Nyang or Premium",
              "`/trade remove <card>` — remove a card from your offer",
              "`/trade view` — refresh the trade view",
              "`/trade confirm` — confirm your side",
              "`/trade cancel` — cancel the trade",
            ].join("\n"),
            ephemeral: true,
          });
        } else if (i.customId === "trade_confirm_btn") {
          await i.followUp({ content: "Use `/trade confirm` to confirm your side.", ephemeral: true });
        } else if (i.customId === "trade_cancel_btn") {
          const sess = await getSession(redis, i.user.id);
          if (sess) await deleteSession(redis, sess);
          collector.stop();
          await msg.edit({
            embeds: [new EmbedBuilder().setTitle("Trade Cancelled").setDescription("The trade has been cancelled.").setColor(0xE53935)],
            components: [],
          });
        }
      });

      return;
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

      // Update live trade image
      try {
        const freshSession = await getSession(redis, uid);
        if (freshSession?.liveChannelId && freshSession?.liveMessageId) {
          const ch  = await interaction.client.channels.fetch(freshSession.liveChannelId);
          const lm  = await ch.messages.fetch(freshSession.liveMessageId);
          const updated = await buildTradePayload(freshSession);
          await lm.edit({ ...updated, components: [buildTradeRow(uid, freshSession)] });
        }
      } catch {}
      return interaction.editReply({ content: `Added **${RARITY_EMOJI[card.rarity] ?? "⬜"} ${card.name}** to your trade offer.` });
    }

    // ── ADD CURRENCY ──────────────────────────────────────────────────────────
    if (sub === "add-currency") {
      const type   = interaction.options.getString("type");
      const amount = interaction.options.getInteger("amount");

      const freshUser = await User.findOne({ userId: uid });
      const balance   = type === "gold" ? (freshUser?.currency.gold ?? 0) : (freshUser?.currency.premiumCurrency ?? 0);
      const label     = type === "gold" ? "Nyang" : "Premium";

      if (amount > balance) return interaction.editReply({ content: `You only have **${balance.toLocaleString()}** ${label}.` });

      if (type === "gold") myOffer.gold = amount;
      else myOffer.premium = amount;
      myOffer.confirmed = false;
      await touchSession(redis, session);

      // Update live trade image
      try {
        const freshSession = await getSession(redis, uid);
        if (freshSession?.liveChannelId && freshSession?.liveMessageId) {
          const ch  = await interaction.client.channels.fetch(freshSession.liveChannelId);
          const lm  = await ch.messages.fetch(freshSession.liveMessageId);
          const updated = await buildTradePayload(freshSession);
          await lm.edit({ ...updated, components: [buildTradeRow(uid, freshSession)] });
        }
      } catch {}
      const emoji = type === "gold" ? NYAN : "💎";
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

      // Update live trade image
      try {
        const freshSession = await getSession(redis, uid);
        if (freshSession?.liveChannelId && freshSession?.liveMessageId) {
          const ch  = await interaction.client.channels.fetch(freshSession.liveChannelId);
          const lm  = await ch.messages.fetch(freshSession.liveMessageId);
          const updated = await buildTradePayload(freshSession);
          await lm.edit({ ...updated, components: [buildTradeRow(uid, freshSession)] });
        }
      } catch {}
      return interaction.editReply({ content: `Removed **${card.name}** from your offer.` });
    }

    // ── VIEW ──────────────────────────────────────────────────────────────────
    if (sub === "view") {
      const payload = await buildTradePayload(session, false, interaction.client);
      const row     = buildTradeRow(uid, session);
      const msg     = await interaction.editReply({ ...payload, components: [row] });

      const collector = msg.createMessageComponentCollector({
        filter: i => [session.initiatorId, session.targetId].includes(i.user.id),
        time: 5 * 60 * 1000,
      });

      collector.on("collect", async i => {
        await i.deferUpdate();

        if (i.customId === "trade_commands_btn") {
          await i.followUp({
            content: [
              "**Trade Commands:**",
              "`/trade add <card>` — add a card by name",
              "`/trade add-currency <type> <amount>` — add Nyang or Premium",
              "`/trade remove <card>` — remove a card from your offer",
              "`/trade view` — view the current trade",
              "`/trade confirm` — confirm your side",
              "`/trade cancel` — cancel the trade",
            ].join("\n"),
            ephemeral: true,
          });
        } else if (i.customId === "trade_confirm_btn") {
          await i.followUp({ content: "Use `/trade confirm` to confirm your side.", ephemeral: true });
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
        // Show updated image so partner can see the confirmation
        const updatedPayload = await buildTradePayload(session, false, interaction.client);
        const row = buildTradeRow(uid, session);
        // Update the live message too
        try {
          if (session.liveChannelId && session.liveMessageId) {
            const ch = await interaction.client.channels.fetch(session.liveChannelId);
            const lm = await ch.messages.fetch(session.liveMessageId);
            await lm.edit({ ...updatedPayload, components: [row] });
          }
        } catch {}
        await interaction.editReply({ ...updatedPayload, components: [row] });
        await interaction.followUp({
          content: `✅ You confirmed the trade. Waiting for **${partnerName}** to confirm with \`/trade confirm\`.`,
          ephemeral: true,
        });
        return;
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
          return interaction.editReply({ content: "Trade failed: you don't have enough Nyang anymore." });
        }
        if (partnerOffer.gold > (partnerFresh?.currency.gold ?? 0)) {
          await deleteSession(redis, session);
          return interaction.editReply({ content: `Trade failed: **${partnerName}** doesn't have enough Nyang anymore.` });
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

        const myName       = myFresh?.username ?? uid;
        const partnerName2 = partnerFresh?.username ?? partnerId;
        const donePayload = await buildTradePayload(session, true, interaction.client);
        return interaction.editReply({ ...donePayload, components: [] });
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
