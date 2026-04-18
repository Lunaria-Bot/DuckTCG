const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { requireProfile } = require("../../utils/requireProfile");
const User = require("../../models/User");
const {
  qiMax, dantianMax, regenDantian,
  isQiReady, qiCooldownRemaining, formatCooldown, DANTIAN_FILL_MS,
} = require("../../services/mana");

function buildBar(current, max, length = 12) {
  const pct    = Math.min(current / max, 1);
  const filled = Math.round(pct * length);
  return `${"█".repeat(filled)}${"░".repeat(length - filled)} **${Math.round(pct * 100)}%**`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mana")
    .setDescription("Check your Qi and Dantian energy levels"),

  async execute(interaction) {
    await interaction.deferReply();

    const user = await requireProfile(interaction);
    if (!user) return;

    const currentDantian = regenDantian(user);
    const maxQi      = qiMax(user.accountLevel);
    const maxDantian = dantianMax(user.accountLevel);
    const currentQi  = user.mana?.qi ?? maxQi;
    const qiReady    = isQiReady(user);
    const cooldownSecs = qiCooldownRemaining(user);

    // Time until Dantian full
    const dantianMissing = maxDantian - currentDantian;
    const regenPerMs     = maxDantian / DANTIAN_FILL_MS;
    const dantianEtaSecs = dantianMissing > 0
      ? Math.ceil(dantianMissing / regenPerMs / 1000)
      : 0;

    const embed = new EmbedBuilder()
      .setTitle(`${user.username}'s Mana`)
      .setColor(0x5B21B6)
      .addFields(
        {
          name: "⚡ Qi (Inner Mana)",
          value: [
            `\`${buildBar(currentQi, maxQi)}\``,
            `**${currentQi}** / ${maxQi}`,
            qiReady
              ? currentQi >= maxQi ? "*Full — ready to roll!*" : "*Ready — use \`/refill\` to restore*"
              : `⏳ Cooldown: **${formatCooldown(cooldownSecs)}**`,
          ].join("\n"),
          inline: false,
        },
        {
          name: "🌀 Dantian (Stored Mana)",
          value: [
            `\`${buildBar(currentDantian, maxDantian)}\``,
            `**${Math.floor(currentDantian)}** / ${maxDantian}`,
            dantianEtaSecs > 0
              ? `Full in: **${formatCooldown(dantianEtaSecs)}**`
              : "*Full*",
          ].join("\n"),
          inline: false,
        },
      )
      .setFooter({ text: `Level ${user.accountLevel} · Qi max scales to Lv25` });

    // Update dantian in DB passively
    await User.findOneAndUpdate({ userId: interaction.user.id }, {
      "mana.dantian":          Math.floor(currentDantian),
      "mana.lastDantianUpdate": new Date(),
    });

    return interaction.editReply({ embeds: [embed] });
  },
};
