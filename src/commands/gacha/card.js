const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} = require("discord.js");
const Card   = require("../../models/Card");
const Series = require("../../models/Series");

const PAGE_SIZE = 8;

const RARITY_ORDER = { radiant: -1, exceptional: 0, special: 1, rare: 2, common: 3 };
const RARITY_EMOJI = {
  radiant:     "✨",
  exceptional: "<:Exceptional:1496532355719102656>",
  special:     "<:Special:1496599588902273187>",
  rare:        "<:Rare:1496204151447748811>",
  common:      "<:Common:1496973383143788716>",
};
const RARITY_COLOR = { radiant: 0xE0F0FF, exceptional: 0xFFD700, special: 0xAB47BC, rare: 0x42A5F5, common: 0x78909C };
const RARITY_LABEL = { radiant: "Radiant ✨", exceptional: "Exceptional ✦✦✦", special: "Special ✦✦", rare: "Rare ✦", common: "Common" };
const ROLE_EMOJI   = { dps: "⚔️", support: "💚", tank: "🛡️" };

function sortCards(cards, sortBy) {
  return [...cards].sort((a, b) => {
    switch (sortBy) {
      case "rarity": return (RARITY_ORDER[a.rarity] ?? 9) - (RARITY_ORDER[b.rarity] ?? 9);
      case "name":   return a.name.localeCompare(b.name);
      case "anime":  return a.anime.localeCompare(b.anime);
      default:       return 0;
    }
  });
}

function filterCards(cards, filterRarity, filterRole, filterAnime) {
  return cards.filter(c => {
    if (filterRarity && c.rarity !== filterRarity) return false;
    if (filterRole   && c.role   !== filterRole)   return false;
    if (filterAnime  && c.anime  !== filterAnime)  return false;
    return true;
  });
}

function buildListEmbed(cards, page, sortBy, filterRarity, filterRole, filterAnime) {
  const totalPages = Math.max(1, Math.ceil(cards.length / PAGE_SIZE));
  const slice      = cards.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const lines = slice.map(c => {
    const rar   = RARITY_EMOJI[c.rarity] ?? "<:Common:1496973383143788716>";
    const rol   = ROLE_EMOJI[c.role] ?? "";
    const avail = c.isAvailable ? "" : " *(unavailable)*";
    return [
      `${rar} **${c.name}**${avail}`,
      `${rol} ${c.anime}  ·  ${RARITY_LABEL[c.rarity] ?? c.rarity}`,
    ].join("\n");
  });

  const activeFilters = [
    filterRarity ? `Rarity: ${filterRarity}` : null,
    filterRole   ? `Role: ${filterRole}`     : null,
    filterAnime  ? `Anime: ${filterAnime}`   : null,
  ].filter(Boolean);

  const sortLabel = { rarity: "Rarity", name: "Name", anime: "Anime" }[sortBy] ?? sortBy;

  return new EmbedBuilder()
    .setTitle("🃏 Card List")
    .setDescription(
      `**${cards.length}** card${cards.length !== 1 ? "s" : ""} in SeorinTCG.\n\n` +
      (lines.join("\n\n") || "*No cards match your filters.*")
    )
    .setColor(0x5B21B6)
    .setFooter({ text: [
      `Page ${page + 1}/${totalPages} · ${cards.length} card${cards.length !== 1 ? "s" : ""}`,
      `Sort: ${sortLabel}`,
      ...activeFilters,
    ].join(" · ") });
}

function buildCardEmbed(cards, index, seriesMap) {
  if (!cards.length) return new EmbedBuilder().setTitle("🃏 Card List").setDescription("*No cards match your filters.*").setColor(0x5B21B6);
  const card       = cards[index];
  const seriesName = card.seriesId ? seriesMap[card.seriesId] : null;

  const embed = new EmbedBuilder()
    .setTitle(`${RARITY_EMOJI[card.rarity] ?? "<:Common:1496973383143788716>"}  ${RARITY_LABEL[card.rarity] ?? card.rarity} — ${card.name}`)
    .setDescription([
      `*${card.anime}*`,
      seriesName ? `📚 ${seriesName}` : null,
      `${ROLE_EMOJI[card.role] ?? ""} **${card.role.toUpperCase()}**`,
    ].filter(Boolean).join("\n"))
    .setColor(RARITY_COLOR[card.rarity] ?? 0x5B21B6)
    .addFields(
      { name: "Base Damage", value: `**${card.baseStats?.damage ?? 0}**`, inline: true },
      { name: "Base Mana",   value: `**${card.baseStats?.mana   ?? 0}**`, inline: true },
      { name: "Base HP",     value: `**${card.baseStats?.hp     ?? 0}**`, inline: true },
    )
    .setFooter({ text: `Card ${index + 1} of ${cards.length}${card.isAvailable ? "" : " · Unavailable"}` });

  if (card.imageUrl) embed.setImage(card.imageUrl);
  return embed;
}

