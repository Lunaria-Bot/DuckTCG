const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ComponentType, AttachmentBuilder,
} = require("discord.js");
const { requireProfile } = require("../../utils/requireProfile");
const User = require("../../models/User");

const DUCK_COIN = "<:duck_coin:1494344514465431614>";

const CATEGORIES = {
  cp:    { label: "Combat Power", emoji: "⚔️",  field: "combatPower",                  format: v => v.toLocaleString(),  unit: "CP"      },
  gold:  { label: "Duckcoin",     emoji: "🪙",   field: "currency.gold",                format: v => v.toLocaleString(),  unit: "🪙"     },
  level: { label: "Level",        emoji: "✦",   field: "accountLevel",                  format: v => `${v}`,              unit: "Lv."     },
  cards: { label: "Cards",        emoji: "📦",  field: "stats.totalCardsEverObtained",  format: v => v.toLocaleString(),  unit: "cards"   },
};

const MEDALS  = ["🥇", "🥈", "🥉"];
const COLORS  = { cp: 0xE53935, gold: 0xFFD700, level: 0xAB47BC, cards: 0x42A5F5 };
const BAR_COLORS = { cp: "#E53935", gold: "#FFD700", level: "#AB47BC", cards: "#42A5F5" };

function getNestedValue(obj, path) {
  return path.split(".").reduce((o, k) => o?.[k], obj) ?? 0;
}

function buildBar(value, max, color, width = 18) {
  if (max === 0) return "`" + "░".repeat(width) + "`";
  const filled = Math.round((value / max) * width);
  const empty  = width - filled;
  return `\`${"█".repeat(filled)}${"░".repeat(empty)}\``;
}

function buildEmbed(players, category, selfRank, selfUser) {
  const cat   = CATEGORIES[category];
  const color = COLORS[category];

  const maxVal = getNestedValue(players[0], cat.field) || 1;

  // Top 3 with bars
  const top3Lines = players.slice(0, 3).map((p, i) => {
    const val    = getNestedValue(p, cat.field);
    const bar    = buildBar(val, maxVal, BAR_COLORS[category]);
    const medal  = MEDALS[i];
    const isSelf = p.userId === selfUser?.userId;
    const name   = isSelf ? `**${p.username}** ←` : `**${p.username}**`;
    return `${medal} ${name}\n${bar} ${cat.format(val)} ${cat.unit}`;
  }).join("\n\n");

  // Rest of top 10 as table
  const restLines = players.slice(3, 10).map((p, i) => {
    const val    = getNestedValue(p, cat.field);
    const rank   = String(i + 4).padStart(2, " ");
    const isSelf = p.userId === selfUser?.userId;
    const name   = isSelf ? `**${p.username}** ←` : p.username;
    return `\`${rank}.\` ${name} — **${cat.format(val)}** ${cat.unit}`;
  }).join("\n");

  const desc = [top3Lines, restLines ? "\n" + restLines : ""].join("").trim() || "*No players yet.*";

  const embed = new EmbedBuilder()
    .setTitle(`${cat.emoji} Top 10 — ${cat.label}`)
    .setDescription(desc)
    .setColor(color);

  // Self rank footer
  if (selfRank > 10) {
    const selfVal = getNestedValue(selfUser, cat.field);
    embed.setFooter({ text: `Your rank: #${selfRank} — ${cat.format(selfVal)} ${cat.unit}` });
  } else if (selfRank) {
    embed.setFooter({ text: `You are ranked #${selfRank}` });
  }

  return embed;
}

function buildRow(current) {
  return new ActionRowBuilder().addComponents(
    Object.entries(CATEGORIES).map(([key, cat]) =>
      new ButtonBuilder()
        .setCustomId(`lb_${key}`)
        .setLabel(cat.label)
        .setEmoji(cat.emoji)
        .setStyle(current === key ? ButtonStyle.Primary : ButtonStyle.Secondary)
    )
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the server leaderboard"),

  async execute(interaction) {
    await interaction.deferReply();

    const self = await requireProfile(interaction);
    if (!self) return;

    let category = "cp";

    async function getData() {
      const cat     = CATEGORIES[category];
      const players = await User.find().sort({ [cat.field]: -1 }).limit(10).lean();
      const selfVal = getNestedValue(self, cat.field);
      const above   = await User.countDocuments({ [cat.field]: { $gt: selfVal } });
      return { players, selfRank: above + 1 };
    }

    const { players, selfRank } = await getData();

    const msg = await interaction.editReply({
      embeds: [buildEmbed(players, category, selfRank, self)],
      components: [buildRow(category)],
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === interaction.user.id,
      time: 5 * 60 * 1000,
    });

    collector.on("collect", async i => {
      await i.deferUpdate();
      category = i.customId.replace("lb_", "");
      const { players: p, selfRank: sr } = await getData();
      await interaction.editReply({
        embeds: [buildEmbed(p, category, sr, self)],
        components: [buildRow(category)],
      });
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
