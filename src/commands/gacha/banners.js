const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ComponentType,
} = require("discord.js");
const Banner     = require("../../models/Banner");
const Card       = require("../../models/Card");
const PlayerCard = require("../../models/PlayerCard");
const User       = require("../../models/User");
const { doPulls }          = require("../../services/gacha");
const { processBadges }    = require("../../services/badges");
const { incrementProgress } = require("../../services/quests");
const { getRedis }         = require("../../services/redis");
const { requireProfile }   = require("../../utils/requireProfile");

// ─── Constants ────────────────────────────────────────────────────────────────
const NYAN    = "<:Nyan:1495048966528831508>";
const JADE    = "<:Jade:1495038405866688703>";
const PERMA   = "<:perma_ticket:1494344593863344258>";
const PICKUP  = "<:pickup_ticket:1494344547046523091>";

const RARITY_COLOR = {
  common:      0x9E9E9E,
  rare:        0x42A5F5,
  special:     0xAB47BC,
  exceptional: 0xFFD700,
};
const RARITY_LABEL = {
  common:      "<:Common:1495730171301462186> Common",
  rare:        "<:Rare:1496150241462849536> Rare ✦",
  special:     "<:SP:1495730276737745077> Special ✦✦",
  exceptional: "<:EX:1495730346241822861> Exceptional ✦✦✦",
};
const RARITY_STAR = {
  common: "★", rare: "★★", special: "★★★", exceptional: "★★★★★",
};

// Jade cost per pull
const JADE_SINGLE = 160;
const JADE_MULTI  = 1600;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getActiveBanners() {
  const now = new Date();
  return Banner.find({
    isActive: true,
    startsAt: { $lte: now },
    $or: [{ endsAt: null }, { endsAt: { $gte: now } }],
  }).sort({ type: -1 });
}

function formatDate(date) {
  if (!date) return "Permanent";
  return date.toLocaleDateString("en-GB");
}

function isValidUrl(str) {
  try { return Boolean(new URL(str)); } catch { return false; }
}

function daysLeft(endsAt) {
  if (!endsAt) return null;
  const diff = new Date(endsAt) - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// ─── Main banner embed — Genshin-style ────────────────────────────────────────
function buildBannerEmbed(banner, user) {
  const isPickup = banner.type === "pickup";
  const color    = isPickup ? 0x9c59b6 : 0x2980b9;
  const typeTag  = isPickup ? "✦ Limited · Pick Up" : "✧ Standard · Regular";
  const days     = daysLeft(banner.endsAt);
  const daysStr  = days !== null ? `${days} day${days !== 1 ? "s" : ""} remaining` : "Permanent";
  const ticket   = isPickup ? PICKUP : PERMA;
  const ticketCount = isPickup
    ? (user?.currency?.pickupTickets ?? 0)
    : (user?.currency?.regularTickets ?? 0);
  const jadeCount = user?.currency?.premiumCurrency ?? 0;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: typeTag })
    .setTitle(banner.name)
    .setDescription([
      `${ticket} **${ticketCount}** tickets  ·  ${JADE} **${jadeCount}** Jade`,
      ``,
      `⏳ ${formatDate(banner.startsAt)} — ${formatDate(banner.endsAt)}  *(${daysStr})*`,
    ].join("\n"))
    .addFields(
      {
        name: "Drop Rates",
        value: [
          `<:EX:1495730346241822861> Exceptional ✦✦✦  **${banner.rates.exceptional}%**`,
          `<:SP:1495730276737745077> Special ✦✦  **${banner.rates.special}%**`,
          `<:Rare:1496150241462849536> Rare ✦  **${banner.rates.rare}%**`,
          `<:Common:1495730171301462186> Common  **${banner.rates.common}%**`,
        ].join("\n"),
        inline: true,
      },
      {
        name: "Cost per Pull",
        value: [
          `${ticket} **1** ticket / pull`,
          `${JADE} **${JADE_SINGLE}** Jade / pull`,
          ``,
          `x10: ${ticket} **10**  or  ${JADE} **${JADE_MULTI}**`,
        ].join("\n"),
        inline: true,
      },
    );

  if (banner.imageUrl && isValidUrl(banner.imageUrl)) embed.setImage(banner.imageUrl);
  return embed;
}

