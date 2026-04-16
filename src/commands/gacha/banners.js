const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require("discord.js");
const Banner = require("../../models/Banner");
const Card = require("../../models/Card");
const PlayerCard = require("../../models/PlayerCard");
const User = require("../../models/User");
const { doPulls } = require("../../services/gacha");
const { processBadges } = require("../../services/badges");
const { incrementProgress } = require("../../services/quests");
const { getRedis } = require("../../services/redis");
const { requireProfile } = require("../../utils/requireProfile");

const RARITY_COLOR = {
  common:      0x9E9E9E,
  rare:        0x42A5F5,
  special:     0xAB47BC,
  exceptional: 0xFFD700,
};

const RARITY_LABEL = {
  common:      "Common",
  rare:        "Rare ✦",
  special:     "Special ✦✦",
  exceptional: "Exceptional ✦✦✦",
};

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
  return date.toLocaleDateString("en-GB").replace(/\//g, "/");
}

function isValidUrl(str) {
  try { return Boolean(new URL(str)); } catch { return false; }
}

function buildBannerEmbed(banner) {
  const start = formatDate(banner.startsAt);
  const end   = formatDate(banner.endsAt);
  const embed = new EmbedBuilder()
    .setTitle(banner.name)
    .setColor(banner.type === "pickup" ? 0xAB47BC : 0x42A5F5)
    .addFields({ name: "\u200b", value: `From ${start} - ${end}` });
  if (banner.imageUrl && isValidUrl(banner.imageUrl)) embed.setImage(banner.imageUrl);
  return embed;
}

function buildInfoEmbed(banner) {
  const featuredList = banner.featuredCards.length
    ? banner.featuredCards.map((id, i) => `${i + 1}. <:pickup_ticket:1494294616495620128> ${id}`).join("\n")
    : "*No featured cards*";
  const start = formatDate(banner.startsAt);
  const end   = formatDate(banner.endsAt);
  const embed = new EmbedBuilder()
    .setTitle("Gacha Information")
    .setColor(0x5865F2)
    .addFields(
      { name: `Banner name: ${banner.name}`, value: "\u200b" },
      { name: "Featured Cards in this Banner:", value: featuredList },
      {
        name: "Drop rates for 10x summon",
        value: [`⬜ Common: ${banner.rates.common}%`, `🟦 Rare: ${banner.rates.rare}%`, `🟪 Special: ${banner.rates.special}%`, `🌟 Exceptional: ${banner.rates.exceptional}%`].join("\n"),
        inline: true,
      },
      {
        name: "Drop rates for 1x summon",
        value: [`⬜ Common: ${banner.rates.common}%`, `🟦 Rare: ${banner.rates.rare}%`, `🟪 Special: ${banner.rates.special}%`, `🌟 Exceptional: ${banner.rates.exceptional}%`].join("\n"),
        inline: true,
      },
      { name: "Gacha duration", value: `From ${start} - ${end}` },
    );
  if (banner.imageUrl && isValidUrl(banner.imageUrl)) embed.setImage(banner.imageUrl);
  return embed;
}

async function buildViewCardsEmbed(banner, page, userId) {
  const allCardIds = [...banner.pool.exceptional, ...banner.pool.special, ...banner.pool.rare, ...banner.pool.common];
  if (!allCardIds.length) {
    return { embed: new EmbedBuilder().setTitle("No cards in this banner yet.").setColor(0x9E9E9E), total: 0 };
  }
  const cardId = allCardIds[page];
  const card = await Card.findOne({ cardId });
  const owned = userId ? await PlayerCard.countDocuments({ userId, cardId, isBurned: false }) : 0;
  const RARITY_EMOJI = { common: "⬜", rare: "🟦", special: "🟪", exceptional: "🌟" };
  const embed = new EmbedBuilder()
    .setTitle(card?.name ?? cardId)
    .setColor(RARITY_COLOR[card?.rarity] ?? 0x9E9E9E)
    .addFields({ name: banner.name, value: `ID: ${cardId}\nPrint total: ${card?.totalPrints ?? 0}` })
    .setFooter({ text: `${RARITY_EMOJI[card?.rarity] ?? ""} page ${page + 1} of ${allCardIds.length} | You Own: ${owned}` });
  if (card?.imageUrl && isValidUrl(card.imageUrl)) embed.setImage(card.imageUrl);
  return { embed, total: allCardIds.length };
}

