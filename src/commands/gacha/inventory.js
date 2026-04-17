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

const RARITY_ORDER = { exceptional: 0, special: 1, rare: 2, common: 3 };
const RARITY_EMOJI = { exceptional: "🌟", special: "🟪", rare: "🟦", common: "⬜" };
const RARITY_LABEL = { exceptional: "Exceptional ✦✦✦", special: "Special ✦✦", rare: "Rare ✦", common: "Common" };
const RARITY_COLOR = { exceptional: 0xFFD700, special: 0xAB47BC, rare: 0x42A5F5, common: 0x78909C };
const ROLE_EMOJI   = { dps: "⚔️", support: "💚", tank: "🛡️" };
const PAGE_SIZE    = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

// ─── LIST embed ───────────────────────────────────────────────────────────────
function buildListEmbed(pairs, page, username, sortBy, filterRarity, filterRole) {
  const totalPages = Math.max(1, Math.ceil(pairs.length / PAGE_SIZE));
  const slice = pairs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const lines = slice.map(({ pc, card }, i) => {
    const num = page * PAGE_SIZE + i + 1;
    const rar = RARITY_EMOJI[card.rarity] ?? "⬜";
    const rol = ROLE_EMOJI[card.role] ?? "";
    return `\`${String(num).padStart(3," ")}.\` ${rar}${rol} **${card.name}** — Lv.**${pc.level}**`;
  });

  const activeFilters = [
    filterRarity ? filterRarity : null,
    filterRole   ? filterRole   : null,
  ].filter(Boolean);

  const sortLabel = { rarity:"Rarity", level:"Level", anime:"Anime", date:"Recent" }[sortBy] ?? sortBy;

  const footerParts = [
    `Page ${page + 1}/${totalPages} · ${pairs.length} card${pairs.length !== 1 ? "s" : ""}`,
    `Sort: ${sortLabel}`,
    activeFilters.length ? `Filter: ${activeFilters.join(", ")}` : null,
  ].filter(Boolean);

  return new EmbedBuilder()
    .setTitle(`${username}'s Collection`)
    .setDescription(lines.join("\n") || "*No cards match your filters.*")
    .setColor(0x5B21B6)
    .setFooter({ text: footerParts.join(" · ") });
}

// ─── CARD embed ───────────────────────────────────────────────────────────────
function buildCardEmbed(pairs, index, username) {
  if (!pairs.length) {
    return new EmbedBuilder()
      .setTitle(`${username}'s Collection`)
      .setDescription("*No cards match your filters.*")
      .setColor(0x5B21B6);
  }

  const { pc, card } = pairs[index];
  const maxLevel  = pc.isAscended ? 125 : 100;
  const lvlFilled = Math.round((pc.level / maxLevel) * 10);
  const lvlBar    = "█".repeat(lvlFilled) + "░".repeat(10 - lvlFilled);

  const embed = new EmbedBuilder()
    .setTitle(`${RARITY_EMOJI[card.rarity] ?? "⬜"} ${card.name}`)
    .setDescription(`*${card.anime}*`)
    .setColor(RARITY_COLOR[card.rarity] ?? 0x5B21B6)
    .addFields(
      { name: "Rarity",       value: RARITY_LABEL[card.rarity] ?? card.rarity,          inline: true },
      { name: "Role",         value: `${ROLE_EMOJI[card.role] ?? ""} ${card.role.toUpperCase()}`, inline: true },
      { name: "Level",        value: `**${pc.level}** / ${maxLevel}\n\`[${lvlBar}]\``,  inline: true },
      { name: "Combat Power", value: `**${(pc.cachedStats?.combatPower ?? 0).toLocaleString()}**`, inline: true },
      { name: pc.isAscended ? "✨ Ascended" : "Ascension",
        value: pc.isAscended ? "Yes" : pc.level >= 100 ? "Available!" : `At level 100`, inline: true },
    )
    .setFooter({ text: `${username}'s Collection · ${index + 1} / ${pairs.length}` });

  if (card.imageUrl) embed.setImage(card.imageUrl);
  return embed;
}

// ─── Rows ─────────────────────────────────────────────────────────────────────

