const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require("discord.js");
const { requireProfile } = require("../../utils/requireProfile");
const User       = require("../../models/User");
const Card       = require("../../models/Card");
const PlayerCard = require("../../models/PlayerCard");

const NYAN    = "<:Nyan:1495048966528831508>";
const JADE    = "<:Jade:1496624534139179009>";
const QI      = "<:Qi:1496984846566818022>";
const DANTIAN = "<:Dantian:1495528597610303608>";
const PERMA   = "<:perma_ticket:1494344593863344258>";

const PREMIUM_DISCOUNT = 0.075;
function applyDiscount(price, isPremium) {
  return isPremium ? Math.floor(price * (1 - PREMIUM_DISCOUNT)) : price;
}

// ─── Items (unit price × qty, bought per 1) ───────────────────────────────────
const NYANG_ITEMS = [
  {
    id: "roll_upgrade",
    name: "Roll Limit Upgrade",
    desc: "Permanently increases your max rolls from 5 → 7.",
    price: 50000, currency: "gold", emoji: "⬆️", limit: "once",
    maxQty: 1,
    buy: async (user, qty) => {
      if (user.shopLimits?.rollUpgradeBought) return { error: "Already purchased." };
      const cost = applyDiscount(50000, user.isPremium);
      if ((user.currency?.gold ?? 0) < cost) return { error: `Not enough ${NYAN} Nyang.` };
      await User.findOneAndUpdate({ userId: user.userId }, { rollLimit: 7, "shopLimits.rollUpgradeBought": true, $inc: { "currency.gold": -cost } });
      return { msg: `⬆️ Roll limit upgraded to **7**!` };
    },
  },
  {
    id: "perm_ticket",
    name: "Regular Ticket",
    desc: "Used for banner pulls.",
    price: 3000, currency: "gold", emoji: PERMA, limit: "unlimited",
    maxQty: 100,
    buy: async (user, qty) => {
      const cost = applyDiscount(3000, user.isPremium) * qty;
      if ((user.currency?.gold ?? 0) < cost) return { error: `Not enough ${NYAN} Nyang.` };
      await User.findOneAndUpdate({ userId: user.userId }, { $inc: { "currency.gold": -cost, "currency.regularTickets": qty } });
      return { msg: `${PERMA} You received **${qty}× Regular Ticket**!` };
    },
  },
  {
    id: "talisman_common",
    name: "Common Talisman",
    desc: "70% Common · 50% Rare · 40% Special",
    price: 400, currency: "gold", emoji: "📜", limit: "unlimited",
    maxQty: 99,
    buy: async (user, qty) => {
      const cost = applyDiscount(400, user.isPremium) * qty;
      if ((user.currency?.gold ?? 0) < cost) return { error: `Not enough ${NYAN} Nyang.` };
      await User.findOneAndUpdate({ userId: user.userId }, { $inc: { "currency.gold": -cost, "items.talismanCommon": qty } });
      return { msg: `📜 You received **${qty}× Common Talisman**!` };
    },
  },
  {
    id: "talisman_uncommon",
    name: "Uncommon Talisman",
    desc: "80% Common · 60% Rare · 60% Special",
    price: 2000, currency: "gold", emoji: "📋", limit: "unlimited",
    maxQty: 99,
    buy: async (user, qty) => {
      const cost = applyDiscount(2000, user.isPremium) * qty;
      if ((user.currency?.gold ?? 0) < cost) return { error: `Not enough ${NYAN} Nyang.` };
      await User.findOneAndUpdate({ userId: user.userId }, { $inc: { "currency.gold": -cost, "items.talismanUncommon": qty } });
      return { msg: `📋 You received **${qty}× Uncommon Talisman**!` };
    },
  },
  {
    id: "talisman_divine",
    name: "Divine Talisman",
    desc: "95% Common · 90% Rare · 80% Special",
    price: 20000, currency: "gold", emoji: "✴️", limit: "unlimited",
    maxQty: 99,
    buy: async (user, qty) => {
      const cost = applyDiscount(20000, user.isPremium) * qty;
      if ((user.currency?.gold ?? 0) < cost) return { error: `Not enough ${NYAN} Nyang.` };
      await User.findOneAndUpdate({ userId: user.userId }, { $inc: { "currency.gold": -cost, "items.talismanDivine": qty } });
      return { msg: `✴️ You received **${qty}× Divine Talisman**!` };
    },
  },
  {
    id: "talisman_exceptional",
    name: "Exceptional Talisman",
    desc: "100% capture on ANY rarity",
    price: 200000, currency: "gold", emoji: "🌟", limit: "unlimited",
    maxQty: 99,
    buy: async (user, qty) => {
      const cost = applyDiscount(200000, user.isPremium) * qty;
      if ((user.currency?.gold ?? 0) < cost) return { error: `Not enough ${NYAN} Nyang. Need ${cost.toLocaleString()}.` };
      await User.findOneAndUpdate({ userId: user.userId }, { $inc: { "currency.gold": -cost, "items.talismanExceptional": qty } });
      return { msg: `🌟 You received **${qty}× Exceptional Talisman**!` };
    },
  },
  {
    id: "faction_pass",
    name: "Faction Pass",
    desc: "Change your faction once this month.",
    price: 15000, currency: "gold", emoji: "🎫", limit: "monthly",
    maxQty: 1,
    buy: async (user, qty) => {
      const cost = applyDiscount(15000, user.isPremium);
      if ((user.currency?.gold ?? 0) < cost) return { error: `Not enough ${NYAN} Nyang.` };
      const now = new Date();
      const last = user.shopLimits?.factionPassLastBought ? new Date(user.shopLimits.factionPassLastBought) : null;
      if (last) {
        const sameMonth = last.getUTCMonth() === now.getUTCMonth() && last.getUTCFullYear() === now.getUTCFullYear();
        if (sameMonth) return { error: "Already bought the Faction Pass this month." };
      }
      await User.findOneAndUpdate({ userId: user.userId }, { $inc: { "currency.gold": -cost }, "shopLimits.factionPassLastBought": now });
      return { msg: "🎫 **Faction Pass** purchased!" };
    },
  },
  {
    id: "lesser_qi_pill",
    name: "Lesser Qi Pill",
    desc: `Restores 1/4 of your ${DANTIAN} Dantian. Max 2/week.`,
    price: 8000, currency: "gold", emoji: DANTIAN, limit: "2/week",
    maxQty: 2,
    buy: async (user, qty) => {
      const cost = applyDiscount(8000, user.isPremium) * qty;
      if ((user.currency?.gold ?? 0) < cost) return { error: `Not enough ${NYAN} Nyang.` };
      const now = new Date();
      let weekCount = user.shopLimits?.lesserQiPillWeekly ?? 0;
      const lastReset = user.shopLimits?.lesserQiPillWeekReset ? new Date(user.shopLimits.lesserQiPillWeekReset) : null;
      if (lastReset && (now - lastReset >= 7 * 24 * 60 * 60 * 1000)) weekCount = 0;
      if (weekCount + qty > 2) return { error: `You can only buy ${2 - weekCount} more this week.` };
      await User.findOneAndUpdate({ userId: user.userId }, {
        $inc: { "currency.gold": -cost, "items.lesserQiPill": qty },
        "shopLimits.lesserQiPillWeekly": weekCount + qty,
        "shopLimits.lesserQiPillWeekReset": lastReset && (now - lastReset < 7 * 24 * 60 * 60 * 1000) ? lastReset : now,
      });
      return { msg: `${DANTIAN} **${qty}× Lesser Qi Pill** added to your bag!` };
    },
  },
];

