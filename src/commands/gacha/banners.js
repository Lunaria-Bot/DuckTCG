const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
} = require("discord.js");
const Banner = require("../../models/Banner");
const Card = require("../../models/Card");
const PlayerCard = require("../../models/PlayerCard");
const User = require("../../models/User");
const { doPulls } = require("../../services/gacha");

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

// ─── Helpers ────────────────────────────────────────────────────────────────

function getActiveBanners() {
  const now = new Date();
  return Banner.find({
    isActive: true,
    startsAt: { $lte: now },
    $or: [{ endsAt: null }, { endsAt: { $gte: now } }],
  }).sort({ type: -1 }); // pickup first
}

function formatDate(date) {
  if (!date) return "Permanent";
  return date.toLocaleDateString("en-GB").replace(/\//g, "/");
}

// ─── Build embeds ────────────────────────────────────────────────────────────

function buildBannerEmbed(banner) {
  const start = formatDate(banner.startsAt);
  const end   = formatDate(banner.endsAt);

  const embed = new EmbedBuilder()
    .setTitle(banner.name)
    .setColor(banner.type === "pickup" ? 0xAB47BC : 0x42A5F5)
    .addFields({ name: "\u200b", value: `From ${start} - ${end}` });

  if (banner.imageUrl) embed.setImage(banner.imageUrl);
  return embed;
}

function buildInfoEmbed(banner) {
  const featuredList = banner.featuredCards.length
    ? banner.featuredCards.map((id, i) => `${i + 1}. ✨ ${id}`).join("\n")
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
        value: [
          `⬜ Common: ${banner.rates.common}%`,
          `🟦 Rare: ${banner.rates.rare}%`,
          `🟪 Special: ${banner.rates.special}%`,
          `🌟 Exceptional: ${banner.rates.exceptional}%`,
        ].join("\n"),
        inline: true,
      },
      {
        name: "Drop rates for 1x summon",
        value: [
          `⬜ Common: ${banner.rates.common}%`,
          `🟦 Rare: ${banner.rates.rare}%`,
          `🟪 Special: ${banner.rates.special}%`,
          `🌟 Exceptional: ${banner.rates.exceptional}%`,
        ].join("\n"),
        inline: true,
      },
      { name: "Gacha duration", value: `From ${start} - ${end}` },
    );

  if (banner.imageUrl) embed.setImage(banner.imageUrl);
  return embed;
}

async function buildViewCardsEmbed(banner, page, userId) {
  const allCardIds = [
    ...banner.pool.exceptional,
    ...banner.pool.special,
    ...banner.pool.rare,
    ...banner.pool.common,
  ];

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
    .addFields(
      { name: banner.name, value: `ID: ${cardId}\nPrint total: ${card?.totalPrints ?? 0}` },
    )
    .setFooter({ text: `${RARITY_EMOJI[card?.rarity] ?? ""} page ${page + 1} of ${allCardIds.length} | You Own: ${owned}` });

  if (card?.imageUrl) embed.setImage(card.imageUrl);
  return { embed, total: allCardIds.length };
}

// ─── Button rows ─────────────────────────────────────────────────────────────

