const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ComponentType,
} = require("discord.js");
const { requireProfile } = require("../../utils/requireProfile");
const User = require("../../models/User");

const DUCK_COIN = "<:duck_coin:1494344514465431614>";

const CATEGORIES = {
  cp:     { label: "Combat Power", emoji: "⚔️",  field: "combatPower",              format: v => v.toLocaleString() },
  gold:   { label: "Duckcoin",     emoji: DUCK_COIN, field: "currency.gold",         format: v => v.toLocaleString() },
  pulls:  { label: "Total Pulls",  emoji: "🎰",  field: "stats.totalPullsDone",      format: v => v.toLocaleString() },
  level:  { label: "Level",        emoji: "✦",   field: "accountLevel",              format: v => `Lv.${v}` },
  cards:  { label: "Cards",        emoji: "📦",  field: "stats.totalCardsEverObtained", format: v => v.toLocaleString() },
  streak: { label: "Streak",       emoji: "🔥",  field: "loginStreak",               format: v => `${v}d` },
};

const MEDALS = ["🥇", "🥈", "🥉"];

function buildEmbed(players, category, selfRank, selfUser) {
  const cat = CATEGORIES[category];

  const lines = players.map((p, i) => {
    const medal = MEDALS[i] ?? `\`${String(i + 1).padStart(2, " ")}.\``;
    const val = cat.format(getNestedValue(p, cat.field) ?? 0);
    const isSelf = p.userId === selfUser?.userId;
    const name = isSelf ? `**${p.username}** ←` : p.username;
    return `${medal} ${name} — ${cat.emoji} ${val}`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`${cat.emoji} Leaderboard — ${cat.label}`)
    .setDescription(lines.join("\n") || "*No players yet.*")
    .setColor(0x5B21B6);

  if (selfRank && selfRank > 10) {
    const val = cat.format(getNestedValue(selfUser, cat.field) ?? 0);
    embed.setFooter({ text: `Your rank: #${selfRank} — ${cat.emoji} ${val}` });
  } else if (selfRank) {
    embed.setFooter({ text: `You are ranked #${selfRank}` });
  }

  return embed;
}

function getNestedValue(obj, path) {
  return path.split(".").reduce((o, k) => o?.[k], obj);
}

function buildCatRow(current) {
  const entries = Object.entries(CATEGORIES);
  const row1 = new ActionRowBuilder().addComponents(
    entries.slice(0, 3).map(([key, cat]) =>
      new ButtonBuilder()
        .setCustomId(`lb_${key}`)
        .setLabel(cat.label)
        .setStyle(current === key ? ButtonStyle.Primary : ButtonStyle.Secondary)
    )
  );
  const row2 = new ActionRowBuilder().addComponents(
    entries.slice(3).map(([key, cat]) =>
      new ButtonBuilder()
        .setCustomId(`lb_${key}`)
        .setLabel(cat.label)
        .setStyle(current === key ? ButtonStyle.Primary : ButtonStyle.Secondary)
    )
  );
  return [row1, row2];
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
      const cat = CATEGORIES[category];
      const players = await User.find()
        .sort({ [cat.field]: -1 })
        .limit(10)
        .lean();

      // Get self rank
      const selfVal = getNestedValue(self, cat.field) ?? 0;
      const selfRankCount = await User.countDocuments({ [cat.field]: { $gt: selfVal } });
      const selfRank = selfRankCount + 1;

      return { players, selfRank };
    }

    const { players, selfRank } = await getData();

    const msg = await interaction.editReply({
      embeds: [buildEmbed(players, category, selfRank, self)],
      components: buildCatRow(category),
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
        components: buildCatRow(category),
      });
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