const JADE_ITEMS = [
  {
    id: "gear_box",
    name: "Gear Box",
    desc: "Random gear for your cards.",
    price: 50, currency: "premiumCurrency", emoji: "📦", limit: "unlimited",
    maxQty: 99,
    buy: async (user, qty) => {
      const cost = applyDiscount(50, user.isPremium) * qty;
      if ((user.currency?.premiumCurrency ?? 0) < cost) return { error: `Not enough ${JADE} Jade.` };
      await User.findOneAndUpdate({ userId: user.userId }, { $inc: { "currency.premiumCurrency": -cost, "items.gearBox": qty } });
      return { msg: `📦 **${qty}× Gear Box** added to your bag!` };
    },
  },
  {
    id: "pet_treat_box",
    name: "Pet Treat Box",
    desc: "Treats to bond with your pets.",
    price: 30, currency: "premiumCurrency", emoji: "🐾", limit: "unlimited",
    maxQty: 99,
    buy: async (user, qty) => {
      const cost = applyDiscount(30, user.isPremium) * qty;
      if ((user.currency?.premiumCurrency ?? 0) < cost) return { error: `Not enough ${JADE} Jade.` };
      await User.findOneAndUpdate({ userId: user.userId }, { $inc: { "currency.premiumCurrency": -cost, "items.petTreatBox": qty } });
      return { msg: `🐾 **${qty}× Pet Treat Box** added to your bag!` };
    },
  },
  {
    id: "premium",
    name: "Premium Membership",
    desc: "30 days of Premium — bonuses, discount & cosmetics.",
    price: 200, currency: "premiumCurrency", emoji: "💎", limit: "unlimited",
    maxQty: 12,
    buy: async (user, qty) => {
      const cost = 200 * qty;
      if ((user.currency?.premiumCurrency ?? 0) < cost) return { error: `Not enough ${JADE} Jade. Need ${cost}.` };
      const now = new Date();
      const base = user.premiumUntil && new Date(user.premiumUntil) > now ? new Date(user.premiumUntil) : now;
      const expiry = new Date(base.getTime() + qty * 30 * 24 * 60 * 60 * 1000);
      await User.findOneAndUpdate({ userId: user.userId }, { $inc: { "currency.premiumCurrency": -cost }, isPremium: true, premiumUntil: expiry });
      return { msg: `💎 **Premium** activated until **${expiry.toISOString().slice(0, 10)}**!` };
    },
  },
  {
    id: "special_card_box",
    name: "Special Card Box",
    desc: "Roll a random Special rarity card.",
    price: 150, currency: "premiumCurrency", emoji: "<:Special:1496599588902273187>", limit: "unlimited",
    maxQty: 10,
    buy: async (user, qty) => {
      const cost = applyDiscount(150, user.isPremium) * qty;
      if ((user.currency?.premiumCurrency ?? 0) < cost) return { error: `Not enough ${JADE} Jade.` };
      const specials = await Card.find({ rarity: "special", isAvailable: true });
      if (!specials.length) return { error: "No special cards available." };
      const names = [];
      for (let i = 0; i < qty; i++) {
        const card = specials[Math.floor(Math.random() * specials.length)];
        const ex = await PlayerCard.findOne({ userId: user.userId, cardId: card.cardId });
        if (ex) await ex.updateOne({ $inc: { quantity: 1 } });
        else await PlayerCard.create({ userId: user.userId, cardId: card.cardId, quantity: 1, level: 1 });
        names.push(card.name);
      }
      await User.findOneAndUpdate({ userId: user.userId }, { $inc: { "currency.premiumCurrency": -cost, "stats.totalCardsEverObtained": qty } });
      return { msg: `<:Special:1496599588902273187> You received: **${names.join(", ")}**!` };
    },
  },
];

