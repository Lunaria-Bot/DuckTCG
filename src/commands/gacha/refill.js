const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { requireProfile } = require("../../utils/requireProfile");
const User = require("../../models/User");
const {
  qiMax, dantianMax, regenDantian,
  qiCooldownRemaining, formatCooldown,
} = require("../../services/mana");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("refill")
    .setDescription("Transfer Dantian energy into your Qi"),

  async execute(interaction) {
    await interaction.deferReply();

    const user = await requireProfile(interaction);
    if (!user) return;

    const currentDantian = regenDantian(user);
    const maxQi      = qiMax(user.accountLevel);
    const maxDantian = dantianMax(user.accountLevel);
    const currentQi  = user.mana?.qi ?? maxQi;
    const cooldownSecs = qiCooldownRemaining(user);

    if (currentQi >= maxQi) {
      return interaction.editReply({
        content: `⚡ Your Qi is already full! (**${currentQi}** / ${maxQi})`,
      });
    }

    if (currentDantian < 1) {
      return interaction.editReply({
        content: `🌀 Your Dantian is empty! It regenerates passively over 8 hours.`,
      });
    }

    // Transfer: fill Qi to max OR use all available Dantian
    const needed     = maxQi - currentQi;
    const transfer   = Math.min(needed, Math.floor(currentDantian));
    const newQi      = currentQi + transfer;
    const newDantian = currentDantian - transfer;

    const update = {
      "mana.qi":               newQi,
      "mana.dantian":          Math.floor(newDantian),
      "mana.lastDantianUpdate": new Date(),
    };
    // Only clear cooldown if it's over (Qi recharges first, then we can refill)
    if (cooldownSecs <= 0) {
      update["mana.qiCooldownUntil"] = null;
    }

    await User.findOneAndUpdate({ userId: interaction.user.id }, update);

    const embed = new EmbedBuilder()
      .setTitle("⚡ Qi Refilled")
      .setDescription(`Transferred **${transfer}** energy from your Dantian into your Qi.`)
      .setColor(0x5B21B6)
      .addFields(
        { name: "⚡ Qi",      value: `**${newQi}** / ${maxQi}`,               inline: true },
        { name: "🌀 Dantian", value: `**${Math.floor(newDantian)}** / ${maxDantian}`, inline: true },
      );

    if (cooldownSecs > 0) {
      embed.setFooter({ text: `⏳ Qi still recharging — ${formatCooldown(cooldownSecs)} remaining. Refill queued from Dantian.` });
    } else {
      embed.setFooter({ text: "Use /roll to spend your Qi!" });
    }

    return interaction.editReply({ embeds: [embed] });
  },
};
