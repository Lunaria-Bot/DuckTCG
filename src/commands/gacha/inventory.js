const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ComponentType,
} = require("discord.js");
const { requireProfile } = require("../../utils/requireProfile");
const PlayerCard = require("../../models/PlayerCard");
const Card = require("../../models/Card");
const User = require("../../models/User");

const PAGE_SIZE_LIST = 10;
const PAGE_SIZE_GRID = 1; // grid = 1 card at a time with full image

const RARITY_ORDER = { exceptional: 0, special: 1, rare: 2, common: 3 };
const RARITY_EMOJI = { exceptional: "🌟", special: "🟪", rare: "🟦", common: "⬜" };
const RARITY_COLOR = { exceptional: 0xFFD700, special: 0xAB47BC, rare: 0x42A5F5, common: 0x9E9E9E };
const ROLE_EMOJI   = { dps: "⚔️", support: "💚", tank: "🛡️" };

const DUCK_COIN = "<:duck_coin:1494344514465431614>";
const PERMA     = "<:perma_ticket:1494344593863344258>";
const PICKUP    = "<:pickup_ticket:1494344547046523091>";

// ─── Sorting ──────────────────────────────────────────────────────────────────
function sortCards(pairs, sortBy) {
  return [...pairs].sort((a, b) => {
    switch (sortBy) {
      case "rarity":   return (RARITY_ORDER[a.card.rarity] ?? 9) - (RARITY_ORDER[b.card.rarity] ?? 9);
      case "level":    return b.pc.level - a.pc.level;
      case "print":    return a.pc.printNumber - b.pc.printNumber;
      case "anime":    return a.card.anime.localeCompare(b.card.anime);
      case "date":     return new Date(b.pc.createdAt) - new Date(a.pc.createdAt);
      default:         return 0;
    }
  });
}

// ─── Filtering ────────────────────────────────────────────────────────────────
function filterCards(pairs, filterRarity, filterAnime, filterRole) {
  return pairs.filter(({ card }) => {
    if (filterRarity && card.rarity !== filterRarity) return false;
    if (filterAnime && card.anime !== filterAnime) return false;
    if (filterRole && card.role !== filterRole) return false;
    return true;
  });
}

// ─── Build LIST embed ─────────────────────────────────────────────────────────
function buildListEmbed(pairs, page, totalPages, total, username, sortBy, filterRarity, filterAnime, filterRole) {
  const slice = pairs.slice(page * PAGE_SIZE_LIST, (page + 1) * PAGE_SIZE_LIST);

  const lines = slice.map((({ pc, card }, i) => {
    const num = page * PAGE_SIZE_LIST + i + 1;
    const rarEmoji = RARITY_EMOJI[card.rarity] ?? "⬜";
    const roleEmoji = ROLE_EMOJI[card.role] ?? "";
    return `\`${String(num).padStart(3, " ")}.\` ${rarEmoji}${roleEmoji} **${card.name}**\n\u200b     Lv.**${pc.level}** · Print **#${pc.printNumber}** · *${card.anime}*`;
  }));

  const activeFilters = [
    filterRarity ? `Rarity: ${filterRarity}` : null,
    filterAnime  ? `Anime: ${filterAnime}`   : null,
    filterRole   ? `Role: ${filterRole}`     : null,
  ].filter(Boolean).join(" · ");

  const sortLabel = { rarity: "Rarity", level: "Level", print: "Print", anime: "Anime", date: "Recent" }[sortBy] ?? sortBy;

  return new EmbedBuilder()
    .setTitle(`${username}'s Collection`)
    .setDescription(lines.join("\n") || "*No cards match your filters.*")
    .setColor(0x5B21B6)
    .setFooter({ text: [
      `Page ${page + 1}/${totalPages} · ${total} card${total !== 1 ? "s" : ""}`,
      `Sort: ${sortLabel}`,
      activeFilters,
    ].filter(Boolean).join(" · ") });
}

