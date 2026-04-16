const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ComponentType,
} = require("discord.js");
const Card = require("../../models/Card");
const PlayerCard = require("../../models/PlayerCard");

const RARITY_ORDER = { exceptional: 0, special: 1, rare: 2, common: 3 };
const RARITY_EMOJI = { exceptional: "🌟", special: "🟪", rare: "🟦", common: "⬜" };
const RARITY_COLOR = { exceptional: 0xFFD700, special: 0xAB47BC, rare: 0x42A5F5, common: 0x78909C };
const RARITY_LABEL = { exceptional: "Exceptional ✦✦✦", special: "Special ✦✦", rare: "Rare ✦", common: "Common" };
const ROLE_EMOJI   = { dps: "⚔️", support: "💚", tank: "🛡️" };

const PAGE_SIZE = 10;

function buildListEmbed(cards, page, totalPages, filterRarity, filterRole, filterAnime) {
  const slice = cards.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const lines = slice.map((c, i) => {
    const num = page * PAGE_SIZE + i + 1;
    const rar = RARITY_EMOJI[c.rarity] ?? "⬜";
    const rol = ROLE_EMOJI[c.role] ?? "";
    return `\`${String(num).padStart(3," ")}.\` ${rar}${rol} **${c.name}** — *${c.anime}*`;
  });

  const filters = [
    filterRarity ? `Rarity: ${filterRarity}` : null,
    filterRole   ? `Role: ${filterRole}`     : null,
    filterAnime  ? `Anime: ${filterAnime}`   : null,
  ].filter(Boolean);

  return new EmbedBuilder()
    .setTitle("🃏 Card List")
    .setDescription(
      `Browse all ${cards.length} card${cards.length !== 1 ? "s" : ""} in DuckTCG.\n\n` +
      (lines.join("\n") || "*No cards match your filters.*")
    )
    .setColor(0x5B21B6)
    .setFooter({ text: [
      `Page ${page + 1} / ${totalPages} · ${cards.length} card${cards.length !== 1 ? "s" : ""}`,
      filters.length ? `Filter: ${filters.join(", ")}` : null,
    ].filter(Boolean).join(" · ") });
}

function buildCardEmbed(card, totalPrints) {
  const embed = new EmbedBuilder()
    .setTitle(`${RARITY_EMOJI[card.rarity] ?? "⬜"} ${card.name}`)
    .setDescription(`*${card.anime}*`)
    .setColor(RARITY_COLOR[card.rarity] ?? 0x5B21B6)
    .addFields(
      { name: "Rarity",       value: RARITY_LABEL[card.rarity] ?? card.rarity,            inline: true },
      { name: "Role",         value: `${ROLE_EMOJI[card.role] ?? ""} ${card.role.toUpperCase()}`, inline: true },
      { name: "Total Prints", value: `**${totalPrints}** in circulation`,                  inline: true },
      { name: "Base Damage",  value: `**${card.baseStats?.damage ?? 0}**`,                inline: true },
      { name: "Base Mana",    value: `**${card.baseStats?.mana ?? 0}**`,                  inline: true },
      { name: "Base HP",      value: `**${card.baseStats?.hp ?? 0}**`,                   inline: true },
    );
  if (card.imageUrl) embed.setImage(card.imageUrl);
  return embed;
}

function buildNavRow(page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("card_first").setEmoji("⏮").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId("card_prev").setEmoji("◀").setStyle(ButtonStyle.Primary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId("card_next").setEmoji("▶").setStyle(ButtonStyle.Primary).setDisabled(page >= totalPages - 1),
    new ButtonBuilder().setCustomId("card_last").setEmoji("⏭").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
  );
}

function buildFilterRow(filterRarity, filterRole, filterAnime) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("card_open_rarity")
      .setLabel(filterRarity ? `${RARITY_EMOJI[filterRarity]} ${filterRarity}` : "Rarity")
      .setStyle(filterRarity ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("card_open_role")
      .setLabel(filterRole ? `${ROLE_EMOJI[filterRole] ?? ""} ${filterRole}` : "Role")
      .setStyle(filterRole ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("card_open_anime")
      .setLabel(filterAnime ? filterAnime.slice(0, 20) : "Anime")
      .setStyle(filterAnime ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("card_reset")
      .setLabel("✕ Reset")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!filterRarity && !filterRole && !filterAnime),
  );
}

function buildRarityDropdown() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("card_filter_rarity")
      .setPlaceholder("Select rarity of cards")
      .addOptions([
        new StringSelectMenuOptionBuilder().setLabel("All rarities").setDescription("Show all cards").setValue("all").setEmoji("✨"),
        new StringSelectMenuOptionBuilder().setLabel("Exceptional").setDescription("Shows only Exceptional cards").setValue("exceptional").setEmoji("🌟"),
        new StringSelectMenuOptionBuilder().setLabel("Special").setDescription("Shows only Special cards").setValue("special").setEmoji("🟪"),
        new StringSelectMenuOptionBuilder().setLabel("Rare").setDescription("Shows only Rare cards").setValue("rare").setEmoji("🟦"),
        new StringSelectMenuOptionBuilder().setLabel("Common").setDescription("Shows only Common cards").setValue("common").setEmoji("⬜"),
      ])
  );
}