function buildNavRow(cur, total, view) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("card_first").setEmoji("⏮").setStyle(ButtonStyle.Secondary).setDisabled(cur === 0),
    new ButtonBuilder().setCustomId("card_prev").setEmoji("◀").setStyle(ButtonStyle.Primary).setDisabled(cur === 0),
    new ButtonBuilder().setCustomId("card_page").setLabel(`${cur + 1} / ${total}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId("card_next").setEmoji("▶").setStyle(ButtonStyle.Primary).setDisabled(cur >= total - 1),
    new ButtonBuilder().setCustomId("card_toggle").setLabel(view === "card" ? "📋 List" : "🖼️ Card").setStyle(ButtonStyle.Success),
  );
}

function buildControlRow(activeSort, activeRarity, activeRole) {
  const sortLabel   = { rarity: "Rarity ↕", name: "Name ↕", anime: "Anime ↕" }[activeSort] ?? "Sort ↕";
  const rarityLabel = activeRarity ? `${RARITY_EMOJI[activeRarity] ?? ""} ${activeRarity}`.trim() : "Rarity";
  const roleLabel   = activeRole   ? `${ROLE_EMOJI[activeRole]   ?? ""} ${activeRole}`.trim()   : "Role";
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("card_open_sort").setLabel(sortLabel).setStyle(activeSort !== "rarity" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("card_open_rarity").setLabel(rarityLabel).setStyle(activeRarity ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("card_open_role").setLabel(roleLabel).setStyle(activeRole ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("card_open_anime").setLabel("Anime").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("card_reset").setLabel("✕ Reset").setStyle(ButtonStyle.Danger).setDisabled(!activeRarity && !activeRole && activeSort === "rarity"),
  );
}

function buildSortDropdown() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId("card_sort").setPlaceholder("Sort by...").addOptions([
      new StringSelectMenuOptionBuilder().setLabel("Rarity (best first)").setValue("rarity"),
      new StringSelectMenuOptionBuilder().setLabel("Name (A → Z)").setValue("name"),
      new StringSelectMenuOptionBuilder().setLabel("Anime (A → Z)").setValue("anime"),
    ])
  );
}

function buildRarityDropdown() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId("card_filter_rarity").setPlaceholder("Filter by rarity...").addOptions([
      new StringSelectMenuOptionBuilder().setLabel("All rarities").setValue("all"),
      new StringSelectMenuOptionBuilder().setLabel("Radiant ✨").setValue("radiant"),
      new StringSelectMenuOptionBuilder().setLabel("Exceptional").setValue("exceptional"),
      new StringSelectMenuOptionBuilder().setLabel("Special").setValue("special"),
      new StringSelectMenuOptionBuilder().setLabel("Rare").setValue("rare"),
      new StringSelectMenuOptionBuilder().setLabel("Common").setValue("common"),
    ])
  );
}

function buildRoleDropdown() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId("card_filter_role").setPlaceholder("Filter by role...").addOptions([
      new StringSelectMenuOptionBuilder().setLabel("All roles").setValue("all"),
      new StringSelectMenuOptionBuilder().setLabel("DPS").setValue("dps"),
      new StringSelectMenuOptionBuilder().setLabel("Support").setValue("support"),
      new StringSelectMenuOptionBuilder().setLabel("Tank").setValue("tank"),
    ])
  );
}

function buildAnimeDropdown(animes, page = 0) {
  const PAGE    = 23;
  const slice   = animes.slice(page * PAGE, (page + 1) * PAGE);
  const hasMore = animes.length > (page + 1) * PAGE;
  const options = [new StringSelectMenuOptionBuilder().setLabel("All anime").setValue("all")];
  if (page > 0) options.push(new StringSelectMenuOptionBuilder().setLabel("← Previous").setValue(`anime_prev_${page}`));
  for (const a of slice) options.push(new StringSelectMenuOptionBuilder().setLabel(a.slice(0, 100)).setValue(`anime_${a}`));
  if (hasMore)  options.push(new StringSelectMenuOptionBuilder().setLabel("Next →").setValue(`anime_next_${page}`));
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId("card_filter_anime").setPlaceholder("Filter by anime...").addOptions(options)
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("card")
    .setDescription("Browse all cards in SeorinTCG"),

  async execute(interaction) {
    await interaction.deferReply();

    const allCards   = await Card.find().sort({ name: 1 });
    const seriesList = await Series.find();
    const seriesMap  = Object.fromEntries(seriesList.map(s => [s.seriesId, s.name]));
    const uniqueAnimes = [...new Set(allCards.map(c => c.anime))].sort();

    if (!allCards.length) return interaction.editReply({ content: "No cards exist yet." });

    const state = {
      view: "list", page: 0, cardIndex: 0,
      sortBy: "rarity", filterRarity: "", filterRole: "", filterAnime: "",
      animePage: 0, openDropdown: null,
    };

    function getVisible() {
      return sortCards(filterCards(allCards, state.filterRarity, state.filterRole, state.filterAnime), state.sortBy);
    }

    function totalListPages(cards) { return Math.max(1, Math.ceil(cards.length / PAGE_SIZE)); }

    function buildMessage() {
      const cards = getVisible();
      const tlp   = totalListPages(cards);
      state.page      = Math.min(state.page,      Math.max(0, tlp - 1));
      state.cardIndex = Math.min(state.cardIndex, Math.max(0, cards.length - 1));

      const cur   = state.view === "card" ? state.cardIndex : state.page;
      const total = state.view === "card" ? cards.length    : tlp;

      const embed = state.view === "card"
        ? buildCardEmbed(cards, state.cardIndex, seriesMap)
        : buildListEmbed(cards, state.page, state.sortBy, state.filterRarity, state.filterRole, state.filterAnime);

      const components = [
        buildNavRow(cur, total, state.view),
        buildControlRow(state.sortBy, state.filterRarity, state.filterRole),
      ];
      if (state.openDropdown === "sort")   components.push(buildSortDropdown());
      if (state.openDropdown === "rarity") components.push(buildRarityDropdown());
      if (state.openDropdown === "role")   components.push(buildRoleDropdown());
      if (state.openDropdown === "anime")  components.push(buildAnimeDropdown(uniqueAnimes, state.animePage));

      return { embeds: [embed], components };
    }

    const msg = await interaction.editReply(buildMessage());

    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 10 * 60 * 1000,
    });

    collector.on("collect", async i => {
      try {
        await i.deferUpdate();
        const id    = i.customId;
        const cards = getVisible();
        const tlp   = totalListPages(cards);

        if      (id === "card_first")  { state.view === "card" ? state.cardIndex = 0              : state.page = 0; }
        else if (id === "card_prev")   { state.view === "card" ? state.cardIndex--                : state.page--; }
        else if (id === "card_next")   { state.view === "card" ? state.cardIndex++                : state.page++; }
        else if (id === "card_toggle") {
          if (state.view === "list") { state.cardIndex = state.page * PAGE_SIZE; state.view = "card"; }
          else { state.page = Math.floor(state.cardIndex / PAGE_SIZE); state.view = "list"; }
          state.openDropdown = null;
        }
        else if (id === "card_open_sort")   { state.openDropdown = state.openDropdown === "sort"   ? null : "sort"; }
        else if (id === "card_open_rarity") { state.openDropdown = state.openDropdown === "rarity" ? null : "rarity"; }
        else if (id === "card_open_role")   { state.openDropdown = state.openDropdown === "role"   ? null : "role"; }
        else if (id === "card_open_anime")  { state.openDropdown = state.openDropdown === "anime"  ? null : "anime"; state.animePage = 0; }
        else if (id === "card_reset")       { state.sortBy = "rarity"; state.filterRarity = ""; state.filterRole = ""; state.filterAnime = ""; state.page = 0; state.cardIndex = 0; state.openDropdown = null; }
        else if (id === "card_sort")        { state.sortBy = i.values[0]; state.page = 0; state.cardIndex = 0; state.openDropdown = null; }
        else if (id === "card_filter_rarity") { state.filterRarity = i.values[0] === "all" ? "" : i.values[0]; state.page = 0; state.cardIndex = 0; state.openDropdown = null; }
        else if (id === "card_filter_role")   { state.filterRole   = i.values[0] === "all" ? "" : i.values[0]; state.page = 0; state.cardIndex = 0; state.openDropdown = null; }
        else if (id === "card_filter_anime") {
          const val = i.values[0];
          if      (val === "all")                    { state.filterAnime = ""; state.openDropdown = null; }
          else if (val.startsWith("anime_next_"))    { state.animePage = parseInt(val.split("_")[2]) + 1; }
          else if (val.startsWith("anime_prev_"))    { state.animePage = Math.max(0, parseInt(val.split("_")[2]) - 1); }
          else { state.filterAnime = val.replace(/^anime_/, ""); state.openDropdown = null; }
          state.page = 0; state.cardIndex = 0;
        }

        await interaction.editReply(buildMessage());
      } catch (err) {
        console.error("[card] collector error:", err);
      }
    });

    collector.on("end", () => { interaction.editReply({ components: [] }).catch(() => {}); });
  },
};
