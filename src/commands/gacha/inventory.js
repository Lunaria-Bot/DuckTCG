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

const PAGE_SIZE = 8;

const RARITY_ORDER = { exceptional: 0, special: 1, rare: 2, common: 3 };
const RARITY_EMOJI = { exceptional: "<:Exceptional:1496532355719102656>",
  radiant:     "✨", special: "<:Special:1496599588902273187>", rare: "<:Rare:1496204151447748811>", common: "<:Common:1495730171301462186>" };
const RARITY_COLOR = { radiant: 0xF0F0FF, exceptional: 0xFFD700, special: 0xAB47BC, rare: 0x42A5F5, common: 0x78909C };
const RARITY_LABEL = { radiant: "Radiant", exceptional: "Exceptional", special: "Special", rare: "Rare", common: "Common" };
const ROLE_EMOJI   = { dps: "⚔️", support: "💚", tank: "🛡️" };

function sortCards(pairs, sortBy) {
  return [...pairs].sort((a, b) => {
    switch (sortBy) {
      case "rarity": return (RARITY_ORDER[a.card.rarity] ?? 9) - (RARITY_ORDER[b.card.rarity] ?? 9);
      case "level":  return b.pc.level - a.pc.level;
      case "anime":  return a.card.anime.localeCompare(b.card.anime);
      case "date":   return new Date(b.pc.createdAt) - new Date(a.pc.createdAt);
      default:       return 0;
    }
  });
}

function filterCards(pairs, filterRarity, filterRole) {
  return pairs.filter(({ card }) => {
    if (filterRarity && card.rarity !== filterRarity) return false;
    if (filterRole   && card.role   !== filterRole)   return false;
    return true;
  });
}

// ─── List embed ───────────────────────────────────────────────────────────────
function buildListEmbed(pairs, page, username, sortBy, filterRarity, filterRole) {
  const totalPages = Math.max(1, Math.ceil(pairs.length / PAGE_SIZE));
  const slice      = pairs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalCards = pairs.reduce((sum, p) => sum + (p.pc.quantity ?? 1), 0);

  const lines = slice.map(({ pc, card }) => {
    const rar  = RARITY_EMOJI[card.rarity] ?? "<:Common:1495730171301462186>";
    const rol  = ROLE_EMOJI[card.role] ?? "";
    const qty  = (pc.quantity ?? 1) > 1 ? ` ×${pc.quantity}` : "";
    const cp   = pc.cachedStats?.combatPower ?? 0;
    // Line 1: rarity emoji + name + quantity
    // Line 2: series · role · level · PS
    return [
      `${rar} **${card.name}**${qty}`,
      `${rol} ${card.anime}  ·  Lv.**${pc.level}**  ·  PS **${cp.toLocaleString()}**`,
    ].join("\n");
  });

  const activeFilters = [
    filterRarity ? `Rarity: ${filterRarity}` : null,
    filterRole   ? `Role: ${filterRole}`     : null,
  ].filter(Boolean);

  const sortLabel = { rarity:"Rarity", level:"Level", anime:"Anime", date:"Recent" }[sortBy] ?? sortBy;

  return new EmbedBuilder()
    .setTitle(`${username}'s Inventory (${totalCards} card${totalCards !== 1 ? "s" : ""})`)
    .setDescription(lines.join("\n\n") || "*No cards match your filters.*")
    .setColor(0x5B21B6)
    .setFooter({ text: [
      `Page ${page + 1}/${totalPages} · ${pairs.length} unique`,
      `Sort: ${sortLabel}`,
      ...activeFilters,
    ].join(" · ") });
}

// ─── Card detail embed ────────────────────────────────────────────────────────
function buildCardEmbed(pairs, index, username, totalCopiesMap) {
  if (!pairs.length) return new EmbedBuilder().setTitle(`${username}'s Inventory`).setDescription("*No cards match your filters.*").setColor(0x5B21B6);

  const { pc, card } = pairs[index];
  const ownedCopies = pc.quantity ?? 1;
  const totalCopies = totalCopiesMap?.[card.cardId] ?? "?";

  const ownedLine = `Owned: ${ownedCopies} cop${ownedCopies > 1 ? "ies" : "y"}  ·  In Game: ${totalCopies} total`;

  const embed = new EmbedBuilder()
    .setTitle(`${RARITY_EMOJI[card.rarity] ?? "<:Common:1495730171301462186>"}  ${RARITY_LABEL[card.rarity] ?? card.rarity} — ${card.name}`)
    .setDescription(`*${card.anime}*\nLevel **${pc.level}** / ${pc.isAscended ? 125 : 100}\n${ROLE_EMOJI[card.role] ?? ""} **${card.role.toUpperCase()}**  ·  PS **${(pc.cachedStats?.combatPower ?? 0).toLocaleString()}**`)
    .setColor(RARITY_COLOR[card.rarity] ?? 0x5B21B6)
    .setFooter({ text: `${ownedLine}` });

  if (card.imageUrl) embed.setImage(card.imageUrl);

  return embed;
}

