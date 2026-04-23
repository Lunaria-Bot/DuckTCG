const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ComponentType,
} = require("discord.js");
const Card   = require("../../models/Card");
const Series = require("../../models/Series");

const RARITY_ORDER = { exceptional: 0, special: 1, rare: 2, common: 3 };
const RARITY_EMOJI = { radiant: "✨", exceptional: "<:Exceptional:1496532355719102656>", special: "<:Special:1496599588902273187>", rare: "<:Rare:1496204151447748811>", common: "<:Common:1495730171301462186>" };
const RARITY_COLOR = { radiant: 0xF0F0FF, exceptional: 0xFFD700, special: 0xAB47BC, rare: 0x42A5F5, common: 0x78909C };
const RARITY_LABEL = { exceptional: "Exceptional ✦✦✦", special: "Special ✦✦", rare: "Rare ✦", common: "Common" };
const ROLE_EMOJI   = { dps: "⚔️", support: "💚", tank: "🛡️" };

const PAGE_SIZE = 10;

function buildListEmbed(cards, page, totalPages, filters) {
  const slice = cards.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const lines = slice.map((c, i) => {
    const num = page * PAGE_SIZE + i + 1;
    const rar = RARITY_EMOJI[c.rarity] ?? "<:Common:1495730171301462186>";
    const rol = ROLE_EMOJI[c.role] ?? "";
    return `\`${String(num).padStart(3," ")}.\` ${rar}${rol} **${c.name}** — *${c.anime}*`;
  });

  const activeFilters = Object.entries(filters).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`);

  return new EmbedBuilder()
    .setTitle("🃏 Card List")
    .setDescription(
      `Browse all ${cards.length} card${cards.length !== 1 ? "s" : ""} in SeorinTCG.\n\n` +
      (lines.join("\n") || "*No cards match your filters.*")
    )
    .setColor(0x5B21B6)
    .setFooter({ text: [
      `Page ${page + 1} / ${totalPages} · ${cards.length} card${cards.length !== 1 ? "s" : ""}`,
      activeFilters.length ? `Filter: ${activeFilters.join(", ")}` : null,
    ].filter(Boolean).join(" · ") });
}

function buildCardEmbed(card, seriesName) {
  const embed = new EmbedBuilder()
    .setTitle(`${RARITY_EMOJI[card.rarity] ?? "<:Common:1495730171301462186>"} ${card.name}`)
    .setDescription(seriesName ? `*${card.anime}* · 📚 ${seriesName}` : `*${card.anime}*`)
    .setColor(RARITY_COLOR[card.rarity] ?? 0x5B21B6)
    .addFields(
      { name: "Rarity",      value: RARITY_LABEL[card.rarity] ?? card.rarity,              inline: true },
      { name: "Role",        value: `${ROLE_EMOJI[card.role] ?? ""} ${card.role.toUpperCase()}`, inline: true },
      { name: "Base Damage", value: `**${card.baseStats?.damage ?? 0}**`,                  inline: true },
      { name: "Base Mana",   value: `**${card.baseStats?.mana ?? 0}**`,                    inline: true },
      { name: "Base HP",     value: `**${card.baseStats?.hp ?? 0}**`,                      inline: true },
    );
  if (card.imageUrl) embed.setImage(card.imageUrl);
  return embed;
}

function buildCardSelectMenu(cards, page) {
  const slice = cards.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  if (!slice.length) return null;
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("card_view_select")
      .setPlaceholder("🖼️ View card image...")
      .addOptions(slice.map(card => {
        return new StringSelectMenuOptionBuilder()
          .setLabel(card.name.slice(0, 100))
          .setDescription(`${card.anime} · ${card.rarity}`.slice(0, 100))
          .setValue(card.cardId);
      }))
  );
}

function buildNavRow(page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("card_first").setLabel("⏮").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId("card_prev").setLabel("◀").setStyle(ButtonStyle.Primary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId("card_page").setLabel(`${page + 1} / ${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId("card_next").setLabel("▶").setStyle(ButtonStyle.Primary).setDisabled(page >= totalPages - 1),
    new ButtonBuilder().setCustomId("card_last").setLabel("⏭").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
  );
}