// ─── Build GRID embed (1 card with image) ─────────────────────────────────────
function buildGridEmbed(pairs, page, totalPages, username) {
  if (!pairs.length) {
    return new EmbedBuilder().setTitle(`${username}'s Collection`).setDescription("*No cards match your filters.*").setColor(0x5B21B6);
  }
  const { pc, card } = pairs[page];
  const rarEmoji  = RARITY_EMOJI[card.rarity] ?? "⬜";
  const roleEmoji = ROLE_EMOJI[card.role] ?? "";

  const embed = new EmbedBuilder()
    .setTitle(`${rarEmoji} ${card.name}`)
    .setColor(RARITY_COLOR[card.rarity] ?? 0x5B21B6)
    .addFields(
      { name: "Anime",   value: card.anime,               inline: true },
      { name: "Role",    value: `${roleEmoji} ${card.role}`, inline: true },
      { name: "Rarity",  value: card.rarity,               inline: true },
      { name: "Level",   value: `**${pc.level}**`,         inline: true },
      { name: "Print",   value: `**#${pc.printNumber}**`,  inline: true },
      { name: "CP",      value: `**${pc.cachedStats?.combatPower ?? 0}**`, inline: true },
    )
    .setFooter({ text: `${username}'s Collection · Card ${page + 1} of ${totalPages}` });

  if (card.imageUrl) embed.setImage(card.imageUrl);
  return embed;
}

// ─── Build rows ───────────────────────────────────────────────────────────────
function buildNavRow(page, totalPages, view) {
  const isGrid = view === "grid";
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("inv_first").setLabel("⏮").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId("inv_prev").setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId("inv_next").setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
    new ButtonBuilder().setCustomId("inv_last").setLabel("⏭").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
    new ButtonBuilder().setCustomId("inv_toggle_view").setLabel(isGrid ? "📋 List" : "🖼️ Grid").setStyle(ButtonStyle.Success),
  );
}

function buildFilterSortRow(animes) {
  const raritySelect = new StringSelectMenuBuilder()
    .setCustomId("inv_filter_rarity")
    .setPlaceholder("Filter by rarity")
    .addOptions([
      new StringSelectMenuOptionBuilder().setLabel("All rarities").setValue("all").setEmoji("✨"),
      new StringSelectMenuOptionBuilder().setLabel("Exceptional").setValue("exceptional").setEmoji("🌟"),
      new StringSelectMenuOptionBuilder().setLabel("Special").setValue("special").setEmoji("🟪"),
      new StringSelectMenuOptionBuilder().setLabel("Rare").setValue("rare").setEmoji("🟦"),
      new StringSelectMenuOptionBuilder().setLabel("Common").setValue("common").setEmoji("⬜"),
    ]);

  return new ActionRowBuilder().addComponents(raritySelect);
}

function buildSortRow() {
  const sortSelect = new StringSelectMenuBuilder()
    .setCustomId("inv_sort")
    .setPlaceholder("Sort by...")
    .addOptions([
      new StringSelectMenuOptionBuilder().setLabel("Rarity (best first)").setValue("rarity").setEmoji("🌟"),
      new StringSelectMenuOptionBuilder().setLabel("Level (highest first)").setValue("level").setEmoji("⬆️"),
      new StringSelectMenuOptionBuilder().setLabel("Print (lowest first)").setValue("print").setEmoji("🔢"),
      new StringSelectMenuOptionBuilder().setLabel("Anime (A-Z)").setValue("anime").setEmoji("📚"),
      new StringSelectMenuOptionBuilder().setLabel("Recently obtained").setValue("date").setEmoji("🕐"),
    ]);

  return new ActionRowBuilder().addComponents(sortSelect);
}