// ─── Rows ─────────────────────────────────────────────────────────────────────
function buildNavRow(cur, total, view) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("inv_first").setEmoji("⏮").setStyle(ButtonStyle.Secondary).setDisabled(cur === 0),
    new ButtonBuilder().setCustomId("inv_prev").setEmoji("◀").setStyle(ButtonStyle.Primary).setDisabled(cur === 0),
    new ButtonBuilder().setCustomId("inv_page").setLabel(`${cur + 1} / ${total}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId("inv_next").setEmoji("▶").setStyle(ButtonStyle.Primary).setDisabled(cur >= total - 1),
    new ButtonBuilder().setCustomId("inv_toggle").setLabel(view === "card" ? "📋 List" : "🖼️ Card").setStyle(ButtonStyle.Success),
  );
}

function buildControlRow(activeSort, activeRarity, activeRole) {
  const sortLabel   = { rarity:"Rarity ↕", level:"Level ↕", anime:"Anime ↕", date:"Recent ↕" }[activeSort] ?? "Sort ↕";
  const rarityLabel = activeRarity ? `${RARITY_EMOJI[activeRarity]} ${activeRarity}` : "Rarity";
  const roleLabel   = activeRole ? `${ROLE_EMOJI[activeRole] ?? ""} ${activeRole}` : "Role";
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("inv_open_sort").setLabel(sortLabel).setStyle(activeSort !== "rarity" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("inv_open_rarity").setLabel(rarityLabel).setStyle(activeRarity ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("inv_open_role").setLabel(roleLabel).setStyle(activeRole ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("inv_reset").setLabel("✕ Reset").setStyle(ButtonStyle.Danger).setDisabled(!activeRarity && !activeRole && activeSort === "rarity"),
  );
}

function buildSortDropdown() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId("inv_sort").setPlaceholder("Sort by...").addOptions([
      new StringSelectMenuOptionBuilder().setLabel("Rarity (best first)").setValue("rarity").setEmoji("<:Exceptional:1496532355719102656>"),
      new StringSelectMenuOptionBuilder().setLabel("Level (highest first)").setValue("level").setEmoji("⬆️"),
      new StringSelectMenuOptionBuilder().setLabel("Anime (A → Z)").setValue("anime").setEmoji("📚"),
      new StringSelectMenuOptionBuilder().setLabel("Recently obtained").setValue("date").setEmoji("🕐"),
    ])
  );
}

function buildRarityDropdown() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId("inv_filter_rarity").setPlaceholder("Filter by rarity...").addOptions([
      new StringSelectMenuOptionBuilder().setLabel("All rarities").setValue("all").setEmoji("✨"),
      new StringSelectMenuOptionBuilder().setLabel("Exceptional").setValue("exceptional").setEmoji("<:Exceptional:1496532355719102656>"),
      new StringSelectMenuOptionBuilder().setLabel("Special").setValue("special").setEmoji("<:Special:1496599588902273187>"),
      new StringSelectMenuOptionBuilder().setLabel("Rare").setValue("rare").setEmoji("<:Rare:1496204151447748811>"),
      new StringSelectMenuOptionBuilder().setLabel("Common").setValue("common").setEmoji("<:Common:1495730171301462186>"),
    ])
  );
}

function buildRoleDropdown() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId("inv_filter_role").setPlaceholder("Filter by role...").addOptions([
      new StringSelectMenuOptionBuilder().setLabel("All roles").setValue("all"),
      new StringSelectMenuOptionBuilder().setLabel("DPS").setValue("dps").setEmoji("⚔️"),
      new StringSelectMenuOptionBuilder().setLabel("Support").setValue("support").setEmoji("💚"),
      new StringSelectMenuOptionBuilder().setLabel("Tank").setValue("tank").setEmoji("🛡️"),
    ])
  );
}

// ─── Command ──────────────────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName("inventory")
    .setDescription("View your card collection")
    .addUserOption(opt => opt.setName("user").setDescription("View another player's collection (optional)")),

  async execute(interaction) {
    await interaction.deferReply();

    const self = await requireProfile(interaction);
    if (!self) return;

    const targetUser = interaction.options.getUser("user") ?? interaction.user;
    if (targetUser.id !== interaction.user.id) {
      const tp = await User.findOne({ userId: targetUser.id });
      if (!tp) return interaction.editReply({ content: `**${targetUser.username}** doesn't have a profile yet.` });
    }

    const playerCards = await PlayerCard.find({ userId: targetUser.id, isBurned: false, quantity: { $gt: 0 } }).sort({ createdAt: -1 });
    if (!playerCards.length) return interaction.editReply({ content: `${targetUser.username} has no cards yet.` });

    const cardIds = [...new Set(playerCards.map(pc => pc.cardId))];
    const cards   = await Card.find({ cardId: { $in: cardIds } });
    const cardMap = Object.fromEntries(cards.map(c => [c.cardId, c]));

    const allPairs = playerCards.filter(pc => cardMap[pc.cardId]).map(pc => ({ pc, card: cardMap[pc.cardId] }));

    const totalCopiesMap = {};

    const state = {
      view: "list", page: 0, cardIndex: 0,
      sortBy: "rarity", filterRarity: "", filterRole: "",
      openDropdown: null,
    };

    function getVisible() {
      return sortCards(filterCards(allPairs, state.filterRarity, state.filterRole), state.sortBy);
    }

    function totalListPages(pairs) { return Math.max(1, Math.ceil(pairs.length / PAGE_SIZE)); }

    function buildMessage() {
      const pairs = getVisible();
      const tlp   = totalListPages(pairs);
      state.page      = Math.min(state.page, tlp - 1);
      state.cardIndex = Math.min(state.cardIndex, Math.max(0, pairs.length - 1));

      const cur   = state.view === "card" ? state.cardIndex : state.page;
      const total = state.view === "card" ? pairs.length : tlp;

      const embed = state.view === "card"
        ? buildCardEmbed(pairs, state.cardIndex, targetUser.username, totalCopiesMap)
        : buildListEmbed(pairs, state.page, targetUser.username, state.sortBy, state.filterRarity, state.filterRole);

      const components = [
        buildNavRow(cur, total, state.view),
        buildControlRow(state.sortBy, state.filterRarity, state.filterRole),
      ];
      if (state.openDropdown === "sort")   components.push(buildSortDropdown());
      if (state.openDropdown === "rarity") components.push(buildRarityDropdown());
      if (state.openDropdown === "role")   components.push(buildRoleDropdown());

      return { embeds: [embed], components };
    }

    const msg = await interaction.editReply(buildMessage());

    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 10 * 60 * 1000,
    });

    collector.on("collect", async i => {
      await i.deferUpdate();
      const id    = i.customId;
      const pairs = getVisible();
      const tlp   = totalListPages(pairs);

      if      (id === "inv_first")  { state.view === "card" ? state.cardIndex = 0 : state.page = 0; }
      else if (id === "inv_prev")   { state.view === "card" ? state.cardIndex-- : state.page--; }
      else if (id === "inv_next")   { state.view === "card" ? state.cardIndex++ : state.page++; }
      else if (id === "inv_last")   { state.view === "card" ? state.cardIndex = pairs.length - 1 : state.page = tlp - 1; }
      else if (id === "inv_toggle") {
        if (state.view === "list") {
          state.cardIndex = state.page * PAGE_SIZE;
          state.view = "card";
          // Fetch total copies in game lazily
          if (Object.keys(totalCopiesMap).length === 0) {
            const cardIds = pairs.map(p => p.card.cardId);
            const totals = await PlayerCard.aggregate([
              { $match: { cardId: { $in: cardIds } } },
              { $group: { _id: "$cardId", total: { $sum: "$quantity" } } },
            ]);
            for (const t of totals) totalCopiesMap[t._id] = t.total;
          }
        } else { state.page = Math.floor(state.cardIndex / PAGE_SIZE); state.view = "list"; }
        state.openDropdown = null;
      }
      else if (id === "inv_open_sort")   { state.openDropdown = state.openDropdown === "sort"   ? null : "sort"; }
      else if (id === "inv_open_rarity") { state.openDropdown = state.openDropdown === "rarity" ? null : "rarity"; }
      else if (id === "inv_open_role")   { state.openDropdown = state.openDropdown === "role"   ? null : "role"; }
      else if (id === "inv_reset")       { state.sortBy = "rarity"; state.filterRarity = ""; state.filterRole = ""; state.page = 0; state.cardIndex = 0; state.openDropdown = null; }
      else if (id === "inv_sort")        { state.sortBy = i.values[0]; state.page = 0; state.cardIndex = 0; state.openDropdown = null; }
      else if (id === "inv_filter_rarity") { state.filterRarity = i.values[0] === "all" ? "" : i.values[0]; state.page = 0; state.cardIndex = 0; state.openDropdown = null; }
      else if (id === "inv_filter_role")   { state.filterRole   = i.values[0] === "all" ? "" : i.values[0]; state.page = 0; state.cardIndex = 0; state.openDropdown = null; }

      await interaction.editReply(buildMessage());
    });

    collector.on("end", () => { interaction.editReply({ components: [] }).catch(() => {}); });
  },
};
