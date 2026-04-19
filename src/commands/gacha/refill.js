const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { requireProfile } = require("../../utils/requireProfile");
const User = require("../../models/User");
const {
  qiMax, dantianMax, regenDantian, regenQi,
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
    const currentQi  = regenQi(user);

    if (currentQi >= maxQi) {
      return interaction.editReply({
        content: `<:Qi:1495523502961459200> Your Qi is already full! (**${currentQi}** / ${maxQi})`,
      });
    }

    if (currentDantian < 1) {
      return interaction.editReply({
        content: `<:Dantian:1495528597610303608> Your Dantian is empty! It regenerates passively over 8 hours.`,
      });
    }

    // Transfer Dantian → Qi, always clears cooldown
    const needed     = maxQi - currentQi;
    const transfer   = Math.min(needed, Math.floor(currentDantian));
    const newQi      = currentQi + transfer;
    const newDantian = currentDantian - transfer;

    await User.findOneAndUpdate({ userId: interaction.user.id }, {
      "mana.qi":               newQi,
      "mana.lastQiUpdate":     new Date(),
      "mana.dantian":          Math.floor(newDantian),
      "mana.lastDantianUpdate": new Date(),
      "mana.qiCooldownUntil":  null,
    });

    const embed = new EmbedBuilder()
      .setTitle("<:Qi:1495523502961459200> Qi Refilled")
      .setDescription(`Transferred **${transfer}** energy from your Dantian into your Qi.`)
      .setColor(0x5B21B6)
      .addFields(
        { name: "<:Qi:1495523502961459200> Qi",      value: `**${newQi}** / ${maxQi}`,                        inline: true },
        { name: "<:Dantian:1495528597610303608> Dantian", value: `**${Math.floor(newDantian)}** / ${maxDantian}`,   inline: true },
      )
      .setFooter({ text: "Use /roll to spend your Qi!" });

    return interaction.editReply({ embeds: [embed] });
  },
};
