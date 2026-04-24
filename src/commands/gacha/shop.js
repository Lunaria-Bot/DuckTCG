const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} = require("discord.js");
const { requireProfile } = require("../../utils/requireProfile");
const User = require("../../models/User");
const Card = require("../../models/Card");
const PlayerCard = require("../../models/PlayerCard");
const { drawCard } = require("../../services/gacha");
const { dantianMax } = require("../../services/mana");

const NYAN   = "<:Nyan:1495048966528831508>";
const JADE   = "<:Jade:1496624534139179009>";
const QI     = "<:Qi:1496984846566818022>";
const DANTIAN = "<:Dantian:1495528597610303608>";
const PERMA  = "<:perma_ticket:1494344593863344258>";

// ─── Shop items ───────────────────────────────────────────────────────────────
const NYANG_ITEMS = [
  {
    id: "roll_upgrade",
    name: "Roll Limit Upgrade",
    desc: "Permanently increase your max rolls per command from 5 → 7.",
    price: 50000,
    currency: "gold",
    emoji: QI,
    limit: "once",
    buy: async (user) => {
      if (user.shopLimits?.rollUpgradeBought) return { error: "You already purchased this upgrade." };
      const cost_ru = applyDiscount(50000, user.isPremium);
      if ((user.currency?.gold ?? 0) < cost_ru) return { error: `Not enough ${NYAN} Nyang.` };
      await User.findOneAndUpdate({ userId: user.userId }, {
        rollLimit: 7,
        "shopLimits.rollUpgradeBought": true,
        $inc: { "currency.gold": -cost_ru },
      });
      return { msg: `${QI} Your roll limit has been permanently upgraded to **7**!` };
    },
  },
  {
    id: "perm_ticket_10",
    name: "10× Regular Ticket",
    desc: `Receive 10 Regular Tickets for banner pulls.`,
    price: 30000,
    currency: "gold",
    emoji: PERMA,
    limit: "unlimited",
    buy: async (user) => {
      const cost_pt = applyDiscount(30000, user.isPremium);
      if ((user.currency?.gold ?? 0) < cost_pt) return { error: `Not enough ${NYAN} Nyang.` };
      await User.findOneAndUpdate({ userId: user.userId }, {
        $inc: { "currency.gold": -cost_pt, "currency.regularTickets": 10 },
      });
      return { msg: `${PERMA} You received **10 Regular Tickets**!` };
    },
  },
  {
    id: "talisman_common",
    name: "Common Talisman ×5",
    desc: "70% on Common · 50% on Rare · 40% on Special",
    price: 2000,
    currency: "gold",
    emoji: "📜",
    limit: "unlimited",
    buy: async (user) => {
      const cost = applyDiscount(2000, user.isPremium);
      if ((user.currency?.gold ?? 0) < cost) return { error: `Not enough Nyang.` };
      await User.findOneAndUpdate({ userId: user.userId }, {
        $inc: { "currency.gold": -cost, "items.talismanCommon": 5 },
      });
      return { msg: `📜 You received **5× Common Talisman**!` };
    },
  },
  {
    id: "talisman_uncommon",
    name: "Uncommon Talisman ×3",
    desc: "80% on Common · 60% on Rare · 60% on Special",
    price: 6000,
    currency: "gold",
    emoji: "📋",
    limit: "unlimited",
    buy: async (user) => {
      const cost = applyDiscount(6000, user.isPremium);
      if ((user.currency?.gold ?? 0) < cost) return { error: `Not enough Nyang.` };
      await User.findOneAndUpdate({ userId: user.userId }, {
        $inc: { "currency.gold": -cost, "items.talismanUncommon": 3 },
      });
      return { msg: `📋 You received **3× Uncommon Talisman**!` };
    },
  },
  {
    id: "talisman_divine",
    name: "Divine Talisman ×1",
    desc: "95% on Common · 90% on Rare · 80% on Special",
    price: 20000,
    currency: "gold",
    emoji: "✴️",
    limit: "unlimited",
    buy: async (user) => {
      const cost = applyDiscount(20000, user.isPremium);
      if ((user.currency?.gold ?? 0) < cost) return { error: `Not enough Nyang.` };
      await User.findOneAndUpdate({ userId: user.userId }, {
        $inc: { "currency.gold": -cost, "items.talismanDivine": 1 },
      });
      return { msg: `✴️ You received **1× Divine Talisman**!` };
    },
  },
  {
    id: "talisman_exceptional",
    name: "Exceptional Talisman x1",
    desc: "100% capture on ANY rarity card",
    price: 200000,
    currency: "gold",
    emoji: "🌟",
    limit: "unlimited",
    buy: async (user) => {
      const cost = applyDiscount(200000, user.isPremium);
      if ((user.currency?.gold ?? 0) < cost) return { error: `Not enough Nyang. You need ${cost.toLocaleString()} Nyang.` };
      await User.findOneAndUpdate({ userId: user.userId }, {
        $inc: { "currency.gold": -cost, "items.talismanExceptional": 1 },
      });
      return { msg: "🌟 You received **1x Exceptional Talisman**! 100% capture guaranteed." };
    },
  },
  {
    id: "faction_pass",
    name: "Faction Pass",
    desc: "Monthly pass allowing you to change your Faction (feature coming soon). One per month.",
    price: 15000,
    currency: "gold",
    emoji: "🎫",
    limit: "monthly",
    buy: async (user) => {
      const cost_fp = applyDiscount(15000, user.isPremium);
      if ((user.currency?.gold ?? 0) < cost_fp) return { error: `Not enough ${NYAN} Nyang.` };
      const now = new Date();
      const last = user.shopLimits?.factionPassLastBought ? new Date(user.shopLimits.factionPassLastBought) : null;
      if (last) {
        const sameMonth = last.getUTCMonth() === now.getUTCMonth() && last.getUTCFullYear() === now.getUTCFullYear();
        if (sameMonth) return { error: "You already bought the Faction Pass this month." };
      }
      await User.findOneAndUpdate({ userId: user.userId }, {
        $inc: { "currency.gold": -cost_fp },
        "shopLimits.factionPassLastBought": now,
      });
      return { msg: "🎫 **Faction Pass** purchased! Your access has been granted for this month." };
    },
  },
  {
    id: "lesser_qi_pill",
    name: "Lesser Qi Pill",
    desc: `A pill that restores **1/4** of your ${DANTIAN} Dantian capacity. Max 2 per week.`,
    price: 8000,
    currency: "gold",
    emoji: DANTIAN,
    limit: "2/week",
    buy: async (user) => {
      const cost_pill = applyDiscount(8000, user.isPremium);
      if ((user.currency?.gold ?? 0) < cost_pill) return { error: `Not enough ${NYAN} Nyang.` };
      const now = new Date();
      let weekCount = user.shopLimits?.lesserQiPillWeekly ?? 0;
      const lastReset = user.shopLimits?.lesserQiPillWeekReset ? new Date(user.shopLimits.lesserQiPillWeekReset) : null;
      if (lastReset) {
        const msInWeek = 7 * 24 * 60 * 60 * 1000;
        if (now - lastReset >= msInWeek) weekCount = 0; // reset
      }
      if (weekCount >= 2) return { error: "You've already bought 2 Lesser Qi Pills this week. Resets Monday." };
      await User.findOneAndUpdate({ userId: user.userId }, {
        $inc: { "currency.gold": -cost_pill, "items.lesserQiPill": 1 },
        "shopLimits.lesserQiPillWeekly": weekCount + 1,
        "shopLimits.lesserQiPillWeekReset": lastReset && (now - lastReset < 7 * 24 * 60 * 60 * 1000) ? lastReset : now,
      });
      return { msg: `${DANTIAN} **Lesser Qi Pill** added to your items! Use \`/use pill\` to restore your Dantian.` };
    },
  },
];

