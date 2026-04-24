const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType,
} = require("discord.js");
const { requireProfile } = require("../../utils/requireProfile");
const User = require("../../models/User");

const NYAN   = "<:Nyan:1495048966528831508>";
const JADE   = "<:Jade:1496624534139179009>";
const EXP    = "<:exp:1495018483233067078>";

const CATEGORIES = {
  cp:    { label: "Power Score", icon: "⚔",  field: "combatPower",                  format: v => v.toLocaleString(),  unit: "PS",     color: 0xE53935 },
  gold:  { label: "Nyang",        icon: NYAN,  field: "currency.gold",                format: v => v.toLocaleString(),  unit: "Nyang",  color: 0xf59e0b },
  level: { label: "Level",        icon: EXP,   field: "accountLevel",                  format: v => `Lv. ${v}`,         unit: "",       color: 0x8b5cf6 },
  cards: { label: "Cards",        icon: "📦",  field: "stats.totalCardsEverObtained",  format: v => v.toLocaleString(),  unit: "cards",  color: 0x3b82f6 },
};

const RANK_ICONS = ["🥇", "🥈", "🥉"];

function getVal(obj, path) {
  return path.split(".").reduce((o, k) => o?.[k], obj) ?? 0;
}

function buildEmbed(players, category, selfRank, self) {
  const cat  = CATEGORIES[category];
  const lines = players.map((p, i) => {
    const val    = getVal(p, cat.field);
    const isSelf = p.userId === self?.userId;
    const rank   = i < 3 ? RANK_ICONS[i] : `\`${String(i + 1).padStart(2)}.\``;
    const name  = isSelf ? `**${p.username}** ◀` : p.username;
    const value = cat.format(val);
    return `${rank} ${name} — **${value}** ${cat.unit}`;
  });

  const desc = lines.join("\n") || "*No players yet.*";

  const embed = new EmbedBuilder()
    .setTitle(`${category === "gold" ? "🪙" : category === "level" ? "✨" : CATEGORIES[category].icon} Leaderboard — ${cat.label}`)
    .setDescription(desc)
    .setColor(cat.color);

  if (selfRank > 10) {
    const selfVal = getVal(self, cat.field);
    embed.setFooter({ text: `Your rank: #${selfRank} · ${cat.format(selfVal)} ${cat.unit}` });
  } else {
    embed.setFooter({ text: `Your rank: #${selfRank}` });
  }

  return embed;
}

function buildRow(current) {
  return new ActionRowBuilder().addComponents(
    Object.entries(CATEGORIES).map(([key, cat]) =>
      new ButtonBuilder()
        .setCustomId(`lb_${key}`)
        .setLabel(cat.label)
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

    let category = "ps";

    async function getData() {
      const cat     = CATEGORIES[category];
      const players = await User.find().sort({ [cat.field]: -1 }).limit(10).lean();
      const selfVal = getVal(self, cat.field);
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