function buildFilterRow(f) {
  const anyActive = f.rarity || f.role || f.anime || f.series;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("card_open_rarity")
      .setLabel(f.rarity ? (`${RARITY_EMOJI[f.rarity] ?? ""} ${f.rarity}`).trim() || f.rarity : "Rarity")
      .setStyle(f.rarity ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("card_open_role")
      .setLabel(f.role ? (`${ROLE_EMOJI[f.role] ?? ""} ${f.role}`).trim() || f.role : "Role")
      .setStyle(f.role ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("card_open_series")
      .setLabel(f.seriesName ? f.seriesName.slice(0, 20) : "Series")
      .setStyle(f.series ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("card_open_anime")
      .setLabel(f.anime ? f.anime.slice(0, 20) : "Anime")
      .setStyle(f.anime ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("card_reset")
      .setLabel("✕ Reset")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!anyActive),
  );
}

function buildRarityDropdown() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("card_filter_rarity")
      .setPlaceholder("Select rarity")
      .addOptions([
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
    new StringSelectMenuBuilder()
      .setCustomId("card_filter_role")
      .setPlaceholder("Select role")
      .addOptions([
        new StringSelectMenuOptionBuilder().setLabel("All roles").setValue("all"),
        new StringSelectMenuOptionBuilder().setLabel("DPS").setValue("dps"),
        new StringSelectMenuOptionBuilder().setLabel("Support").setValue("support"),
        new StringSelectMenuOptionBuilder().setLabel("Tank").setValue("tank"),
      ])
  );
}

function buildSeriesDropdown(seriesList) {
  const options = [
    new StringSelectMenuOptionBuilder().setLabel("All series").setDescription("Show all cards").setValue("all"),
    new StringSelectMenuOptionBuilder().setLabel("No series").setDescription("Cards without a series").setValue("none"),
  ];
  for (const s of seriesList.slice(0, 23)) {
    options.push(new StringSelectMenuOptionBuilder()
      .setLabel(s.name.slice(0, 100))
      .setDescription(`Filter by ${s.name}`)
      .setValue(`series_${s.seriesId}`)
    );
  }
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("card_filter_series")
      .setPlaceholder("Filter by series")
      .addOptions(options)
  );
}

function buildAnimeDropdown(animes, page = 0) {
  const PAGE = 23;
  const slice = animes.slice(page * PAGE, (page + 1) * PAGE);
  const hasMore = animes.length > (page + 1) * PAGE;
  const options = [];
  if (page > 0) options.push(new StringSelectMenuOptionBuilder().setLabel("← Previous").setValue(`anime_prev_${page}`));
  if (hasMore) options.push(new StringSelectMenuOptionBuilder().setLabel("Next →").setValue(`anime_next_${page}`));
  options.push(new StringSelectMenuOptionBuilder().setLabel("All anime").setValue("all"));
  for (const anime of slice) {
    options.push(new StringSelectMenuOptionBuilder()
      .setLabel(anime.slice(0, 100))
      .setValue(`anime_${anime}`)
    );
  }
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("card_filter_anime")
      .setPlaceholder("Filter by anime")
      .addOptions(options.slice(0, 25))
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("card")
    .setDescription("Browse all available cards in SeorinTCG"),

  async execute(interaction) {
    await interaction.deferReply();

    const [allCards, seriesList] = await Promise.all([
      Card.find({ isAvailable: true }).sort({ anime: 1, rarity: 1, name: 1 }),
      Series.find({ isActive: true }).sort({ name: 1 }),
    ]);
    if (!allCards.length) return interaction.editReply({ content: "No cards available yet." });

    // Map seriesId → name for quick lookup
    const seriesMap = new Map(seriesList.map(s => [s.seriesId, s.name]));
    const uniqueAnimes = [...new Set(allCards.map(c => c.anime))].sort();

    const state = {
      page: 0,
      filterRarity: "",
      filterRole: "",
      filterAnime: "",
      filterSeries: "",     // seriesId or "none"
      filterSeriesName: "", // display name
      animePage: 0,
      openDropdown: null,
      detailCard: null,
    };

    function getFiltered() {
      return allCards.filter(c => {
        if (state.filterRarity && c.rarity !== state.filterRarity) return false;
        if (state.filterRole   && c.role   !== state.filterRole)   return false;
        if (state.filterAnime  && c.anime  !== state.filterAnime)  return false;
        if (state.filterSeries === "none" && c.seriesId) return false;
        if (state.filterSeries && state.filterSeries !== "none" && c.seriesId !== state.filterSeries) return false;
        return true;
      });
    }

    async function buildMessage() {
      const filtered = getFiltered();
      const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      state.page = Math.min(state.page, totalPages - 1);

      if (state.detailCard) {
        const card = allCards.find(c => c.cardId === state.detailCard);
        if (card) {
          const seriesName = card.seriesId ? seriesMap.get(card.seriesId) : null;
          const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("card_back_list").setLabel("← Back to List").setStyle(ButtonStyle.Secondary),
          );
          return { embeds: [buildCardEmbed(card, seriesName)], components: [backRow] };
        }
      }

      const filters = {
        ...(state.filterRarity ? { Rarity: state.filterRarity } : {}),
        ...(state.filterRole   ? { Role: state.filterRole }     : {}),
        ...(state.filterSeries ? { Series: state.filterSeriesName || state.filterSeries } : {}),
        ...(state.filterAnime  ? { Anime: state.filterAnime }   : {}),
      };

      const filterRow = buildFilterRow({ rarity: state.filterRarity, role: state.filterRole, anime: state.filterAnime, series: state.filterSeries, seriesName: state.filterSeriesName });
      const components = [buildNavRow(state.page, totalPages), filterRow];
      if (state.openDropdown === "rarity") components.push(buildRarityDropdown());
      else if (state.openDropdown === "role")   components.push(buildRoleDropdown());
      else if (state.openDropdown === "series") components.push(buildSeriesDropdown(seriesList));
      else if (state.openDropdown === "anime")  components.push(buildAnimeDropdown(uniqueAnimes, state.animePage));
      else {
        const cardMenu = buildCardSelectMenu(filtered, state.page);
        if (cardMenu) components.push(cardMenu);
      }

      return {
        embeds: [buildListEmbed(filtered, state.page, totalPages, filters)],
        components,
      };
    }

    const msg = await interaction.editReply(await buildMessage());

    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 10 * 60 * 1000,
    });

    collector.on("collect", async i => {
      await i.deferUpdate();
      const id = i.customId;

      if      (id === "card_back_list")   { state.detailCard = null; }
      else if (id === "card_first")       { state.page = 0; }
      else if (id === "card_prev")        { state.page = Math.max(0, state.page - 1); }
      else if (id === "card_next")        { const t = Math.max(1, Math.ceil(getFiltered().length / PAGE_SIZE)); state.page = Math.min(t - 1, state.page + 1); }
      else if (id === "card_last")        { const t = Math.max(1, Math.ceil(getFiltered().length / PAGE_SIZE)); state.page = t - 1; }
      else if (id === "card_open_rarity") { state.openDropdown = state.openDropdown === "rarity" ? null : "rarity"; }
      else if (id === "card_open_role")   { state.openDropdown = state.openDropdown === "role"   ? null : "role"; }
      else if (id === "card_open_series") { state.openDropdown = state.openDropdown === "series" ? null : "series"; }
      else if (id === "card_open_anime")  { state.openDropdown = state.openDropdown === "anime"  ? null : "anime"; state.animePage = 0; }
      else if (id === "card_reset")       { state.filterRarity = ""; state.filterRole = ""; state.filterAnime = ""; state.filterSeries = ""; state.filterSeriesName = ""; state.page = 0; state.openDropdown = null; }
      else if (id === "card_view_select") {
        state.detailCard = i.values[0];
        state.openDropdown = null;
      }

      else if (id === "card_filter_rarity") {
        state.filterRarity = i.values[0] === "all" ? "" : i.values[0];
        state.page = 0; state.openDropdown = null;
      }
      else if (id === "card_filter_role") {
        state.filterRole = i.values[0] === "all" ? "" : i.values[0];
        state.page = 0; state.openDropdown = null;
      }
      else if (id === "card_filter_series") {
        const val = i.values[0];
        if (val === "all") { state.filterSeries = ""; state.filterSeriesName = ""; }
        else if (val === "none") { state.filterSeries = "none"; state.filterSeriesName = "No series"; }
        else {
          const sid = val.replace(/^series_/, "");
          state.filterSeries = sid;
          state.filterSeriesName = seriesMap.get(sid) ?? sid;
        }
        state.page = 0; state.openDropdown = null;
      }
      else if (id === "card_filter_anime") {
        const val = i.values[0];
        if (val.startsWith("anime_next_")) { state.animePage = parseInt(val.split("_")[2]) + 1; }
        else if (val.startsWith("anime_prev_")) { state.animePage = Math.max(0, parseInt(val.split("_")[2]) - 1); }
        else if (val === "all") { state.filterAnime = ""; state.page = 0; state.openDropdown = null; }
        else { state.filterAnime = val.replace(/^anime_/, ""); state.page = 0; state.openDropdown = null; }
      }

      await interaction.editReply(await buildMessage());
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