// ─── Info embed ───────────────────────────────────────────────────────────────
function buildInfoEmbed(banner) {
  const featured = banner.featuredCards?.length
    ? banner.featuredCards.map((id, i) => `${i + 1}. \`${id}\``).join("\n")
    : "*No featured cards*";

  return new EmbedBuilder()
    .setTitle(`${banner.name} — Details`)
    .setColor(banner.type === "pickup" ? 0x9c59b6 : 0x2980b9)
    .addFields(
      { name: "Featured Cards", value: featured, inline: false },
      {
        name: "Drop Rates",
        value: [
          `<:EX:1495730346241822861> **Exceptional** ✦✦✦ — **${banner.rates.exceptional}%**`,
          `<:SP:1495730276737745077> **Special** ✦✦ — **${banner.rates.special}%**`,
          `<:Rare:1496150241462849536> **Rare** ✦ — **${banner.rates.rare}%**`,
          `<:Common:1495730171301462186> **Common** — **${banner.rates.common}%**`,
        ].join("\n"),
        inline: true,
      },
      {
        name: "Pity System",
        value: [
          `Soft pity: **${banner.pity?.softPityStart ?? 75}** pulls`,
          `Hard pity: **${banner.pity?.hardPity ?? 90}** pulls`,
          `50/50 on featured Exceptional`,
        ].join("\n"),
        inline: true,
      },
      { name: "Duration", value: `${formatDate(banner.startsAt)} — ${formatDate(banner.endsAt)}`, inline: false },
    );
}

// ─── Rates embed ─────────────────────────────────────────────────────────────
function buildRatesEmbed(banner) {
  return new EmbedBuilder()
    .setTitle("Drop Rates")
    .setColor(0x5865f2)
    .setDescription("Rates apply equally to ×1 and ×10 pulls.")
    .addFields(
      { name: "<:EX:1495730346241822861> Exceptional ✦✦✦", value: `**${banner.rates.exceptional}%**\nSoft pity starts at **${banner.pity?.softPityStart ?? 75}**, guaranteed at **${banner.pity?.hardPity ?? 90}**`, inline: true },
      { name: "<:SP:1495730276737745077> Special ✦✦",      value: `**${banner.rates.special}%**`, inline: true },
      { name: "<:Rare:1496150241462849536> Rare ✦",          value: `**${banner.rates.rare}%**`, inline: true },
      { name: "<:Common:1495730171301462186> Common",           value: `**${banner.rates.common}%**`, inline: true },
      { name: "Jade Cost",           value: `×1: **${JADE_SINGLE}** ${JADE}\n×10: **${JADE_MULTI}** ${JADE}`, inline: true },
    );
}

// ─── View cards embed ─────────────────────────────────────────────────────────
async function buildViewCardsEmbed(banner, page, userId) {
  const allIds = [
    ...banner.pool.exceptional,
    ...banner.pool.special,
    ...banner.pool.rare,
    ...banner.pool.common,
  ];
  if (!allIds.length) {
    return { embed: new EmbedBuilder().setTitle("No cards in this banner.").setColor(0x9E9E9E), total: 0 };
  }
  const cardId = allIds[page];
  const card   = await Card.findOne({ cardId });
  const owned  = userId ? await PlayerCard.countDocuments({ userId, cardId, isBurned: false }) : 0;

  const embed = new EmbedBuilder()
    .setTitle(card?.name ?? cardId)
    .setDescription(`*${card?.anime ?? ""}*`)
    .setColor(RARITY_COLOR[card?.rarity] ?? 0x9E9E9E)
    .addFields(
      { name: "Rarity", value: RARITY_LABEL[card?.rarity] ?? card?.rarity ?? "—", inline: true },
      { name: "You Own", value: `**${owned}** cop${owned !== 1 ? "ies" : "y"}`, inline: true },
    )
    .setFooter({ text: `Card ${page + 1} / ${allIds.length}  ·  ${banner.name}` });
  if (card?.imageUrl && isValidUrl(card.imageUrl)) embed.setImage(card.imageUrl);
  return { embed, total: allIds.length };
}

// ─── Pull result embed ────────────────────────────────────────────────────────
function buildPullEmbed(results, banner, user, payMethod) {
  const ticketKey = banner.type === "pickup" ? "pickupTickets" : "regularTickets";
  const remaining = payMethod === "jade"
    ? `${JADE} ${user.currency.premiumCurrency} Jade left`
    : `${banner.type === "pickup" ? PICKUP : PERMA} ${user.currency[ticketKey]} tickets left`;

  if (results.length === 1) {
    const { card, rarity } = results[0];
    return new EmbedBuilder()
      .setTitle(`${RARITY_STAR[rarity]} ${RARITY_LABEL[rarity]}`)
      .setDescription(`**${card.name}**\n*${card.anime}*`)
      .setColor(RARITY_COLOR[rarity])
      .setThumbnail(card.imageUrl && isValidUrl(card.imageUrl) ? card.imageUrl : null)
      .setFooter({ text: remaining });
  }

  const rarityOrder = ["exceptional", "special", "rare", "common"];
  const best = rarityOrder.find(r => results.some(res => res.rarity === r));
  const bestCard = results.find(r => r.rarity === best);

  const lines = results.map(({ card, rarity }) =>
    `${RARITY_LABEL[rarity]} — **${card.name}**`
  );

  const embed = new EmbedBuilder()
    .setTitle(`✦ ×10 Pull — ${banner.name}`)
    .setDescription(lines.join("\n"))
    .setColor(RARITY_COLOR[best] ?? 0x9E9E9E)
    .setFooter({ text: remaining });

  if (bestCard?.card?.imageUrl && isValidUrl(bestCard.card.imageUrl)) {
    embed.setThumbnail(bestCard.card.imageUrl);
  }
  return embed;
}