// ─── Embed + UI ───────────────────────────────────────────────────────────────
function buildShopEmbed(tab, user) {
  const items   = tab === "nyang" ? NYANG_ITEMS : JADE_ITEMS;
  const isPrem  = user?.isPremium ?? false;
  const balance = tab === "nyang" ? (user?.currency?.gold ?? 0) : (user?.currency?.premiumCurrency ?? 0);
  const balStr  = tab === "nyang" ? `${NYAN} **${balance.toLocaleString()}** Nyang` : `${JADE} **${balance.toLocaleString()}** Jade`;

  const lines = items.map((item, i) => {
    const final = applyDiscount(item.price, isPrem);
    const cur   = tab === "nyang" ? NYAN : JADE;
    const price = isPrem && final < item.price
      ? `${cur} **${final.toLocaleString()}** ~~${item.price.toLocaleString()}~~`
      : `${cur} **${final.toLocaleString()}**`;
    const lim   = item.limit !== "unlimited" ? ` · *${item.limit}*` : "";
    return `**${i + 1}.** ${item.emoji} **${item.name}**${lim} — ${price} each`;
  });

  return new EmbedBuilder()
    .setTitle(tab === "nyang" ? `${NYAN} Nyang Shop` : `${JADE} Jade Shop`)
    .setDescription([
      balStr,
      isPrem ? `💎 **Premium** — 7.5% discount applied!` : `💎 Get **Premium** for a 7.5% discount`,
      `\`${"─".repeat(30)}\``,
      ...lines,
      `\`${"─".repeat(30)}\``,
      `Select an item below — a window will ask for quantity.`,
    ].join("\n"))
    .setColor(tab === "nyang" ? 0xf59e0b : 0x7c3aed)
    .setFooter({ text: isPrem ? "💎 Premium discount active — 7.5% off all items" : "Get Premium in the Jade shop for 7.5% off" });
}