const JADE_ITEMS = [
  {
    id: "gear_box",
    name: "Gear Box",
    desc: "A mysterious box containing random gear for your cards.",
    price: 50,
    currency: "premiumCurrency",
    emoji: "📦",
    limit: "unlimited",
    buy: async (user) => {
      const cost_gb = applyDiscount(50, user.isPremium);
      if ((user.currency?.premiumCurrency ?? 0) < cost_gb) return { error: `Not enough ${JADE} Jade.` };
      await User.findOneAndUpdate({ userId: user.userId }, {
        $inc: { "currency.premiumCurrency": -cost_gb, "items.gearBox": 1 },
      });
      return { msg: "📦 **Gear Box** added to your items!" };
    },
  },
  {
    id: "pet_treat_box",
    name: "Pet Treat Box",
    desc: "A box filled with treats to train and bond with your pets.",
    price: 30,
    currency: "premiumCurrency",
    emoji: "🐾",
    limit: "unlimited",
    buy: async (user) => {
      const cost_pb = applyDiscount(30, user.isPremium);
      if ((user.currency?.premiumCurrency ?? 0) < cost_pb) return { error: `Not enough ${JADE} Jade.` };
      await User.findOneAndUpdate({ userId: user.userId }, {
        $inc: { "currency.premiumCurrency": -cost_pb, "items.petTreatBox": 1 },
      });
      return { msg: "🐾 **Pet Treat Box** added to your items!" };
    },
  },
  {
    id: "premium",
    name: "Premium Membership",
    desc: "Unlock Premium status for 30 days — exclusive perks, bonus rewards and special cosmetics.",
    price: 200,
    currency: "premiumCurrency",
    emoji: "💎",
    limit: "unlimited",
    buy: async (user) => {
      if ((user.currency?.premiumCurrency ?? 0) < 200) return { error: `Not enough ${JADE} Jade. You need 200 Jade.` };
      const now = new Date();
      const currentExpiry = user.premiumUntil && new Date(user.premiumUntil) > now ? new Date(user.premiumUntil) : now;
      const newExpiry = new Date(currentExpiry.getTime() + 30 * 24 * 60 * 60 * 1000);
      await User.findOneAndUpdate({ userId: user.userId }, {
        $inc: { "currency.premiumCurrency": -200 },
        isPremium: true,
        premiumUntil: newExpiry,
      });
      const d = newExpiry.toISOString().slice(0, 10);
      return { msg: `💎 **Premium** activated until **${d}**!` };
    },
  },
  {
    id: "special_card_box",
    name: "Special Card Box",
    desc: "Roll a random **Special** rarity card.",
    price: 150,
    currency: "premiumCurrency",
    emoji: "<:Special:1496599588902273187>",
    limit: "unlimited",
    buy: async (user) => {
      const cost_scb = applyDiscount(150, user.isPremium);
      if ((user.currency?.premiumCurrency ?? 0) < cost_scb) return { error: `Not enough ${JADE} Jade.` };
      // Pick a random Special card
      const specialCards = await Card.find({ rarity: "special", isAvailable: true });
      if (!specialCards.length) return { error: "No special cards available right now." };
      const card = specialCards[Math.floor(Math.random() * specialCards.length)];
      // Add to player collection
      const existing = await PlayerCard.findOne({ userId: user.userId, cardId: card.cardId });
      if (existing) {
        await existing.updateOne({ $inc: { quantity: 1 } });
      } else {
        await PlayerCard.create({ userId: user.userId, cardId: card.cardId, quantity: 1, level: 1 });
      }
      await User.findOneAndUpdate({ userId: user.userId }, {
        $inc: { "currency.premiumCurrency": -cost_scb, "stats.totalCardsEverObtained": 1 },
      });
      return { msg: `<:Special:1496599588902273187> You received **${card.name}** *(${card.anime})* — Special card!`, thumbnail: card.imageUrl };
    },
  },
];

