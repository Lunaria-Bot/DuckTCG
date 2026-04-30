const { requireProfile } = require("../../utils/requireProfile");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getOrCreateUser } = require("../../utils/getOrCreateUser");
const PlayerCard = require("../../models/PlayerCard");
const Card = require("../../models/Card");
const { calculateTeamCP } = require("../../services/cardStats");

const ROLE_EMOJI = { dps: "⚔️", support: "💚", tank: "🛡️" };

module.exports = {
  data: new SlashCommandBuilder()
    .setName("team")
    .setDescription("Manage your combat team")
    .addSubcommand(sub =>
      sub.setName("view")
        .setDescription("View your current team")
    )
    .addSubcommand(sub =>
      sub.setName("set")
        .setDescription("Place a card in a slot")
        .addIntegerOption(opt =>
          opt.setName("slot").setDescription("Slot 1, 2 or 3").setRequired(true).setMinValue(1).setMaxValue(3)
        )
        .addStringOption(opt =>
          opt.setName("card_id").setDescription("PlayerCard ObjectId").setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("remove")
        .setDescription("Remove a card from a slot")
        .addIntegerOption(opt =>
          opt.setName("slot").setDescription("Slot 1, 2 or 3").setRequired(true).setMinValue(1).setMaxValue(3)
        )
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const user = await requireProfile(interaction);
    if (!user) return;

    const sub = interaction.options.getSubcommand();

    if (sub === "view") return showTeam(interaction, user);

    if (sub === "set") {
      const slot = interaction.options.getInteger("slot");
      const cardObjId = interaction.options.getString("card_id");

      const pc = await PlayerCard.findOne({ _id: cardObjId, userId: interaction.user.id, isBurned: false });
      if (!pc) return interaction.editReply({ content: "Card not found in your inventory." });

      user.team.forEach(t => {
        if (t.playerCardId?.toString() === cardObjId) t.playerCardId = null;
      });

      const slot_ = user.team.find(t => t.slot === slot);
      if (!slot_) return interaction.editReply({ content: "Invalid slot." });

      if (slot_.playerCardId) {
        await PlayerCard.findByIdAndUpdate(slot_.playerCardId, { isInTeam: false });
      }

      slot_.playerCardId = pc._id;
      await PlayerCard.findByIdAndUpdate(pc._id, { isInTeam: true });

      await recalcTeamCP(user);
      await user.save();

      return interaction.editReply({ content: `Card placed in slot ${slot}.` });
    }

    if (sub === "remove") {
      const slot = interaction.options.getInteger("slot");
      const slot_ = user.team.find(t => t.slot === slot);
      if (!slot_ || !slot_.playerCardId) return interaction.editReply({ content: "This slot is already empty." });

      await PlayerCard.findByIdAndUpdate(slot_.playerCardId, { isInTeam: false });
      slot_.playerCardId = null;

      await recalcTeamCP(user);
      await user.save();

      return interaction.editReply({ content: `Slot ${slot} cleared.` });
    }
  },
};

async function showTeam(interaction, user) {
  const embed = new EmbedBuilder()
    .setTitle(`${interaction.user.username}'s Team`)
    .setColor(0xEF5350);

  let totalCP = 0;

  for (const slot of user.team) {
    if (!slot.playerCardId) {
      embed.addFields({ name: `Slot ${slot.slot}`, value: "*Empty*", inline: true });
      continue;
    }

    const pc = await PlayerCard.findById(slot.playerCardId);
    const card = pc ? await Card.findOne({ cardId: pc.cardId }) : null;

    if (!pc || !card) {
      embed.addFields({ name: `Slot ${slot.slot}`, value: "*Card not found*", inline: true });
      continue;
    }

    totalCP += pc.cachedStats.combatPower ?? 0;
    const roleEmoji = ROLE_EMOJI[card.role] ?? "";

    embed.addFields({
      name: `Slot ${slot.slot} — ${roleEmoji} ${card.name}`,
      value: [
        `Lv. **${pc.level}**`,
        `⚔️ ${pc.cachedStats.damage}  💚 ${pc.cachedStats.mana}  🛡️ ${pc.cachedStats.hp}`,
        `PS: **${pc.cachedStats.combatPower}**`,
      ].join("\n"),
      inline: true,
    });
  }

  embed.setFooter({ text: `Total Power Score: ${totalCP.toLocaleString()}` });
  return interaction.editReply({ embeds: [embed] });
}

async function recalcTeamCP(user) {
  const ids = user.team.map(t => t.playerCardId).filter(Boolean);
  const cards = await PlayerCard.find({ _id: { $in: ids } });
  const stats = cards.map(c => c.cachedStats);
  user.combatPower = calculateTeamCP(stats);
}
