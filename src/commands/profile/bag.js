const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { requireProfile } = require("../../utils/requireProfile");

const NYAN    = "<:Nyan:1495048966528831508>";
const JADE    = "<:Jade:1496624534139179009>";
const QI      = "<:Qi:1496984846566818022>";
const DANTIAN = "<:Dantian:1495528597610303608>";
const PERMA   = "<:perma_ticket:1494344593863344258>";
const PICKUP  = "<:pickup_ticket:1494344547046523091>";

const ITEMS = [
  // ── Talismans ──────────────────────────────────────────────────────────────
  { key: "talismanCommon",      label: "Common Talisman",      emoji: "📜", desc: "70% / 50% / 40% capture" },
  { key: "talismanUncommon",    label: "Uncommon Talisman",    emoji: "📋", desc: "80% / 60% / 60% capture" },
  { key: "talismanDivine",      label: "Divine Talisman",      emoji: "✴️", desc: "95% / 90% / 80% capture" },
  { key: "talismanExceptional", label: "Exceptional Talisman", emoji: "🌟", desc: "100% capture on any card" },
  // ── Pills ──────────────────────────────────────────────────────────────────
  { key: "lesserQiPill",   label: "Lesser Qi Pill",   emoji: DANTIAN, desc: "Restores 1/4 Dantian" },
  { key: "qiPill",         label: "Qi Pill",           emoji: QI,      desc: "Restores 600 Qi (overflow)" },
  { key: "greaterQiPill",  label: "Greater Qi Pill",   emoji: QI,      desc: "Restores 3000 Qi (overflow)" },
  { key: "divineQiPill",   label: "Divine Qi Pill",    emoji: "🔵",   desc: "10min free rolls (no multi)" },
  { key: "demonicQiPill",  label: "Demonic Qi Pill",   emoji: "🔴",   desc: "10min free rolls + SP boost" },
  { key: "fenghuangBlessing", label: "Fenghuang's Blessing", emoji: "🦅", desc: "Refreshes Dantian cooldown" },
  // ── Boxes ─────────────────────────────────────────────────────────────────
  { key: "specialCardBox", label: "Special Card Box",  emoji: "<:Special:1496599588902273187>", desc: "Roll a random Special card" },
  { key: "gearBox",        label: "Gear Box",          emoji: "📦",   desc: "Random gear for your cards" },
  { key: "petTreatBox",    label: "Pet Treat Box",     emoji: "🐾",   desc: "Treats for your pets" },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("bag")
    .setDescription("View all items in your bag"),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    const user = await requireProfile(interaction);
    if (!user) return;

    const items = user.items ?? {};

    // Group by category
    const talismans = ITEMS.slice(0, 4);
    const pills     = ITEMS.slice(4, 10);
    const boxes     = ITEMS.slice(10);

    function buildSection(list) {
      const lines = list.map(item => {
        const count = items[item.key] ?? 0;
        const countStr = count > 0
          ? `**×${count}**`
          : `~~×0~~`;
        return `${item.emoji} ${countStr}  ${item.label}\n` +
               `ㅤ*${item.desc}*`;
      });
      return lines.join("\n\n");
    }

    const talismanSection = buildSection(talismans);
    const pillSection     = buildSection(pills);
    const boxSection      = buildSection(boxes);

    // Currency summary
    const gold    = user.currency?.gold ?? 0;
    const jade    = user.currency?.premiumCurrency ?? 0;
    const tickets = user.currency?.regularTickets ?? 0;
    const pickup  = user.currency?.pickupTickets ?? 0;

    const embed = new EmbedBuilder()
      .setTitle(`🎒 ${user.username}'s Bag`)
      .setColor(0x8b5cf6)
      .addFields(
        {
          name: "💰 Wallet",
          value: [
            `${NYAN} **${gold.toLocaleString()}** Nyang`,
            `${JADE} **${jade.toLocaleString()}** Jade`,
            `${PERMA} **${tickets}** Regular Tickets`,
            `${PICKUP} **${pickup}** Pickup Tickets`,
          ].join("  ·  "),
          inline: false,
        },
        {
          name: "🎯 Talismans",
          value: talismanSection || "*None*",
          inline: false,
        },
        {
          name: "💊 Pills & Effects",
          value: pillSection || "*None*",
          inline: false,
        },
        {
          name: "📦 Boxes",
          value: boxSection || "*None*",
          inline: false,
        },
      )
      .setFooter({ text: "Use /shop to purchase items · /use to consume pills and boxes" });

    await interaction.editReply({ embeds: [embed] });
  },
};