function buildRoleRow() {
  const roleSelect = new StringSelectMenuBuilder()
    .setCustomId("inv_filter_role")
    .setPlaceholder("Filter by role")
    .addOptions([
      new StringSelectMenuOptionBuilder().setLabel("All roles").setValue("all"),
      new StringSelectMenuOptionBuilder().setLabel("DPS").setValue("dps").setEmoji("⚔️"),
      new StringSelectMenuOptionBuilder().setLabel("Support").setValue("support").setEmoji("💚"),
      new StringSelectMenuOptionBuilder().setLabel("Tank").setValue("tank").setEmoji("🛡️"),
    ]);

  return new ActionRowBuilder().addComponents(roleSelect);
}

// ─── Command ──────────────────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName("inventory")
    .setDescription("View your card collection")
    .addUserOption(opt =>
      opt.setName("user").setDescription("View another player's collection (optional)")
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const self = await requireProfile(interaction);
    if (!self) return;

    const targetUser = interaction.options.getUser("user") ?? interaction.user;
    let targetProfile;
    if (targetUser.id !== interaction.user.id) {
      targetProfile = await User.findOne({ userId: targetUser.id });
      if (!targetProfile) return interaction.editReply({ content: `**${targetUser.username}** doesn't have a profile yet.` });
    } else {
      targetProfile = self;
    }

    // Load all non-burned cards
    const playerCards = await PlayerCard.find({ userId: targetUser.id, isBurned: false }).sort({ createdAt: -1 });
    if (!playerCards.length) return interaction.editReply({ content: `${targetUser.username} has no cards yet.` });

    // Load card data
    const cardIds = [...new Set(playerCards.map(pc => pc.cardId))];
    const cards = await Card.find({ cardId: { $in: cardIds } });
    const cardMap = Object.fromEntries(cards.map(c => [c.cardId, c]));

    // Build pairs
    const allPairs = playerCards
      .filter(pc => cardMap[pc.cardId])
      .map(pc => ({ pc, card: cardMap[pc.cardId] }));

    // State
    let sortBy        = "rarity";
    let filterRarity  = "";
    let filterAnime   = "";
    let filterRole    = "";
    let page          = 0;
    let view          = "list"; // "list" | "grid"

    // Unique animes for filter
    const uniqueAnimes = [...new Set(cards.map(c => c.anime))].sort();

    function getFiltered() {
      const filtered = filterCards(allPairs, filterRarity, filterAnime, filterRole);
      return sortCards(filtered, sortBy);
    }

    function getTotalPages(pairs) {
      const size = view === "grid" ? PAGE_SIZE_GRID : PAGE_SIZE_LIST;
      return Math.max(1, Math.ceil(pairs.length / size));
    }

    function buildMessage() {
      const pairs = getFiltered();
      const totalPages = getTotalPages(pairs);
      page = Math.min(page, totalPages - 1);

      const embed = view === "grid"
        ? buildGridEmbed(pairs, page, pairs.length, targetUser.username)
        : buildListEmbed(pairs, page, totalPages, pairs.length, targetUser.username, sortBy, filterRarity, filterAnime, filterRole);

      const components = [
        buildNavRow(page, totalPages, view),
        buildFilterSortRow(uniqueAnimes),
        buildSortRow(),
        buildRoleRow(),
      ];

      return { embeds: [embed], components };
    }

    const msg = await interaction.editReply(buildMessage());

    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 10 * 60 * 1000,
    });

    collector.on("collect", async i => {
      await i.deferUpdate();
      const id = i.customId;

      if (id === "inv_first") page = 0;
      else if (id === "inv_prev") page = Math.max(0, page - 1);
      else if (id === "inv_next") page = Math.min(getTotalPages(getFiltered()) - 1, page + 1);
      else if (id === "inv_last") page = getTotalPages(getFiltered()) - 1;
      else if (id === "inv_toggle_view") { view = view === "list" ? "grid" : "list"; page = 0; }
      else if (id === "inv_filter_rarity") { filterRarity = i.values[0] === "all" ? "" : i.values[0]; page = 0; }
      else if (id === "inv_sort") { sortBy = i.values[0]; page = 0; }
      else if (id === "inv_filter_role") { filterRole = i.values[0] === "all" ? "" : i.values[0]; page = 0; }

      await interaction.editReply(buildMessage());
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