// ─── Embed builders ───────────────────────────────────────────────────────────
const PREMIUM_DISCOUNT = 0.075; // 7.5% discount for Premium users

function applyDiscount(price, isPremium) {
  if (!isPremium) return price;
  return Math.floor(price * (1 - PREMIUM_DISCOUNT));
}

function buildShopEmbed(tab, user) {
  const items    = tab === "nyang" ? NYANG_ITEMS : JADE_ITEMS;
  const isPrem   = user?.isPremium ?? false;
  const balance  = tab === "nyang"
    ? (user?.currency?.gold ?? 0)
    : (user?.currency?.premiumCurrency ?? 0);
  const balStr   = tab === "nyang"
    ? `${NYAN} **${balance.toLocaleString()}** Nyang`
    : `${JADE} **${balance.toLocaleString()}** Jade`;

  const sep = "═".repeat(28);

  // Header
  const headerLines = [
    balStr,
    isPrem ? `💎 **Premium** — 7.5% discount applied!` : `💎 Get **Premium** for a 7.5% discount`,
    ``,
    `\`${"─".repeat(30)}\``,
  ];

  const itemLines = items.map((item, i) => {
    const basePrice = item.price;
    const finalPrice = applyDiscount(basePrice, isPrem);
    const priceTag = tab === "nyang"
      ? `${NYAN} **${finalPrice.toLocaleString()}**${isPrem && finalPrice < basePrice ? ` ~~${basePrice.toLocaleString()}~~` : ""}`
      : `${JADE} **${finalPrice}**${isPrem && finalPrice < basePrice ? ` ~~${basePrice}~~` : ""}`;
    const limitTag = item.limit !== "unlimited"
      ? ` · *${item.limit}*`
      : "";
    return `**${i + 1}.** ${item.emoji} **${item.name}**${limitTag} — ${priceTag}`;
  });

  const description = [
    ...headerLines,
    ...itemLines,
    `\`${"─".repeat(30)}\``,
    `Use the dropdown below to purchase an item.`,
  ].join("\n");

  return new EmbedBuilder()
    .setTitle(tab === "nyang" ? `${NYAN} Nyang Shop` : `${JADE} Jade Shop`)
    .setDescription(description)
    .setColor(tab === "nyang" ? 0xf59e0b : 0x7c3aed)
    .setFooter({ text: isPrem ? "💎 Premium discount active — 7.5% off all items" : "Get Premium in the Jade shop for 7.5% off" });
}

