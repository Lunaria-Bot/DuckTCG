const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { requireProfile } = require("../../utils/requireProfile");
const User = require("../../models/User");
const { dantianMax } = require("../../services/mana");

const DANTIAN = "<:Dantian:1495528597610303608>";

const USABLE_ITEMS = {
  pill: {
    name: "Lesser Qi Pill",
    field: "items.lesserQiPill",
    use: async (user) => {
      if ((user.items?.lesserQiPill ?? 0) < 1) return { error: "You don't have any Lesser Qi Pills." };
      const max = dantianMax(user.accountLevel);
      await User.findOneAndUpdate({ userId: user.userId }, {
        $inc: { "items.lesserQiPill": -1 },
        "mana.dantian": max,
        "mana.lastDantianUpdate": new Date(),
      });
      return { msg: `${DANTIAN} **Lesser Qi Pill** used! Your Dantian has been fully restored to **${max}/${max}**.` };
    },
  },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("use")
    .setDescription("Use an item from your inventory")
    .addStringOption(opt =>
      opt.setName("item")
        .setDescription("Item to use")
        .setRequired(true)
        .addChoices(
          { name: "Lesser Qi Pill — Restore Dantian to full", value: "pill" },
        )
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const user = await requireProfile(interaction);
    if (!user) return;

    const itemKey = interaction.options.getString("item");
    const item = USABLE_ITEMS[itemKey];
    if (!item) return interaction.editReply({ content: "Unknown item." });

    const result = await item.use(user);

    if (result.error) {
      return interaction.editReply({ content: `❌ ${result.error}` });
    }

    return interaction.editReply({
      embeds: [new EmbedBuilder().setDescription(result.msg).setColor(0x22c55e)],
    });
  },
};
