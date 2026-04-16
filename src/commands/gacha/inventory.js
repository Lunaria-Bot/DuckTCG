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

function sortCards(pairs, sortBy) {
  return [...pairs].sort((a, b) => {
    switch (sortBy) {
      case "rarity": return (RARITY_ORDER[a.card.rarity] ?? 9) - (RARITY_ORDER[b.card.rarity] ?? 9);
      case "level":  return b.pc.level - a.pc.level;
      case "print":  return a.pc.printNumber - b.pc.printNumber;
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

// ─── Card embed ───────────────────────────────────────────────────────────────
function buildCardEmbed(pairs, index, username) {
  if (!pairs.length) {
    return new EmbedBuilder()
      .setTitle(`${username}'s Collection`)
      .setDescription("*No cards match your filters.*")
      .setColor(0x5B21B6);
  }

  const { pc, card } = pairs[index];
  const rarEmoji  = RARITY_EMOJI[card.rarity] ?? "⬜";
  const roleEmoji = ROLE_EMOJI[card.role] ?? "";
  const color     = RARITY_COLOR[card.rarity] ?? 0x5B21B6;

  // XP bar for the card level
  const maxLevel  = pc.isAscended ? 125 : 100;
  const lvlPct    = Math.round((pc.level / maxLevel) * 100);
  const lvlFilled = Math.round(lvlPct / 10);
  const lvlBar    = "█".repeat(lvlFilled) + "░".repeat(10 - lvlFilled);

  const embed = new EmbedBuilder()
    .setTitle(`${rarEmoji} ${card.name}`)
    .setColor(color)
    .setDescription(`*${card.anime}*`)
    .addFields(
      { name: "Rarity",         value: RARITY_LABEL[card.rarity] ?? card.rarity, inline: true },
      { name: "Role",           value: `${roleEmoji} ${card.role.toUpperCase()}`, inline: true },
      { name: "Print",          value: `**#${pc.printNumber}**`, inline: true },
      { name: "Level",          value: `**${pc.level}** / ${maxLevel}\n\`[${lvlBar}]\``, inline: true },
      { name: "Combat Power",   value: `**${(pc.cachedStats?.combatPower ?? 0).toLocaleString()}**`, inline: true },
      { name: pc.isAscended ? "✨ Ascended" : "Ascension", value: pc.isAscended ? "Yes" : pc.level >= 100 ? "Available!" : `At level 100`, inline: true },
    )
    .setFooter({ text: `${username}'s Collection · ${index + 1} / ${pairs.length}` });

  if (card.imageUrl) embed.setImage(card.imageUrl);

  return embed;
}

// ─── Rows ─────────────────────────────────────────────────────────────────────
function buildNavRow(index, total) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("inv_first").setEmoji("⏮").setStyle(ButtonStyle.Secondary).setDisabled(index === 0),
    new ButtonBuilder()
      .setCustomId("inv_prev").setEmoji("◀").setStyle(ButtonStyle.Primary).setDisabled(index === 0),
    new ButtonBuilder()
      .setCustomId("inv_next").setEmoji("▶").setStyle(ButtonStyle.Primary).setDisabled(index >= total - 1),
    new ButtonBuilder()
      .setCustomId("inv_last").setEmoji("⏭").setStyle(ButtonStyle.Secondary).setDisabled(index >= total - 1),
  );
}

function buildFilterRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("inv_filter_rarity")
      .setPlaceholder("🌟 Filter by rarity")
      .addOptions([
        new StringSelectMenuOptionBuilder().setLabel("All rarities").setValue("all").setEmoji("✨"),
        new StringSelectMenuOptionBuilder().setLabel("Exceptional").setValue("exceptional").setEmoji("🌟"),
        new StringSelectMenuOptionBuilder().setLabel("Special").setValue("special").setEmoji("🟪"),
        new StringSelectMenuOptionBuilder().setLabel("Rare").setValue("rare").setEmoji("🟦"),
        new StringSelectMenuOptionBuilder().setLabel("Common").setValue("common").setEmoji("⬜"),
      ])
  );
}

function buildSortRoleRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("inv_sort")
      .setPlaceholder("↕️ Sort by...")
      .addOptions([
        new StringSelectMenuOptionBuilder().setLabel("Rarity (best first)").setValue("rarity").setEmoji("🌟"),
        new StringSelectMenuOptionBuilder().setLabel("Level (highest first)").setValue("level").setEmoji("⬆️"),
        new StringSelectMenuOptionBuilder().setLabel("Print (lowest first)").setValue("print").setEmoji("🔢"),
        new StringSelectMenuOptionBuilder().setLabel("Anime (A → Z)").setValue("anime").setEmoji("📚"),
        new StringSelectMenuOptionBuilder().setLabel("Recently obtained").setValue("date").setEmoji("🕐"),
      ])
  );
}

function buildRoleRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("inv_filter_role")
      .setPlaceholder("⚔️ Filter by role")
      .addOptions([
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
    let sortBy       = "rarity";
    let filterRarity = "";
    let filterRole   = "";
    let index        = 0;

    function getVisible() {
      const filtered = filterCards(allPairs, filterRarity, filterRole);
      return sortCards(filtered, sortBy);
    }

    function buildMessage() {
      const pairs = getVisible();
      index = Math.min(index, Math.max(0, pairs.length - 1));
      return {
        embeds: [buildCardEmbed(pairs, index, targetUser.username)],
        components: pairs.length > 0
          ? [buildNavRow(index, pairs.length), buildFilterRow(), buildSortRoleRow(), buildRoleRow()]
          : [],
      };
    }

    const msg = await interaction.editReply(buildMessage());

    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 10 * 60 * 1000,
    });

    collector.on("collect", async i => {
      await i.deferUpdate();

      if      (i.customId === "inv_first") index = 0;
      else if (i.customId === "inv_prev")  index = Math.max(0, index - 1);
      else if (i.customId === "inv_next")  index = Math.min(getVisible().length - 1, index + 1);
      else if (i.customId === "inv_last")  index = getVisible().length - 1;
      else if (i.customId === "inv_filter_rarity") { filterRarity = i.values[0] === "all" ? "" : i.values[0]; index = 0; }
      else if (i.customId === "inv_sort")           { sortBy = i.values[0]; index = 0; }
      else if (i.customId === "inv_filter_role")    { filterRole = i.values[0] === "all" ? "" : i.values[0]; index = 0; }

      await interaction.editReply(buildMessage());
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
