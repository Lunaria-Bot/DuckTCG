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
const JADE   = "<:Jade:1495038405866688703>";
const QI     = "<:Qi:1495523502961459200>";
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
      await User.findOneAndUpdate({ userId: user.userId }, {
        rollLimit: 7,
        "shopLimits.rollUpgradeBought": true,
        $inc: { "currency.gold": -50000 },
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
      if ((user.currency?.gold ?? 0) < 30000) return { error: `Not enough ${NYAN} Nyang.` };
      await User.findOneAndUpdate({ userId: user.userId }, {
        $inc: { "currency.gold": -30000, "currency.regularTickets": 10 },
      });
      return { msg: `${PERMA} You received **10 Regular Tickets**!` };
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
      if ((user.currency?.gold ?? 0) < 15000) return { error: `Not enough ${NYAN} Nyang.` };
      const now = new Date();
      const last = user.shopLimits?.factionPassLastBought ? new Date(user.shopLimits.factionPassLastBought) : null;
      if (last) {
        const sameMonth = last.getUTCMonth() === now.getUTCMonth() && last.getUTCFullYear() === now.getUTCFullYear();
        if (sameMonth) return { error: "You already bought the Faction Pass this month." };
      }
      await User.findOneAndUpdate({ userId: user.userId }, {
        $inc: { "currency.gold": -15000 },
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
      if ((user.currency?.gold ?? 0) < 8000) return { error: `Not enough ${NYAN} Nyang.` };
      const now = new Date();
      // Check weekly reset
      let weekCount = user.shopLimits?.lesserQiPillWeekly ?? 0;
      const lastReset = user.shopLimits?.lesserQiPillWeekReset ? new Date(user.shopLimits.lesserQiPillWeekReset) : null;
      if (lastReset) {
        const msInWeek = 7 * 24 * 60 * 60 * 1000;
        if (now - lastReset >= msInWeek) weekCount = 0; // reset
      }
      if (weekCount >= 2) return { error: "You've already bought 2 Lesser Qi Pills this week. Resets Monday." };
      await User.findOneAndUpdate({ userId: user.userId }, {
        $inc: { "currency.gold": -8000, "items.lesserQiPill": 1 },
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
      if ((user.currency?.premiumCurrency ?? 0) < 50) return { error: `Not enough ${JADE} Jade.` };
      await User.findOneAndUpdate({ userId: user.userId }, {
        $inc: { "currency.premiumCurrency": -50, "items.gearBox": 1 },
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
      if ((user.currency?.premiumCurrency ?? 0) < 30) return { error: `Not enough ${JADE} Jade.` };
      await User.findOneAndUpdate({ userId: user.userId }, {
        $inc: { "currency.premiumCurrency": -30, "items.petTreatBox": 1 },
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
      if ((user.currency?.premiumCurrency ?? 0) < 200) return { error: `Not enough ${JADE} Jade.` };
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
    emoji: "🟪",
    limit: "unlimited",
    buy: async (user) => {
      if ((user.currency?.premiumCurrency ?? 0) < 150) return { error: `Not enough ${JADE} Jade.` };
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
        $inc: { "currency.premiumCurrency": -150, "stats.totalCardsEverObtained": 1 },
      });
      return { msg: `🟪 You received **${card.name}** *(${card.anime})* — Special card!`, thumbnail: card.imageUrl };
    },
  },
];

// ─── Embed builders ───────────────────────────────────────────────────────────
function buildShopEmbed(tab, user) {
  const items = tab === "nyang" ? NYANG_ITEMS : JADE_ITEMS;
  const currency = tab === "nyang"
    ? `${NYAN} **${(user.currency?.gold ?? 0).toLocaleString()}** Nyang`
    : `${JADE} **${(user.currency?.premiumCurrency ?? 0).toLocaleString()}** Jade`;

  const lines = items.map((item, i) => {
    const price = tab === "nyang"
      ? `${NYAN} ${item.price.toLocaleString()}`
      : `${JADE} ${item.price}`;
    const limitTag = item.limit !== "unlimited" ? ` *(${item.limit})*` : "";
    return `**${i + 1}. ${item.emoji} ${item.name}**${limitTag}\n${item.desc}\n> ${price}`;
  });

  return new EmbedBuilder()
    .setTitle(tab === "nyang" ? `${NYAN} Nyang Shop` : `${JADE} Jade Shop`)
    .setDescription(lines.join("\n\n"))
    .setColor(tab === "nyang" ? 0xf59e0b : 0x7c3aed)
    .setFooter({ text: `Your balance: ${tab === "nyang" ? `${(user.currency?.gold ?? 0).toLocaleString()} Nyang` : `${user.currency?.premiumCurrency ?? 0} Jade`}` });
}

function buildTabRow(tab) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("shop_nyang").setLabel("Nyang Shop").setEmoji(NYAN).setStyle(tab === "nyang" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("shop_jade").setLabel("Jade Shop").setEmoji(JADE).setStyle(tab === "jade" ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );
}

function buildBuyDropdown(tab) {
  const items = tab === "nyang" ? NYANG_ITEMS : JADE_ITEMS;
  const currency = tab === "nyang" ? "Nyang" : "Jade";
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`shop_buy_${tab}`)
      .setPlaceholder(`Select an item to buy...`)
      .addOptions(items.map(item => {
        const priceStr = tab === "nyang" ? `${item.price.toLocaleString()} Nyang` : `${item.price} Jade`;
        const opt = new StringSelectMenuOptionBuilder()
          .setLabel(item.name)
          .setDescription(`${priceStr} · ${item.limit}`)
          .setValue(item.id);
        // Only set emoji for standard Unicode, not custom Discord emojis
        if (item.emoji && !item.emoji.startsWith("<")) opt.setEmoji(item.emoji);
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
      components: [buildTabRow(tab), buildBuyDropdown(tab)],
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === interaction.user.id && (i.isButton() || i.isStringSelectMenu()),
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
          components: [buildTabRow(tab), buildBuyDropdown(tab)],
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
          components: [buildTabRow(tab), buildBuyDropdown(tab)],
        });
      }
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