function buildTabRow(tab) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("shop_nyang").setLabel("🪙 Nyang Shop").setStyle(tab === "nyang" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("shop_jade").setLabel("💎 Jade Shop").setStyle(tab === "jade" ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );
}

function buildBuyDropdown(tab, user) {
  const items = tab === "nyang" ? NYANG_ITEMS : JADE_ITEMS;
  const currency = tab === "nyang" ? "Nyang" : "Jade";
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`shop_buy_${tab}`)
      .setPlaceholder(`Select an item to buy...`)
      .addOptions(items.map(item => {
        const isPremUser = user?.isPremium ?? false;
        const discountedPrice = applyDiscount(item.price, isPremUser);
        const priceStr = tab === "nyang" ? `${discountedPrice.toLocaleString()} Nyang${isPremUser && discountedPrice < item.price ? " (discounted)" : ""}` : `${discountedPrice} Jade${isPremUser && discountedPrice < item.price ? " (discounted)" : ""}`;
        const opt = new StringSelectMenuOptionBuilder()
          .setLabel(item.name)
          .setDescription(`${priceStr} · ${item.limit}`)
          .setValue(item.id);
        // Only set emoji for standard Unicode, not custom Discord emojis
        // emoji removed from select options (Discord rejects unicode emoji IDs)
        return opt;
      }))
  );
}

// ─── Command ──────────────────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Browse and purchase items from the SeorinTCG shop"),

  async execute(interaction) {
    await interaction.deferReply();

    let user = await requireProfile(interaction);
    if (!user) return;

    let tab = "nyang";

    const msg = await interaction.editReply({
      embeds: [buildShopEmbed(tab, user)],
      components: [buildTabRow(tab), buildBuyDropdown(tab, user)],
    });

    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 5 * 60 * 1000,
    });

    collector.on("collect", async i => {
      await i.deferUpdate();

      // Tab switch
      if (i.customId === "shop_nyang" || i.customId === "shop_jade") {
        tab = i.customId === "shop_nyang" ? "nyang" : "jade";
        user = await User.findOne({ userId: interaction.user.id });
        return interaction.editReply({
          embeds: [buildShopEmbed(tab, user)],
          components: [buildTabRow(tab), buildBuyDropdown(tab, user)],
        });
      }

      // Buy via dropdown
      if (i.customId === "shop_buy_nyang" || i.customId === "shop_buy_jade") {
        const itemTab = i.customId === "shop_buy_nyang" ? "nyang" : "jade";
        const itemId  = i.values[0];
        const items   = itemTab === "nyang" ? NYANG_ITEMS : JADE_ITEMS;
        const item    = items.find(x => x.id === itemId);
        if (!item) return;

        user = await User.findOne({ userId: interaction.user.id });
        const result = await item.buy(user);

        // Refresh user and update embed
        user = await User.findOne({ userId: interaction.user.id });
        const embed = buildShopEmbed(tab, user);

        if (result.error) {
          await i.followUp({ content: `❌ ${result.error}`, ephemeral: true });
        } else {
          const successEmbed = new EmbedBuilder()
            .setDescription(result.msg)
            .setColor(0x22c55e);
          if (result.thumbnail) successEmbed.setThumbnail(result.thumbnail);
          await i.followUp({ embeds: [successEmbed], ephemeral: true });
        }

        await interaction.editReply({
          embeds: [embed],
          components: [buildTabRow(tab), buildBuyDropdown(tab, user)],
        });
      }
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
