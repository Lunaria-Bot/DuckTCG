const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} = require("discord.js");
const { requireProfile }  = require("../../utils/requireProfile");
const Card       = require("../../models/Card");
const PlayerCard = require("../../models/PlayerCard");
const { renderHTML } = require("../../services/renderer");

const PAGE_SIZE  = 8; // cards per page (2 rows × 4)
const CARD_W     = 100;
const CARD_H     = 145;
const COLS       = 4;
const RARITY_COLOR = {
  common:      "#6b7280",
  rare:        "#3b82f6",
  special:     "#a855f7",
  exceptional: "#f59e0b",
};

// ─── HTML renderer ────────────────────────────────────────────────────────────
function buildCollectionHTML(cards, ownedSet, title, subtitle, pageInfo) {
  const cardItems = cards.map(card => {
    const owned = ownedSet.has(card.cardId);
    const color = RARITY_COLOR[card.rarity] ?? "#6b7280";
    const img   = card.imageUrl
      ? `<img src="${card.imageUrl}" style="width:${CARD_W}px;height:${CARD_H}px;object-fit:cover;border-radius:6px;display:block;${owned ? "" : "filter:grayscale(1) brightness(0.35);"}"/>`
      : `<div style="width:${CARD_W}px;height:${CARD_H}px;background:#1a1a2e;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#444;font-size:11px">No image</div>`;

    return `
      <div style="position:relative;width:${CARD_W}px;flex-shrink:0">
        <div style="border-radius:7px;overflow:hidden;border:2px solid ${owned ? color : "#2a2a3a"};box-shadow:${owned ? `0 0 8px ${color}44` : "none"}">
          ${img}
        </div>
        ${owned ? "" : `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#555;font-size:9px;font-weight:700;text-align:center;pointer-events:none;width:90px;word-break:break-word">${card.name}</div>`}
        <div style="margin-top:5px;text-align:center;font-size:9px;font-weight:600;color:${owned ? "#e0e0e0" : "#444"};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:${CARD_W}px">${card.name}</div>
        <div style="text-align:center;font-size:8px;color:${color};font-weight:700;text-transform:uppercase;letter-spacing:.04em">${card.rarity}</div>
      </div>`;
  });

  // Pad to multiple of COLS for clean grid
  while (cardItems.length % COLS !== 0 && cardItems.length < PAGE_SIZE) {
    cardItems.push(`<div style="width:${CARD_W}px;flex-shrink:0"></div>`);
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0d0d14;
    font-family: 'Outfit', system-ui, sans-serif;
    padding: 16px;
    width: ${COLS * (CARD_W + 14) + 32}px;
  }
</style>
</head>
<body>
  <!-- Header -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #1e1e2e">
    <div>
      <div style="font-size:14px;font-weight:700;color:#e0e0f0">📖 ${title}</div>
      <div style="font-size:10px;color:#6b6b8a;margin-top:2px">${subtitle}</div>
    </div>
    <div style="font-size:10px;color:#6b6b8a;text-align:right">
      Page ${pageInfo.current} / ${pageInfo.total}<br/>
      <span style="color:#a78bfa">${pageInfo.ownedInGroup} / ${pageInfo.totalInGroup} owned</span>
    </div>
  </div>

  <!-- Card grid -->
  <div style="display:flex;flex-wrap:wrap;gap:14px;justify-content:flex-start">
    ${cardItems.join("")}
  </div>
</body>
</html>`;
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
function buildBar(owned, total, len = 12) {
  if (total === 0) return "`░".repeat(len) + "`";
  const filled = Math.round((owned / total) * len);
  return `\`${"█".repeat(filled)}${"░".repeat(len - filled)}\``;
}

// ─── Command ──────────────────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName("collection")
    .setDescription("View your card collection album")
    .addStringOption(opt =>
      opt.setName("sort")
        .setDescription("Sort by anime or rarity")
        .addChoices(
          { name: "By Anime", value: "anime" },
          { name: "By Rarity", value: "rarity" },
        )
    )
    .addStringOption(opt => opt.setName("anime").setDescription("Filter by anime name (partial match)"))
    .addStringOption(opt =>
      opt.setName("rarity")
        .setDescription("Filter by rarity")
        .addChoices(
          { name: "Common",      value: "common" },
          { name: "Rare",        value: "rare" },
          { name: "Special",     value: "special" },
          { name: "Exceptional", value: "exceptional" },
        )
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const user = await requireProfile(interaction);
    if (!user) return;

    const sortMode    = interaction.options.getString("sort")   ?? "anime";
    const animeFilter = interaction.options.getString("anime");
    const rarityFilter = interaction.options.getString("rarity");

    // Fetch all cards + owned cards
    const cardQuery = {};
    if (animeFilter) cardQuery.anime = { $regex: animeFilter, $options: "i" };
    if (rarityFilter) cardQuery.rarity = rarityFilter;

    const [allCards, ownedPCs] = await Promise.all([
      Card.find(cardQuery).sort(
        sortMode === "rarity"
          ? { rarity: 1, anime: 1, name: 1 }
          : { anime: 1, rarity: 1, name: 1 }
      ),
      PlayerCard.find({ userId: interaction.user.id }),
    ]);

    if (!allCards.length) {
      return interaction.editReply({ content: "No cards found with those filters." });
    }

    const ownedSet = new Set(ownedPCs.map(pc => pc.cardId));
    const totalOwned = allCards.filter(c => ownedSet.has(c.cardId)).length;
    const totalCards = allCards.length;

    // Build pages: by anime = one page per anime, by rarity = PAGE_SIZE per page
    let pages; // array of { cards, label }
    if (sortMode === "anime") {
      const animeMap = new Map();
      for (const card of allCards) {
        if (!animeMap.has(card.anime)) animeMap.set(card.anime, []);
        animeMap.get(card.anime).push(card);
      }
      pages = [...animeMap.entries()].map(([anime, cards]) => ({ cards, label: anime }));
    } else {
      pages = [];
      for (let i = 0; i < allCards.length; i += PAGE_SIZE) {
        const slice = allCards.slice(i, i + PAGE_SIZE);
        const rarities = [...new Set(slice.map(c => c.rarity))];
        pages.push({ cards: slice, label: rarities.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(", ") });
      }
    }

    const totalPages = pages.length;
    let page = 0;

    async function renderPage(pg) {
      const { cards: slice, label: groupLabel } = pages[pg];
      const ownedInSlice = slice.filter(c => ownedSet.has(c.cardId)).length;

      const filterLabel = [
        animeFilter ? `anime: ${animeFilter}` : null,
        rarityFilter ? rarityFilter : null,
      ].filter(Boolean).join(" · ") || "All Cards";

      const html = buildCollectionHTML(
        slice,
        ownedSet,
        `${interaction.user.username}'s Collection`,
        `${groupLabel} · ${filterLabel}`,
        {
          current: pg + 1,
          total: totalPages,
          ownedInGroup: ownedInSlice,
          totalInGroup: slice.length,
        }
      );

      return renderHTML(html, { width: COLS * (CARD_W + 14) + 32, height: 600 });
    }

    // Build initial image
    const imgBuf = await renderPage(page);

    const bar = buildBar(totalOwned, totalCards);
    const pct = Math.round((totalOwned / totalCards) * 100);

    const embed = new EmbedBuilder()
      .setTitle(`📖 ${interaction.user.username}'s Collection`)
      .setDescription(`${bar}  **${totalOwned} / ${totalCards}** *(${pct}%)*`)
      .setColor(0x7C3AED)
      .setImage("attachment://collection.png")
      .setFooter({ text: `Page ${page + 1} / ${totalPages} · Sort: ${sortMode}${animeFilter ? ` · ${animeFilter}` : ""}${rarityFilter ? ` · ${rarityFilter}` : ""}` });

    function buildButtons(pg) {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("col_first").setEmoji("⏮").setStyle(ButtonStyle.Secondary).setDisabled(pg === 0),
        new ButtonBuilder().setCustomId("col_prev").setEmoji("◀").setStyle(ButtonStyle.Secondary).setDisabled(pg === 0),
        new ButtonBuilder().setCustomId("col_page").setLabel(`${pg + 1} / ${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId("col_next").setEmoji("▶").setStyle(ButtonStyle.Primary).setDisabled(pg >= totalPages - 1),
        new ButtonBuilder().setCustomId("col_last").setEmoji("⏭").setStyle(ButtonStyle.Primary).setDisabled(pg >= totalPages - 1),
      );
    }

    const msg = await interaction.editReply({
      embeds: [embed],
      files: [{ attachment: imgBuf, name: "collection.png" }],
      components: [buildButtons(page)],
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === interaction.user.id,
      time: 5 * 60 * 1000,
    });

    collector.on("collect", async i => {
      await i.deferUpdate();

      if (i.customId === "col_first") page = 0;
      else if (i.customId === "col_prev")  page = Math.max(0, page - 1);
      else if (i.customId === "col_next")  page = Math.min(totalPages - 1, page + 1);
      else if (i.customId === "col_last")  page = totalPages - 1;

      const newBuf = await renderPage(page);
      embed
        .setImage("attachment://collection.png")
        .setFooter({ text: `Page ${page + 1} / ${totalPages} · Sort: ${sortMode}${animeFilter ? ` · ${animeFilter}` : ""}${rarityFilter ? ` · ${rarityFilter}` : ""}` });

      await interaction.editReply({
        embeds: [embed],
        files: [{ attachment: newBuf, name: "collection.png" }],
        components: [buildButtons(page)],
      });
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
