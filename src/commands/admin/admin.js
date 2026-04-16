const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const Banner = require("../../models/Banner");
const Raid = require("../../models/Raid");
const User = require("../../models/User");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Bot administration commands")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName("give_currency")
        .setDescription("Give currency to a player")
        .addUserOption(opt => opt.setName("user").setDescription("Target player").setRequired(true))
        .addStringOption(opt =>
          opt.setName("type").setDescription("Currency type").setRequired(true)
            .addChoices(
              { name: "Duckcoin", value: "gold" },
              { name: "Premium", value: "premiumCurrency" },
              { name: "Pick Up Ticket", value: "pickupTickets" },
              { name: "Regular Ticket", value: "regularTickets" },
            )
        )
        .addIntegerOption(opt => opt.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1))
    )
    .addSubcommand(sub =>
      sub.setName("create_banner")
        .setDescription("Create a new banner")
        .addStringOption(opt => opt.setName("id").setDescription("Unique bannerId").setRequired(true))
        .addStringOption(opt => opt.setName("name").setDescription("Banner name").setRequired(true))
        .addStringOption(opt => opt.setName("anime").setDescription("Anime name").setRequired(true))
        .addStringOption(opt =>
          opt.setName("type").setDescription("Banner type").setRequired(true)
            .addChoices(
              { name: "Regular (permanent)", value: "regular" },
              { name: "Pick Up (rotation)", value: "pickup" },
            )
        )
        .addStringOption(opt => opt.setName("ends_at").setDescription("End date ISO (optional, e.g. 2025-03-01)"))
    )
    .addSubcommand(sub =>
      sub.setName("create_raid")
        .setDescription("Create a new raid boss")
        .addStringOption(opt => opt.setName("name").setDescription("Boss name").setRequired(true))
        .addStringOption(opt => opt.setName("anime").setDescription("Anime name").setRequired(true))
        .addIntegerOption(opt => opt.setName("hp").setDescription("Boss HP").setRequired(true).setMinValue(1000))
        .addIntegerOption(opt => opt.setName("duration_hours").setDescription("Duration in hours").setRequired(true).setMinValue(1))
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();

    if (sub === "give_currency") {
      const target = interaction.options.getUser("user");
      const type = interaction.options.getString("type");
      const amount = interaction.options.getInteger("amount");

      const result = await User.findOneAndUpdate(
        { userId: target.id },
        { $inc: { [`currency.${type}`]: amount } },
        { upsert: true, new: true }
      );

      return interaction.editReply({
        content: `+${amount} ${type} given to ${target.username}. New balance: ${result.currency[type]}`,
      });
    }

    if (sub === "create_banner") {
      const bannerId = interaction.options.getString("id");
      const name = interaction.options.getString("name");
      const anime = interaction.options.getString("anime");
      const type = interaction.options.getString("type");
      const endsAtStr = interaction.options.getString("ends_at");
      const endsAt = endsAtStr ? new Date(endsAtStr) : null;

      await Banner.create({
        bannerId,
        name,
        anime,
        type,
        startsAt: new Date(),
        endsAt,
        pool: { common: [], rare: [], special: [], exceptional: [] },
        featuredCards: [],
      });

      return interaction.editReply({ content: `Banner **${name}** (\`${bannerId}\`) created.` });
    }

    if (sub === "create_raid") {
      const name = interaction.options.getString("name");
      const anime = interaction.options.getString("anime");
      const hp = interaction.options.getInteger("hp");
      const hours = interaction.options.getInteger("duration_hours");

      await Raid.updateMany({ status: "active" }, { status: "expired" });

      const raidId = `raid_${Date.now()}`;
      const endsAt = new Date(Date.now() + hours * 60 * 60 * 1000);

      await Raid.create({ raidId, name, anime, maxHp: hp, currentHp: hp, endsAt });

      return interaction.editReply({
        content: `Raid **${name}** created! HP: ${hp.toLocaleString()} — Duration: ${hours}h`,
      });
    }
  },
};