// Row 1 — Navigation + view toggle
function buildNavRow(index, total, view, page, totalPages) {
  const isCard = view === "card";
  const cur    = isCard ? index : page;
  const last   = isCard ? total - 1 : totalPages - 1;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("inv_first").setEmoji("⏮").setStyle(ButtonStyle.Secondary).setDisabled(cur === 0),
    new ButtonBuilder().setCustomId("inv_prev").setEmoji("◀").setStyle(ButtonStyle.Primary).setDisabled(cur === 0),
    new ButtonBuilder().setCustomId("inv_next").setEmoji("▶").setStyle(ButtonStyle.Primary).setDisabled(cur >= last),
    new ButtonBuilder().setCustomId("inv_last").setEmoji("⏭").setStyle(ButtonStyle.Secondary).setDisabled(cur >= last),
    new ButtonBuilder()
      .setCustomId("inv_toggle_view")
      .setLabel(isCard ? "📋 List" : "🖼️ Card")
      .setStyle(ButtonStyle.Success),
  );
}

// Row 2 — Filter + Sort buttons (open dropdown)
function buildControlRow(activeSort, activeRarity, activeRole) {
  const sortLabel    = { rarity:"Rarity ↕", level:"Level ↕", anime:"Anime ↕", date:"Recent ↕" }[activeSort] ?? "Sort ↕";
  const rarityLabel  = activeRarity ? `${RARITY_EMOJI[activeRarity]} ${activeRarity}` : "Rarity";
  const roleLabel    = activeRole   ? `${ROLE_EMOJI[activeRole] ?? ""} ${activeRole}`  : "Role";

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("inv_open_sort")
      .setLabel(sortLabel)
      .setStyle(activeSort !== "rarity" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("inv_open_rarity")
      .setLabel(rarityLabel)
      .setStyle(activeRarity ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("inv_open_role")
      .setLabel(roleLabel)
      .setStyle(activeRole ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("inv_reset_filters")
      .setLabel("✕ Reset")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!activeRarity && !activeRole && activeSort === "rarity"),
  );
}

// Sort dropdown
function buildSortDropdown() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("inv_sort")
      .setPlaceholder("Sort by...")
      .addOptions([
        new StringSelectMenuOptionBuilder().setLabel("Rarity (best first)").setValue("rarity").setEmoji("🌟"),
        new StringSelectMenuOptionBuilder().setLabel("Level (highest first)").setValue("level").setEmoji("⬆️"),
        new StringSelectMenuOptionBuilder().setLabel("Anime (A → Z)").setValue("anime").setEmoji("📚"),
        new StringSelectMenuOptionBuilder().setLabel("Recently obtained").setValue("date").setEmoji("🕐"),
      ])
  );
}

// Rarity dropdown
function buildRarityDropdown() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("inv_filter_rarity")
      .setPlaceholder("Filter by rarity...")
      .addOptions([
        new StringSelectMenuOptionBuilder().setLabel("All rarities").setValue("all").setEmoji("✨"),
        new StringSelectMenuOptionBuilder().setLabel("Exceptional").setValue("exceptional").setEmoji("🌟"),
        new StringSelectMenuOptionBuilder().setLabel("Special").setValue("special").setEmoji("🟪"),
        new StringSelectMenuOptionBuilder().setLabel("Rare").setValue("rare").setEmoji("🟦"),
        new StringSelectMenuOptionBuilder().setLabel("Common").setValue("common").setEmoji("⬜"),
      ])
  );
}

// Role dropdown
function buildRoleDropdown() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("inv_filter_role")
      .setPlaceholder("Filter by role...")
      .addOptions([
        new StringSelectMenuOptionBuilder().setLabel("All roles").setValue("all"),
        new StringSelectMenuOptionBuilder().setLabel("DPS").setValue("dps").setEmoji("⚔️"),
        new StringSelectMenuOptionBuilder().setLabel("Support").setValue("support").setEmoji("💚"),
        new StringSelectMenuOptionBuilder().setLabel("Tank").setValue("tank").setEmoji("🛡️"),
      ])
  );
}

