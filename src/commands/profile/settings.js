const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType,
} = require("discord.js");
const { requireProfile } = require("../../utils/requireProfile");
const User = require("../../models/User");

const SETTINGS = [
  {
    key:   "notifications.qiFull",
    label: "Qi Full Notification",
    desc:  "Receive a DM when your Qi is fully recharged",
    emoji: "<:Qi:1495523502961459200>",
  },
  {
    key:   "notifications.dantianFull",
    label: "Dantian Full Notification",
    desc:  "Receive a DM when your Dantian is fully recharged",
    emoji: "🌀",
  },
  {
    key:   "notifications.questDone",
    label: "Quest Ready Notification",
    desc:  "Receive a DM when a quest is ready to claim",
    emoji: "📋",
  },
];

function getNestedValue(obj, path) {
  return path.split(".").reduce((o, k) => o?.[k], obj) ?? false;
}

function buildEmbed(user) {
  const lines = SETTINGS.map(s => {
    const enabled = getNestedValue(user, s.key);
    return `${s.emoji} **${s.label}**\n${enabled ? "✅ Enabled" : "❌ Disabled"} — *${s.desc}*`;
  });

  return new EmbedBuilder()
    .setTitle(`⚙️ ${user.username}'s Settings`)
    .setDescription(lines.join("\n\n"))
    .setColor(0x5B21B6)
    .setFooter({ text: "Toggle settings with the buttons below" });
}

function buildRow(user) {
  return new ActionRowBuilder().addComponents(
    SETTINGS.map(s => {
      const enabled = getNestedValue(user, s.key);
      return new ButtonBuilder()
        .setCustomId(`setting_${s.key}`)
        .setLabel(s.label)
        .setEmoji(enabled ? "✅" : "❌")
        .setStyle(enabled ? ButtonStyle.Success : ButtonStyle.Secondary);
    })
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Manage your notification and preference settings"),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    let user = await requireProfile(interaction);
    if (!user) return;

    const msg = await interaction.editReply({
      embeds: [buildEmbed(user)],
      components: [buildRow(user)],
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === interaction.user.id,
      time: 5 * 60 * 1000,
    });

    collector.on("collect", async i => {
      await i.deferUpdate();

      const key     = i.customId.replace("setting_", ""); // e.g. "notifications.qiFull"
      const current = getNestedValue(user, key);

      // Toggle in DB
      await User.findOneAndUpdate(
        { userId: interaction.user.id },
        { [key]: !current }
      );

      // Refresh user
      user = await User.findOne({ userId: interaction.user.id });

      await interaction.editReply({
        embeds: [buildEmbed(user)],
        components: [buildRow(user)],
      });
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