// ─── Rows ─────────────────────────────────────────────────────────────────────
function mainRow(bannerId, bannerType) {
  const ticket = bannerType === "pickup" ? EMOJI_PICKUP : EMOJI_REGULAR;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pull_single_${bannerId}`).setLabel("×1 Ticket").setEmoji(bannerType === "pickup" ? EMOJI_PICKUP : EMOJI_REGULAR).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`pull_multi_${bannerId}`).setLabel("×10 Ticket").setEmoji(bannerType === "pickup" ? EMOJI_PICKUP : EMOJI_REGULAR).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`pull_jade_single_${bannerId}`).setLabel(`×1 Jade`).setEmoji({ id: "1495038405866688703", name: "Jade" }).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`pull_jade_multi_${bannerId}`).setLabel(`×10 Jade`).setEmoji({ id: "1495038405866688703", name: "Jade" }).setStyle(ButtonStyle.Secondary),
  );
}

function subRow(bannerId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`banner_info_${bannerId}`).setLabel("Details").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`banner_rates_${bannerId}`).setLabel("Rates").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("banner_list").setLabel("All Banners").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`banner_cards_${bannerId}_0`).setLabel("Cards").setStyle(ButtonStyle.Danger),
  );
}

function backRow(bannerId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`banner_view_${bannerId}`).setLabel("← Back").setStyle(ButtonStyle.Secondary),
  );
}

function cardsNavRow(bannerId, page, total) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`banner_view_${bannerId}`).setLabel("← Back").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`banner_cards_${bannerId}_${page - 1}`).setEmoji("◀").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(`banner_page_${page}`).setLabel(`${page + 1} / ${total}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId(`banner_cards_${bannerId}_${page + 1}`).setEmoji("▶").setStyle(ButtonStyle.Secondary).setDisabled(page >= total - 1),
  );
}

const EMOJI_REGULAR = { id: "1494344593863344258", name: "perma_ticket" };
const EMOJI_PICKUP  = { id: "1494344547046523091", name: "pickup_ticket" };