// ─── Message builder ──────────────────────────────────────────────────────────
function buildMessage(state, pairs) {
  const { view, page, cardIndex, sortBy, filterRarity, filterRole, openDropdown } = state;
  const totalPages = Math.max(1, Math.ceil(pairs.length / PAGE_SIZE));

  const embed = view === "card"
    ? buildCardEmbed(pairs, cardIndex, state.username)
    : buildListEmbed(pairs, page, state.username, sortBy, filterRarity, filterRole);

  const rows = [
    buildNavRow(cardIndex, pairs.length, view, page, totalPages),
    buildControlRow(sortBy, filterRarity, filterRole),
  ];

  // Show active dropdown if one is open
  if (openDropdown === "sort")   rows.push(buildSortDropdown());
  if (openDropdown === "rarity") rows.push(buildRarityDropdown());
  if (openDropdown === "role")   rows.push(buildRoleDropdown());

  return { embeds: [embed], components: rows };
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
    if (targetUser.id !== interaction.user.id) {
      const tp = await User.findOne({ userId: targetUser.id });
      if (!tp) return interaction.editReply({ content: `**${targetUser.username}** doesn't have a profile yet.` });
    }

    const playerCards = await PlayerCard.find({ userId: targetUser.id, isBurned: false }).sort({ createdAt: -1 });
    if (!playerCards.length) return interaction.editReply({ content: `${targetUser.username} has no cards yet.` });

    const cardIds = [...new Set(playerCards.map(pc => pc.cardId))];
    const cards   = await Card.find({ cardId: { $in: cardIds } });
    const cardMap = Object.fromEntries(cards.map(c => [c.cardId, c]));

    const allPairs = playerCards
      .filter(pc => cardMap[pc.cardId])
      .map(pc => ({ pc, card: cardMap[pc.cardId] }));

    // State
    const state = {
      username:     targetUser.username,
      view:         "list",   // "list" | "card"
      page:         0,        // list page
      cardIndex:    0,        // card view index
      sortBy:       "rarity",
      filterRarity: "",
      filterRole:   "",
      openDropdown: null,     // "sort" | "rarity" | "role" | null
    };

    function getVisible() {
      return sortCards(filterCards(allPairs, state.filterRarity, state.filterRole), state.sortBy);
    }

    const msg = await interaction.editReply(buildMessage(state, getVisible()));

    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 10 * 60 * 1000,
    });

    collector.on("collect", async i => {
      await i.deferUpdate();
      const id = i.customId;

      const pairs = getVisible();
      const totalPages = Math.max(1, Math.ceil(pairs.length / PAGE_SIZE));

      // Navigation
      if (id === "inv_first") {
        if (state.view === "card") state.cardIndex = 0;
        else state.page = 0;
      } else if (id === "inv_prev") {
        if (state.view === "card") state.cardIndex = Math.max(0, state.cardIndex - 1);
        else state.page = Math.max(0, state.page - 1);
      } else if (id === "inv_next") {
        if (state.view === "card") state.cardIndex = Math.min(pairs.length - 1, state.cardIndex + 1);
        else state.page = Math.min(totalPages - 1, state.page + 1);
      } else if (id === "inv_last") {
        if (state.view === "card") state.cardIndex = pairs.length - 1;
        else state.page = totalPages - 1;
      }

      // View toggle
      else if (id === "inv_toggle_view") {
        if (state.view === "list") {
          // Switch to card — jump to same approximate position
          state.cardIndex = state.page * PAGE_SIZE;
          state.view = "card";
        } else {
          // Switch to list — go to page containing current card
          state.page = Math.floor(state.cardIndex / PAGE_SIZE);
          state.view = "list";
        }
        state.openDropdown = null;
      }

      // Dropdown toggle buttons
      else if (id === "inv_open_sort") {
        state.openDropdown = state.openDropdown === "sort" ? null : "sort";
      } else if (id === "inv_open_rarity") {
        state.openDropdown = state.openDropdown === "rarity" ? null : "rarity";
      } else if (id === "inv_open_role") {
        state.openDropdown = state.openDropdown === "role" ? null : "role";
      }

      // Reset
      else if (id === "inv_reset_filters") {
        state.sortBy = "rarity";
        state.filterRarity = "";
        state.filterRole = "";
        state.page = 0;
        state.cardIndex = 0;
        state.openDropdown = null;
      }

      // Dropdowns
      else if (id === "inv_sort") {
        state.sortBy = i.values[0];
        state.page = 0; state.cardIndex = 0;
        state.openDropdown = null;
      } else if (id === "inv_filter_rarity") {
        state.filterRarity = i.values[0] === "all" ? "" : i.values[0];
        state.page = 0; state.cardIndex = 0;
        state.openDropdown = null;
      } else if (id === "inv_filter_role") {
        state.filterRole = i.values[0] === "all" ? "" : i.values[0];
        state.page = 0; state.cardIndex = 0;
        state.openDropdown = null;
      }

      // Clamp indices after filter change
      const newPairs = getVisible();
      state.cardIndex = Math.min(state.cardIndex, Math.max(0, newPairs.length - 1));
      const newTotalPages = Math.max(1, Math.ceil(newPairs.length / PAGE_SIZE));
      state.page = Math.min(state.page, newTotalPages - 1);

      await interaction.editReply(buildMessage(state, newPairs));
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