function buildRoleDropdown() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("card_filter_role")
      .setPlaceholder("Select type of cards")
      .addOptions([
        new StringSelectMenuOptionBuilder().setLabel("All roles").setDescription("Show all types").setValue("all"),
        new StringSelectMenuOptionBuilder().setLabel("DPS").setDescription("Shows only Attack type cards").setValue("dps").setEmoji("⚔️"),
        new StringSelectMenuOptionBuilder().setLabel("Support").setDescription("Shows only Support type cards").setValue("support").setEmoji("💚"),
        new StringSelectMenuOptionBuilder().setLabel("Tank").setDescription("Shows only Tank type cards").setValue("tank").setEmoji("🛡️"),
      ])
  );
}

function buildAnimeDropdown(animes, page = 0) {
  const PAGE = 24; // leave 1 slot for "Next"
  const slice = animes.slice(page * PAGE, (page + 1) * PAGE);
  const hasMore = animes.length > (page + 1) * PAGE;

  const options = [];
  if (page > 0) {
    options.push(new StringSelectMenuOptionBuilder().setLabel("← Previous").setDescription("Go back").setValue(`anime_prev_${page}`).setEmoji("⬅️"));
  }
  if (hasMore) {
    options.push(new StringSelectMenuOptionBuilder().setLabel("Next →").setDescription("Check more options").setValue(`anime_next_${page}`).setEmoji("➡️"));
  }
  options.push(new StringSelectMenuOptionBuilder().setLabel("All anime").setDescription("Show all anime").setValue("all").setEmoji("✨"));
  for (const anime of slice) {
    options.push(new StringSelectMenuOptionBuilder()
      .setLabel(anime.slice(0, 100))
      .setDescription(`Show cards only from ${anime}`)
      .setValue(`anime_${anime}`)
    );
  }

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("card_filter_anime")
      .setPlaceholder("Filter collection by")
      .addOptions(options.slice(0, 25))
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("card")
    .setDescription("Browse all available cards in DuckTCG"),

  async execute(interaction) {
    await interaction.deferReply();

    const allCards = await Card.find({ isAvailable: true }).sort({ anime: 1, rarity: 1, name: 1 });
    if (!allCards.length) return interaction.editReply({ content: "No cards available yet." });

    const uniqueAnimes = [...new Set(allCards.map(c => c.anime))].sort();

    // State
    const state = {
      page: 0,
      filterRarity: "",
      filterRole: "",
      filterAnime: "",
      animePage: 0,
      openDropdown: null, // "rarity" | "role" | "anime" | null
      detailCard: null,   // cardId for detail view
    };

    function getFiltered() {
      return allCards.filter(c => {
        if (state.filterRarity && c.rarity !== state.filterRarity) return false;
        if (state.filterRole   && c.role   !== state.filterRole)   return false;
        if (state.filterAnime  && c.anime  !== state.filterAnime)  return false;
        return true;
      });
    }

    async function buildMessage() {
      const filtered = getFiltered();
      const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      state.page = Math.min(state.page, totalPages - 1);

      // Detail view
      if (state.detailCard) {
        const card = allCards.find(c => c.cardId === state.detailCard);
        if (card) {
          const totalPrints = await PlayerCard.countDocuments({ cardId: card.cardId, isBurned: false });
          const embed = buildCardEmbed(card, totalPrints);
          const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("card_back_list").setLabel("← Back to List").setStyle(ButtonStyle.Secondary),
          );
          return { embeds: [embed], components: [backRow] };
        }
      }

      const components = [buildNavRow(state.page, totalPages), buildFilterRow(state.filterRarity, state.filterRole, state.filterAnime)];
      if (state.openDropdown === "rarity") components.push(buildRarityDropdown());
      if (state.openDropdown === "role")   components.push(buildRoleDropdown());
      if (state.openDropdown === "anime")  components.push(buildAnimeDropdown(uniqueAnimes, state.animePage));

      return {
        embeds: [buildListEmbed(filtered, state.page, totalPages, state.filterRarity, state.filterRole, state.filterAnime)],
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

      // Detail back
      if (id === "card_back_list") { state.detailCard = null; }

      // Navigation
      else if (id === "card_first") state.page = 0;
      else if (id === "card_prev")  state.page = Math.max(0, state.page - 1);
      else if (id === "card_next")  { const t = Math.max(1, Math.ceil(getFiltered().length / PAGE_SIZE)); state.page = Math.min(t - 1, state.page + 1); }
      else if (id === "card_last")  { const t = Math.max(1, Math.ceil(getFiltered().length / PAGE_SIZE)); state.page = t - 1; }

      // Filter toggle buttons
      else if (id === "card_open_rarity") { state.openDropdown = state.openDropdown === "rarity" ? null : "rarity"; }
      else if (id === "card_open_role")   { state.openDropdown = state.openDropdown === "role"   ? null : "role"; }
      else if (id === "card_open_anime")  { state.openDropdown = state.openDropdown === "anime"  ? null : "anime"; state.animePage = 0; }
      else if (id === "card_reset")       { state.filterRarity = ""; state.filterRole = ""; state.filterAnime = ""; state.page = 0; state.openDropdown = null; }

      // Dropdowns
      else if (id === "card_filter_rarity") {
        state.filterRarity = i.values[0] === "all" ? "" : i.values[0];
        state.page = 0; state.openDropdown = null;
      }
      else if (id === "card_filter_role") {
        state.filterRole = i.values[0] === "all" ? "" : i.values[0];
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