// ─── Interaction handler ──────────────────────────────────────────────────────
async function handleBannerInteraction(interaction, banners, user) {
  const id = interaction.customId;

  // Banner list dropdown
  if (id === "banner_list") {
    if (!banners.length) return interaction.update({ content: "No active banners.", embeds: [], components: [] });
    const select = new StringSelectMenuBuilder()
      .setCustomId("banner_select")
      .setPlaceholder("Select a banner...")
      .addOptions(banners.map(b =>
        new StringSelectMenuOptionBuilder()
          .setLabel(b.name)
          .setDescription(`${b.type === "pickup" ? "Limited · Pick Up" : "Standard · Regular"}`)
          .setValue(b.bannerId)
      ));
    return interaction.update({ embeds: [buildBannerEmbed(banners[0], user)], components: [new ActionRowBuilder().addComponents(select)] });
  }

  if (id === "banner_select") {
    const banner = banners.find(b => b.bannerId === interaction.values[0]);
    if (!banner) return interaction.update({ content: "Banner not found.", embeds: [], components: [] });
    return interaction.update({ embeds: [buildBannerEmbed(banner, user)], components: [mainRow(banner.bannerId, banner.type), subRow(banner.bannerId)] });
  }

  if (id.startsWith("banner_view_")) {
    const banner = banners.find(b => b.bannerId === id.replace("banner_view_", ""));
    if (!banner) return interaction.update({ content: "Banner not found.", embeds: [], components: [] });
    const freshUser = await User.findOne({ userId: interaction.user.id });
    return interaction.update({ embeds: [buildBannerEmbed(banner, freshUser)], components: [mainRow(banner.bannerId, banner.type), subRow(banner.bannerId)] });
  }

  if (id.startsWith("banner_info_")) {
    const banner = banners.find(b => b.bannerId === id.replace("banner_info_", ""));
    if (!banner) return interaction.update({ content: "Banner not found.", embeds: [], components: [] });
    return interaction.update({ embeds: [buildInfoEmbed(banner)], components: [backRow(banner.bannerId)] });
  }

  if (id.startsWith("banner_rates_")) {
    const banner = banners.find(b => b.bannerId === id.replace("banner_rates_", ""));
    if (!banner) return interaction.update({ content: "Banner not found.", embeds: [], components: [] });
    return interaction.update({ embeds: [buildRatesEmbed(banner)], components: [backRow(banner.bannerId)] });
  }

  if (id.startsWith("banner_cards_")) {
    const parts    = id.split("_");
    const page     = parseInt(parts[parts.length - 1]);
    const bannerId = parts.slice(2, parts.length - 1).join("_");
    const banner   = banners.find(b => b.bannerId === bannerId);
    if (!banner) return interaction.update({ content: "Banner not found.", embeds: [], components: [] });
    const { embed, total } = await buildViewCardsEmbed(banner, page, interaction.user.id);
    return interaction.update({ embeds: [embed], components: [cardsNavRow(bannerId, page, total)] });
  }

  // ── Pulls ─────────────────────────────────────────────────────────────────
  async function doPull(bannerId, count, payMethod) {
    const banner = banners.find(b => b.bannerId === bannerId);
    if (!banner) return interaction.update({ content: "Banner not found.", embeds: [], components: [] });

    const freshUser = await User.findOne({ userId: interaction.user.id });
    if (!freshUser) return interaction.update({ content: "Profile not found. Use `/register` first.", embeds: [], components: [] });

    if (payMethod === "jade") {
      const cost = count === 1 ? JADE_SINGLE : JADE_MULTI;
      if ((freshUser.currency.premiumCurrency ?? 0) < cost) {
        return interaction.update({
          content: `${JADE} Not enough Jade! You need **${cost}**, you have **${freshUser.currency.premiumCurrency ?? 0}**.`,
          embeds: [], components: [],
        });
      }
      freshUser.currency.premiumCurrency -= cost;
    } else {
      const ticketKey = banner.type === "pickup" ? "pickupTickets" : "regularTickets";
      if ((freshUser.currency[ticketKey] ?? 0) < count) {
        return interaction.update({
          content: `Not enough tickets! You need **${count}**, you have **${freshUser.currency[ticketKey]}**.`,
          embeds: [], components: [],
        });
      }
      freshUser.currency[ticketKey] -= count;
    }

    await freshUser.save();
    const results = await doPulls(interaction.user.id, banner, count);
    await processBadges(freshUser, interaction, "realtime");

    const redis = getRedis();
    await incrementProgress(redis, interaction.user.id, "daily", "roll", count);
    await incrementProgress(redis, interaction.user.id, "weekly", "roll", count);
    if (count >= 10) {
      await incrementProgress(redis, interaction.user.id, "daily", "multi_roll", 1);
      await incrementProgress(redis, interaction.user.id, "weekly", "multi_roll", 1);
    }
    for (const { rarity } of results) {
      if (["rare","special","exceptional"].includes(rarity)) {
        await incrementProgress(redis, interaction.user.id, "daily", "roll_rare", 1);
        await incrementProgress(redis, interaction.user.id, "weekly", "roll_rare", 1);
      }
      if (["special","exceptional"].includes(rarity)) {
        await incrementProgress(redis, interaction.user.id, "daily", "roll_special", 1);
        await incrementProgress(redis, interaction.user.id, "weekly", "roll_special", 1);
      }
    }

    const updatedUser = await User.findOne({ userId: interaction.user.id });
    return interaction.update({
      embeds: [buildPullEmbed(results, banner, updatedUser, payMethod)],
      components: [mainRow(banner.bannerId, banner.type), subRow(banner.bannerId)],
    });
  }

  if (id.startsWith("pull_single_"))      return doPull(id.replace("pull_single_", ""), 1, "ticket");
  if (id.startsWith("pull_multi_"))       return doPull(id.replace("pull_multi_", ""), 10, "ticket");
  if (id.startsWith("pull_jade_single_")) return doPull(id.replace("pull_jade_single_", ""), 1, "jade");
  if (id.startsWith("pull_jade_multi_"))  return doPull(id.replace("pull_jade_multi_", ""), 10, "jade");
}

// ─── Command ─────────────────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName("banners")
    .setDescription("View and pull from active gacha banners"),

  async execute(interaction) {
    await interaction.deferReply();

    const user = await requireProfile(interaction);
    if (!user) return;

    const banners = await getActiveBanners();
    if (!banners.length) return interaction.editReply({ content: "No active banners at the moment. Check back soon!" });

    const first = banners[0];
    const msg = await interaction.editReply({
      embeds: [buildBannerEmbed(first, user)],
      components: [mainRow(first.bannerId, first.type), subRow(first.bannerId)],
    });

    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 10 * 60 * 1000,
    });

    collector.on("collect", async i => {
      try {
        const freshBanners = await getActiveBanners();
        const freshUser    = await User.findOne({ userId: interaction.user.id });
        await handleBannerInteraction(i, freshBanners, freshUser);
      } catch (err) {
        console.error("Banner interaction error:", err);
        await i.update({ content: "An error occurred.", embeds: [], components: [] }).catch(() => {});
      }
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