function buildTabRow(tab) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("shop_nyang").setLabel("🪙 Nyang Shop").setStyle(tab === "nyang" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("shop_jade").setLabel("💎 Jade Shop").setStyle(tab === "jade" ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );
}

function buildDropdown(tab) {
  const items = tab === "nyang" ? NYANG_ITEMS : JADE_ITEMS;
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`shop_select_${tab}`)
      .setPlaceholder("Select an item to buy...")
      .addOptions(items.map(item =>
        new StringSelectMenuOptionBuilder()
          .setLabel(item.name)
          .setDescription(item.desc.slice(0, 100))
          .setValue(item.id)
      ))
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
      components: [buildTabRow(tab), buildDropdown(tab)],
    });

    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 5 * 60 * 1000,
    });

    collector.on("collect", async i => {
      // Tab switch (buttons)
      if (i.customId === "shop_nyang" || i.customId === "shop_jade") {
        await i.deferUpdate();
        tab  = i.customId === "shop_nyang" ? "nyang" : "jade";
        user = await User.findOne({ userId: interaction.user.id });
        return interaction.editReply({
          embeds: [buildShopEmbed(tab, user)],
          components: [buildTabRow(tab), buildDropdown(tab)],
        });
      }

      // Item selected — show quantity modal
      if (i.customId === `shop_select_nyang` || i.customId === `shop_select_jade`) {
        const itemTab = i.customId === "shop_select_nyang" ? "nyang" : "jade";
        const itemId  = i.values[0];
        const items   = itemTab === "nyang" ? NYANG_ITEMS : JADE_ITEMS;
        const item    = items.find(x => x.id === itemId);
        if (!item) { await i.deferUpdate(); return; }

        // One-time items: skip modal, buy directly
        if (item.maxQty === 1) {
          await i.deferUpdate();
          user = await User.findOne({ userId: interaction.user.id });
          const result = await item.buy(user, 1);
          user = await User.findOne({ userId: interaction.user.id });
          const embed = buildShopEmbed(tab, user);
          if (result.error) embed.setFooter({ text: `❌ ${result.error}` });
          else embed.setFooter({ text: `✅ ${result.msg.replace(/\*\*/g, "")}` });
          return interaction.editReply({ embeds: [embed], components: [buildTabRow(tab), buildDropdown(tab)] });
        }

        // Show quantity modal
        const finalPrice = applyDiscount(item.price, user.isPremium);
        const modal = new ModalBuilder()
          .setCustomId(`shop_qty_${itemId}`)
          .setTitle(`Buy ${item.name}`);
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("qty")
            .setLabel(`Quantity (1–${item.maxQty}) · ${finalPrice.toLocaleString()} ${itemTab === "nyang" ? "Nyang" : "Jade"} each`)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("1")
            .setMinLength(1)
            .setMaxLength(3)
            .setRequired(true)
        ));
        await i.showModal(modal);

        // Wait for modal submit
        try {
          const mi = await i.awaitModalSubmit({
            filter: m => m.customId === `shop_qty_${itemId}` && m.user.id === interaction.user.id,
            time: 60_000,
          });
          await mi.deferUpdate();

          const raw = mi.fields.getTextInputValue("qty").trim();
          const qty = parseInt(raw);
          if (!qty || qty < 1 || qty > item.maxQty) {
            user = await User.findOne({ userId: interaction.user.id });
            const embed = buildShopEmbed(tab, user);
            embed.setFooter({ text: `❌ Invalid quantity. Enter a number between 1 and ${item.maxQty}.` });
            return interaction.editReply({ embeds: [embed], components: [buildTabRow(tab), buildDropdown(tab)] });
          }

          user = await User.findOne({ userId: interaction.user.id });
          const result = await item.buy(user, qty);
          user = await User.findOne({ userId: interaction.user.id });
          const embed = buildShopEmbed(tab, user);
          if (result.error) embed.setFooter({ text: `❌ ${result.error}` });
          else embed.setFooter({ text: `✅ ${result.msg.replace(/\*\*/g, "")}` });
          return interaction.editReply({ embeds: [embed], components: [buildTabRow(tab), buildDropdown(tab)] });

        } catch {
          // Modal timed out — do nothing
        }
      }
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
