const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType,
} = require("discord.js");

const NYAN   = "<:Nyan:1495048966528831508>";
const JADE   = "<:Jade:1495038405866688703>";
const QI     = "<:Qi:1495523502961459200>";
const DANTIAN = "<:Dantian:1495528597610303608>";
const PERMA  = "<:perma_ticket:1494344593863344258>";
const PICKUP = "<:pickup_ticket:1494344547046523091>";

const CATEGORIES = [
  {
    id: "gacha",
    label: "🎲 Gacha",
    color: 0x8b5cf6,
    commands: [
      { name: "/roll",       desc: `Roll for cards using your ${QI} Qi. Up to 5 per command.` },
      { name: "/refill",     desc: `Transfer ${DANTIAN} Dantian energy into your ${QI} Qi instantly.` },
      { name: "/dantian",    desc: `View your current ${QI} Qi and ${DANTIAN} Dantian status.` },
      { name: "/banners",    desc: `Pull from special limited banners using ${PERMA} or ${PICKUP} tickets.` },
      { name: "/burn",       desc: "Burn duplicate cards to earn Nyang." },
      { name: "/inventory",  desc: "Browse your card collection, sort and filter by rarity or role." },
      { name: "/collection", desc: "Visual album of all cards — owned in color, missing grayed out." },
      { name: "/card",       desc: "Browse all available cards with filters for rarity, role and series." },
      { name: "/trade",      desc: "Start a trade session with another player." },
    ],
  },
  {
    id: "profile",
    label: "👤 Profile",
    color: 0x6d28d9,
    commands: [
      { name: "/register",     desc: "Create your SeorinTCG profile to get started." },
      { name: "/profile",      desc: "View your profile — level, stats, favorite card and badges." },
      { name: "/editprofile",  desc: "Edit your bio, guild or favorite card." },
      { name: "/daily",        desc: `Claim your daily reward. ${NYAN} Nyang, tickets and more on a 28-day cycle.` },
      { name: "/quests",       desc: "View and claim your daily and weekly quests." },
      { name: "/bank",         desc: `Check your wallet — ${NYAN} Nyang, ${JADE} Jade, tickets and more.` },
      { name: "/achievements", desc: "View your earned badges and achievements." },
      { name: "/leaderboard",  desc: "Top 10 players by Combat Power, Nyang, Level or Cards." },
      { name: "/settings",     desc: "Toggle DM notifications for Qi full, Dantian full and quests." },
    ],
  },
  {
    id: "combat",
    label: "⚔ Combat",
    color: 0xef4444,
    commands: [
      { name: "/adventure", desc: "Send your team on a 6-hour adventure to earn Nyang and card XP." },
      { name: "/raid",      desc: "Attack a raid boss with your team for rewards." },
      { name: "/team",      desc: "Manage your 3-card combat team." },
    ],
  },
];

function buildEmbed(catIndex) {
  const cat = CATEGORIES[catIndex];
  const lines = cat.commands.map(c => `\`${c.name}\`\n${c.desc}`);
  return new EmbedBuilder()
    .setTitle(`${cat.label}`)
    .setDescription(lines.join("\n\n"))
    .setColor(cat.color)
    .setFooter({ text: `Category ${catIndex + 1} / ${CATEGORIES.length}  ·  SeorinTCG Help` });
}

function buildRow(catIndex) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("help_prev")
      .setEmoji("◀")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(catIndex === 0),
    ...CATEGORIES.map((cat, i) =>
      new ButtonBuilder()
        .setCustomId(`help_cat_${i}`)
        .setLabel(cat.label)
        .setStyle(catIndex === i ? ButtonStyle.Primary : ButtonStyle.Secondary)
    ),
    new ButtonBuilder()
      .setCustomId("help_next")
      .setEmoji("▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(catIndex === CATEGORIES.length - 1),
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Browse all SeorinTCG commands"),

  async execute(interaction) {
    await interaction.deferReply();

    let catIndex = 0;

    const msg = await interaction.editReply({
      embeds: [buildEmbed(catIndex)],
      components: [buildRow(catIndex)],
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === interaction.user.id,
      time: 5 * 60 * 1000,
    });

    collector.on("collect", async i => {
      await i.deferUpdate();
      if      (i.customId === "help_prev") catIndex = Math.max(0, catIndex - 1);
      else if (i.customId === "help_next") catIndex = Math.min(CATEGORIES.length - 1, catIndex + 1);
      else if (i.customId.startsWith("help_cat_")) catIndex = parseInt(i.customId.split("_")[2]);

      await interaction.editReply({
        embeds: [buildEmbed(catIndex)],
        components: [buildRow(catIndex)],
      });
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