const EMOJI_REGULAR = { id: "1494292877491310666", name: "perma_ticket" };
const EMOJI_PICKUP  = { id: "1494294616495620128", name: "pickup_ticket" };

function bannerMainRow(bannerId, bannerType = "regular") {
  const ticketEmoji = bannerType === "pickup" ? EMOJI_PICKUP : EMOJI_REGULAR;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pull_single_${bannerId}`).setLabel("Single").setStyle(ButtonStyle.Primary).setEmoji(ticketEmoji),
    new ButtonBuilder().setCustomId(`pull_multi_${bannerId}`).setLabel("x10").setStyle(ButtonStyle.Primary).setEmoji(ticketEmoji),
    new ButtonBuilder().setCustomId(`banner_info_${bannerId}`).setLabel("Info").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("banner_list").setLabel("Banners").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`banner_cards_${bannerId}_0`).setLabel("View Cards").setStyle(ButtonStyle.Danger),
  );
}

function backRow(bannerId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`banner_view_${bannerId}`).setLabel("Back").setStyle(ButtonStyle.Primary),
  );
}

function cardsNavRow(bannerId, page, total) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`banner_view_${bannerId}`).setLabel("Back").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`banner_cards_${bannerId}_${page - 1}`).setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(`banner_cards_${bannerId}_${page + 1}`).setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(page >= total - 1),
  );
}

function buildPullResultEmbed(results, banner, remaining) {
  if (results.length === 1) {
    const { card, playerCard, rarity } = results[0];
    const embed = new EmbedBuilder()
      .setTitle(RARITY_LABEL[rarity])
      .setDescription(`**${card.name}** — *${card.anime}*\nPrint **#${playerCard.printNumber}**`)
      .setColor(RARITY_COLOR[rarity])
      .setFooter({ text: `Remaining tickets: ${remaining}` });
    if (card.imageUrl && isValidUrl(card.imageUrl)) embed.setThumbnail(card.imageUrl);
    return embed;
  }
  const rarityOrder = ["exceptional", "special", "rare", "common"];
  const best = rarityOrder.find(r => results.some(res => res.rarity === r));
  const lines = results.map(({ card, playerCard, rarity }) =>
    `${RARITY_LABEL[rarity]} — **${card.name}** (Print #${playerCard.printNumber})`
  );
  return new EmbedBuilder()
    .setTitle(`Multi ×10 — ${banner.name}`)
    .setDescription(lines.join("\n"))
    .setColor(RARITY_COLOR[best] ?? 0x9E9E9E)
    .setFooter({ text: `Remaining tickets: ${remaining}` });
}