function bannerMainRow(bannerId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pull_single_${bannerId}`).setLabel("Single").setStyle(ButtonStyle.Primary).setEmoji("🎟️"),
    new ButtonBuilder().setCustomId(`pull_multi_${bannerId}`).setLabel("x10").setStyle(ButtonStyle.Primary).setEmoji("🎟️"),
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

// ─── Pull result embed ───────────────────────────────────────────────────────

function buildPullResultEmbed(results, banner, remaining) {
  if (results.length === 1) {
    const { card, playerCard, rarity } = results[0];
    return new EmbedBuilder()
      .setTitle(RARITY_LABEL[rarity])
      .setDescription(`**${card.name}** — *${card.anime}*\nPrint **#${playerCard.printNumber}**`)
      .setColor(RARITY_COLOR[rarity])
      .setThumbnail(card.imageUrl)
      .setFooter({ text: `Remaining tickets: ${remaining}` });
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

// ─── Main interaction handler ─────────────────────────────────────────────────

async function handleBannerInteraction(interaction, banners) {
  const id = interaction.customId;

  // ── Banner list (dropdown) ──
  if (id === "banner_list") {
    if (!banners.length) {
      return interaction.update({ content: "No active banners.", embeds: [], components: [] });
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId("banner_select")
      .setPlaceholder("select banner")
      .addOptions(
        banners.map(b =>
          new StringSelectMenuOptionBuilder()
            .setLabel(b.name)
            .setDescription(b.description ?? `${b.type === "pickup" ? "Pick Up" : "Regular"} banner`)
            .setValue(b.bannerId)
        )
      );

    const firstBanner = banners[0];
    const embed = buildBannerEmbed(firstBanner);

    return interaction.update({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(select)],
    });
  }

  // ── Select banner from dropdown ──
  if (id === "banner_select") {
    const bannerId = interaction.values[0];
    const banner = banners.find(b => b.bannerId === bannerId);
    if (!banner) return interaction.update({ content: "Banner not found.", embeds: [], components: [] });

    return interaction.update({
      embeds: [buildBannerEmbed(banner)],
      components: [bannerMainRow(bannerId)],
    });
  }

  // ── View specific banner ──
  if (id.startsWith("banner_view_")) {
    const bannerId = id.replace("banner_view_", "");
    const banner = banners.find(b => b.bannerId === bannerId);
    if (!banner) return interaction.update({ content: "Banner not found.", embeds: [], components: [] });

    return interaction.update({
      embeds: [buildBannerEmbed(banner)],
      components: [bannerMainRow(bannerId)],
    });
  }

  // ── Info ──
  if (id.startsWith("banner_info_")) {
    const bannerId = id.replace("banner_info_", "");
    const banner = banners.find(b => b.bannerId === bannerId);
    if (!banner) return interaction.update({ content: "Banner not found.", embeds: [], components: [] });

    return interaction.update({
      embeds: [buildInfoEmbed(banner)],
      components: [backRow(bannerId)],
    });
  }

  // ── View cards ──
  if (id.startsWith("banner_cards_")) {
    const parts = id.split("_");
    const page = parseInt(parts[parts.length - 1]);
    const bannerId = parts.slice(2, parts.length - 1).join("_");
    const banner = banners.find(b => b.bannerId === bannerId);
    if (!banner) return interaction.update({ content: "Banner not found.", embeds: [], components: [] });

    const { embed, total } = await buildViewCardsEmbed(banner, page, interaction.user.id);
    return interaction.update({
      embeds: [embed],
      components: [cardsNavRow(bannerId, page, total)],
    });
  }

  // ── Pull single ──
  if (id.startsWith("pull_single_")) {
    const bannerId = id.replace("pull_single_", "");
    const banner = banners.find(b => b.bannerId === bannerId);
    if (!banner) return interaction.update({ content: "Banner not found.", embeds: [], components: [] });

    const user = await User.findOne({ userId: interaction.user.id });
    if (!user) return interaction.update({ content: "You don't have a profile yet. Use `/register` first.", embeds: [], components: [] });

    const ticketKey = banner.type === "pickup" ? "pickupTickets" : "regularTickets";
    if (user.currency[ticketKey] < 1) {
      return interaction.update({ content: `Not enough tickets! You have **${user.currency[ticketKey]}**.`, embeds: [], components: [] });
    }

    user.currency[ticketKey] -= 1;
    await user.save();

    const results = await doPulls(interaction.user.id, banner, 1);
    const embed = buildPullResultEmbed(results, banner, user.currency[ticketKey]);

    return interaction.update({ embeds: [embed], components: [bannerMainRow(bannerId)] });
  }

  // ── Pull multi ──
  if (id.startsWith("pull_multi_")) {
    const bannerId = id.replace("pull_multi_", "");
    const banner = banners.find(b => b.bannerId === bannerId);
    if (!banner) return interaction.update({ content: "Banner not found.", embeds: [], components: [] });

    const user = await User.findOne({ userId: interaction.user.id });
    if (!user) return interaction.update({ content: "You don't have a profile yet. Use `/register` first.", embeds: [], components: [] });

    const ticketKey = banner.type === "pickup" ? "pickupTickets" : "regularTickets";
    if (user.currency[ticketKey] < 10) {
      return interaction.update({ content: `Not enough tickets! You need **10**, you have **${user.currency[ticketKey]}**.`, embeds: [], components: [] });
    }

    user.currency[ticketKey] -= 10;
    await user.save();

    const results = await doPulls(interaction.user.id, banner, 10);
    const embed = buildPullResultEmbed(results, banner, user.currency[ticketKey]);

    return interaction.update({ embeds: [embed], components: [bannerMainRow(bannerId)] });
  }
}

// ─── Command ──────────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName("banners")
    .setDescription("View and pull from active gacha banners"),

  async execute(interaction) {
    await interaction.deferReply();

    const banners = await getActiveBanners();

    if (!banners.length) {
      return interaction.editReply({ content: "No active banners at the moment." });
    }

    // Show first banner by default
    const first = banners[0];
    const msg = await interaction.editReply({
      embeds: [buildBannerEmbed(first)],
      components: [bannerMainRow(first.bannerId)],
    });

    // Collector — keeps the menu alive for 5 minutes
    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 5 * 60 * 1000,
    });

    collector.on("collect", async i => {
      try {
        // Refresh banners on each interaction in case of rotation
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