async function handleBannerInteraction(interaction, banners) {
  const id = interaction.customId;

  if (id === "banner_list") {
    if (!banners.length) return interaction.update({ content: "No active banners.", embeds: [], components: [] });
    const select = new StringSelectMenuBuilder()
      .setCustomId("banner_select")
      .setPlaceholder("select banner")
      .addOptions(banners.map(b =>
        new StringSelectMenuOptionBuilder()
          .setLabel(b.name)
          .setDescription(b.description ?? `${b.type === "pickup" ? "Pick Up" : "Regular"} banner`)
          .setValue(b.bannerId)
      ));
    return interaction.update({ embeds: [buildBannerEmbed(banners[0])], components: [new ActionRowBuilder().addComponents(select)] });
  }

  if (id === "banner_select") {
    const bannerId = interaction.values[0];
    const banner = banners.find(b => b.bannerId === bannerId);
    if (!banner) return interaction.update({ content: "Banner not found.", embeds: [], components: [] });
    return interaction.update({ embeds: [buildBannerEmbed(banner)], components: [bannerMainRow(bannerId, banner.type)] });
  }

  if (id.startsWith("banner_view_")) {
    const bannerId = id.replace("banner_view_", "");
    const banner = banners.find(b => b.bannerId === bannerId);
    if (!banner) return interaction.update({ content: "Banner not found.", embeds: [], components: [] });
    return interaction.update({ embeds: [buildBannerEmbed(banner)], components: [bannerMainRow(bannerId, banner.type)] });
  }

  if (id.startsWith("banner_info_")) {
    const bannerId = id.replace("banner_info_", "");
    const banner = banners.find(b => b.bannerId === bannerId);
    if (!banner) return interaction.update({ content: "Banner not found.", embeds: [], components: [] });
    return interaction.update({ embeds: [buildInfoEmbed(banner)], components: [backRow(bannerId)] });
  }

  if (id.startsWith("banner_cards_")) {
    const parts = id.split("_");
    const page = parseInt(parts[parts.length - 1]);
    const bannerId = parts.slice(2, parts.length - 1).join("_");
    const banner = banners.find(b => b.bannerId === bannerId);
    if (!banner) return interaction.update({ content: "Banner not found.", embeds: [], components: [] });
    const { embed, total } = await buildViewCardsEmbed(banner, page, interaction.user.id);
    return interaction.update({ embeds: [embed], components: [cardsNavRow(bannerId, page, total)] });
  }

  if (id.startsWith("pull_single_")) {
    const bannerId = id.replace("pull_single_", "");
    const banner = banners.find(b => b.bannerId === bannerId);
    if (!banner) return interaction.update({ content: "Banner not found.", embeds: [], components: [] });
    const user = await User.findOne({ userId: interaction.user.id });
    if (!user) return interaction.update({ content: "You don't have a profile yet! Use `/register` first.", embeds: [], components: [] });
    const ticketKey = banner.type === "pickup" ? "pickupTickets" : "regularTickets";
    if (user.currency[ticketKey] < 1) return interaction.update({ content: `Not enough tickets! You have **${user.currency[ticketKey]}**.`, embeds: [], components: [] });
    user.currency[ticketKey] -= 1;
    await user.save();
    const results = await doPulls(interaction.user.id, banner, 1);
    await processBadges(user, interaction, "realtime");
    const _redis1 = getRedis();
    await incrementProgress(_redis1, interaction.user.id, "daily", "pull", 1);
    await incrementProgress(_redis1, interaction.user.id, "weekly", "pull", 1);
    return interaction.update({ embeds: [buildPullResultEmbed(results, banner, user.currency[ticketKey])], components: [bannerMainRow(bannerId, banner.type)] });
  }

  if (id.startsWith("pull_multi_")) {
    const bannerId = id.replace("pull_multi_", "");
    const banner = banners.find(b => b.bannerId === bannerId);
    if (!banner) return interaction.update({ content: "Banner not found.", embeds: [], components: [] });
    const user = await User.findOne({ userId: interaction.user.id });
    if (!user) return interaction.update({ content: "You don't have a profile yet! Use `/register` first.", embeds: [], components: [] });
    const ticketKey = banner.type === "pickup" ? "pickupTickets" : "regularTickets";
    if (user.currency[ticketKey] < 10) return interaction.update({ content: `Not enough tickets! You need **10**, you have **${user.currency[ticketKey]}**.`, embeds: [], components: [] });
    user.currency[ticketKey] -= 10;
    await user.save();
    const results = await doPulls(interaction.user.id, banner, 10);
    await processBadges(user, interaction, "realtime");
    const _redis10 = getRedis();
    await incrementProgress(_redis10, interaction.user.id, "daily", "pull", 10);
    await incrementProgress(_redis10, interaction.user.id, "weekly", "pull", 10);
    return interaction.update({ embeds: [buildPullResultEmbed(results, banner, user.currency[ticketKey])], components: [bannerMainRow(bannerId, banner.type)] });
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("banners")
    .setDescription("View and pull from active gacha banners"),

  async execute(interaction) {
    await interaction.deferReply();

    const user = await requireProfile(interaction);
    if (!user) return;

    const banners = await getActiveBanners();
    if (!banners.length) return interaction.editReply({ content: "No active banners at the moment." });

    const first = banners[0];
    const msg = await interaction.editReply({
      embeds: [buildBannerEmbed(first)],
      components: [bannerMainRow(first.bannerId, first.type)],
    });

    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 5 * 60 * 1000,
    });

    collector.on("collect", async i => {
      try {
        const freshBanners = await getActiveBanners();
        await handleBannerInteraction(i, freshBanners);
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
