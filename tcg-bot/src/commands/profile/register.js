const {
  SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ComponentType,
} = require("discord.js");
const User = require("../../models/User");
const { qiMax, dantianMax } = require("../../services/mana");

const NYAN   = "<:Nyan:1495048966528831508>";
const JADE   = "<:Jade:1496624534139179009>";
const PERMA  = "<:perma_ticket:1494344593863344258>";
const PICKUP = "<:pickup_ticket:1494344547046523091>";
const QI     = "<:Qi:1496984846566818022>";
const DAN    = "<:Dantian:1495528597610303608>";
const EX     = "<:Exceptional:1496532355719102656>";
const SP     = "<:Special:1496599588902273187>";
const RARE   = "<:Rare:1496204151447748811>";
const COM    = "<:Common:1496973383143788716>";

const WELCOME_GOLD    = 200000;
const WELCOME_TICKETS = 0;

// ─── Tutorial pages ───────────────────────────────────────────────────────────
const TUTORIAL = [
  // ── Page 1 — Welcome ───────────────────────────────────────────────────────
  {
    title: "🌸 Welcome to SeorinTCG!",
    color: 0x8b5cf6,
    description: "An **anime card collecting RPG** — roll for cards, build your collection, and compete for the top of the leaderboard!",
    fields: [
      {
        name: "🎁 Your Starter Pack",
        value: [
          `${NYAN} **200,000 Nyang** — the main currency`,
          `📜 **50× Common Talisman** — to capture cards`,
          `📋 **20× Uncommon Talisman** — better capture rates`,
          `🌟 **1× Exceptional Talisman** — 100% capture guaranteed`,
        ].join("\n"),
      },
      {
        name: "What you'll learn",
        value: "① Qi & Dantian  ·  ② Rolling & Capture  ·  ③ Talismans  ·  ④ Factions  ·  ⑤ Daily & Quests  ·  ⑥ Shop & Bag",
      },
    ],
    footer: "Page 1 / 6  ·  Use ▶ to continue",
  },
  // ── Page 2 — Qi & Dantian ──────────────────────────────────────────────────
  {
    title: `${QI} Energy System — Qi & Dantian`,
    color: 0x6d28d9,
    description: "Your energy powers every roll. Manage it wisely.",
    fields: [
      {
        name: `${QI} Qi — Roll Energy`,
        value: [
          "Each **`/roll`** costs **25 Qi**.",
          "Starts at **250 Qi** at Level 1, scales to **3,500 Qi** at Level 25.",
          "Regenerates fully in **2 hours** from 0.",
        ].join("\n"),
        inline: false,
      },
      {
        name: `${DAN} Dantian — Energy Reserve`,
        value: [
          "Fixed reserve of **3,500** — never scales.",
          "Fills passively in **8 hours**.",
          "Use **`/refill`** to instantly pour Dantian into Qi.",
          "Buy **Lesser Qi Pills** in the shop to restore Dantian on demand.",
        ].join("\n"),
        inline: false,
      },
      {
        name: "Commands",
        value: "`/dantian` — check Qi & Dantian  ·  `/refill` — transfer Dantian → Qi  ·  `/settings` — notifications",
        inline: false,
      },
    ],
    footer: "Page 2 / 6",
  },
  // ── Page 3 — Rolling & Capture ─────────────────────────────────────────────
  {
    title: `${COM} Rolling & Capture System`,
    color: 0x2563eb,
    description: "Roll to reveal a card — then capture it with a Talisman!",
    fields: [
      {
        name: "How It Works",
        value: [
          "**1.** `/roll` costs **25 Qi** — a card is revealed with its image.",
          "**2.** Select a **Talisman** to attempt capture.",
          "**3.** ✅ Captured → card + Nyang earned  |  ❌ Escaped → card vanishes.",
          "After each result, a **Roll Again** button lets you keep rolling.",
        ].join("\n"),
        inline: false,
      },
      {
        name: "Drop Rates",
        value: `${COM} Common **62.5%**  ·  ${RARE} Rare **30%**  ·  ${SP} Special **7.5%**`,
        inline: false,
      },
      {
        name: `${NYAN} Nyang on Capture`,
        value: "Common **+50**  ·  Rare **+150**  ·  Special **+500**  ·  Exceptional **+1,500**",
        inline: false,
      },
    ],
    footer: "Page 3 / 6",
  },
  // ── Page 4 — Talismans ─────────────────────────────────────────────────────
  {
    title: "🎯 Talismans — Capture Tool",
    color: 0xf59e0b,
    description: "You **need a Talisman** to capture a card. Buy them in `/shop`.",
    fields: [
      {
        name: "Capture Rates by Talisman",
        value: [
          `📜 **Common** (400 ${NYAN}) — Common **70%** · Rare **50%** · Special **40%**`,
          `📋 **Uncommon** (2,000 ${NYAN}) — Common **80%** · Rare **60%** · Special **60%**`,
          `✴️ **Divine** (20,000 ${NYAN}) — Common **95%** · Rare **90%** · Special **80%**`,
          `🌟 **Exceptional** (200,000 ${NYAN}) — **100%** on everything`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "💡 Important",
        value: [
          "Fleeing is **free** — no talisman wasted.",
          "A **failed** capture consumes the talisman.",
          "You can chain rolls — a **Roll Again** button appears after every result.",
        ].join("\n"),
        inline: false,
      },
    ],
    footer: "Page 4 / 6",
  },
  // ── Page 5 — Factions, Daily & Quests ─────────────────────────────────────
  {
    title: "⚔️ Factions · Daily · Quests",
    color: 0xef4444,
    description: "Join a faction, earn daily rewards, and complete missions.",
    fields: [
      {
        name: "⚔️ Factions",
        value: [
          "<:DemonicSect:1497265894550671372> **Heavenly Demon Cult** vs <:OrthodoxSect:1497266218749530132> **Orthodox Sect**",
          "Every capture earns **faction points** — fight for the leaderboard!",
          "Top 10 players of each faction earn rewards every **3 months**.",
          "Switch faction with a **Faction Pass** (15,000 Nyang/month). Switching **resets your points**.",
        ].join("\n"),
        inline: false,
      },
      {
        name: "📅 Daily & Quests",
        value: [
          "`/daily` — claim daily rewards on a **28-day cycle** (Nyang, Jade, tickets)",
          "`/quests` — **3 daily** + **3 weekly** missions for bonus rewards",
          "Missing a day resets your streak!",
        ].join("\n"),
        inline: false,
      },
    ],
    footer: "Page 5 / 6",
  },
  // ── Page 6 — Shop, Bag & Collection ───────────────────────────────────────
  {
    title: `${NYAN} Shop · Bag · Collection`,
    color: 0x059669,
    description: "Spend wisely, track your items, and grow your collection.",
    fields: [
      {
        name: `${NYAN} Shop`,
        value: [
          `📜 Talismans  ·  ⬆️ Roll Upgrade (50k${NYAN})  ·  🎫 Faction Pass (15k${NYAN})  ·  ${DAN} Qi Pills`,
          `${JADE} Jade: 💎 Premium · Special Card Box · Gear Box`,
          "Select any item → type quantity → done!",
        ].join("\n"),
        inline: false,
      },
      {
        name: "🎒 Your Bag & Cards",
        value: [
          "`/bag` — view all items, talismans and currency",
          "`/inventory` — browse your cards with filters",
          "`/collection` — visual album: owned vs missing",
          "`/card` — browse all cards in the game",
          "`/burn` — destroy duplicates for Nyang",
        ].join("\n"),
        inline: false,
      },
      {
        name: "📊 More Commands",
        value: "`/profile` — view & edit your profile  ·  `/factions` — faction rankings  ·  `/leaderboard` — top players",
        inline: false,
      },
    ],
    footer: "Page 6 / 6  ·  Press ✅ Done to finish and choose your Faction!",
  },
];
function buildPage(page) {
  const t = TUTORIAL[page];
  const embed = new EmbedBuilder()
    .setTitle(t.title)
    .setColor(t.color)
    .setFooter({ text: t.footer });
  if (t.description) embed.setDescription(t.description);
  if (t.fields) embed.addFields(t.fields);
  return embed;
}

function buildNavRow(page) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("tuto_prev").setEmoji("◀").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId("tuto_page").setLabel(`${page + 1} / ${TUTORIAL.length}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId("tuto_next").setEmoji("▶").setStyle(ButtonStyle.Primary).setDisabled(page >= TUTORIAL.length - 1),
    new ButtonBuilder().setCustomId("tuto_done").setLabel("✓ Done").setStyle(ButtonStyle.Success).setDisabled(page < TUTORIAL.length - 1),
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("register")
    .setDescription("Create your profile and claim your welcome rewards"),

  async execute(interaction) {
    const existing = await User.findOne({ userId: interaction.user.id });
    if (existing) {
      return interaction.reply({ content: "You already have a profile! Use `/profile` to view it.", ephemeral: true });
    }

    const modal = new ModalBuilder()
      .setCustomId("register_modal")
      .setTitle("Profile Setup");

    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("pseudo")
        .setLabel("Choose your in-game username")
        .setStyle(TextInputStyle.Short)
        .setMinLength(2).setMaxLength(24)
        .setPlaceholder(interaction.user.username)
        .setRequired(true)
    ));

    await interaction.showModal(modal);

    let modalInteraction;
    try {
      modalInteraction = await interaction.awaitModalSubmit({
        filter: i => i.customId === "register_modal" && i.user.id === interaction.user.id,
        time: 5 * 60 * 1000,
      });
    } catch { return; }

    await modalInteraction.deferReply({ ephemeral: true });

    const doubleCheck = await User.findOne({ userId: interaction.user.id });
    if (doubleCheck) return modalInteraction.editReply({ content: "You already have a profile!" });

    const username = modalInteraction.fields.getTextInputValue("pseudo").trim();

    await User.create({
      userId: interaction.user.id,
      username,
      mana: { qi: qiMax(1), dantian: dantianMax(1), qiCooldownUntil: null, lastDantianUpdate: new Date(), lastQiUpdate: new Date() },
      currency: { gold: WELCOME_GOLD, premiumCurrency: 0, pickupTickets: 0, regularTickets: 0 },
      items: { talismanCommon: 50, talismanUncommon: 20, talismanExceptional: 1 },
      stats: { totalGoldEverEarned: WELCOME_GOLD },
      firstJoinDate: new Date(),
      lastLoginDate: new Date(),
      loginStreak: 1,
    });

    // Show tutorial
    let page = 0;
    const msg = await modalInteraction.editReply({
      embeds: [buildPage(page)],
      components: [buildNavRow(page)],
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === interaction.user.id,
      time: 15 * 60 * 1000,
    });

    collector.on("collect", async i => {
      await i.deferUpdate();
      if      (i.customId === "tuto_prev") page = Math.max(0, page - 1);
      else if (i.customId === "tuto_next") page = Math.min(TUTORIAL.length - 1, page + 1);
      else if (i.customId === "tuto_done") {
        // Show faction choice
        const factionEmbed = new EmbedBuilder()
          .setTitle("⚔️ Choose Your Faction")
          .setDescription([
            "Before you begin, you must choose a faction.",
            "Your faction shapes your identity in SeorinTCG.",
            "",
            "🔴 **Heavenly Demon Cult**",
            "*Walk the path of demons. Power through destruction.*",
            "",
            "🔵 **Orthodox Sect**",
            "*Follow the righteous path. Strength through discipline.*",
            "",
            "━━━━━━━━━━━━━━━━━━━━━━━━",
            "⚠️ **Your choice can be changed once per month** via the `/shop` (Faction Pass — 15,000 Nyang).",
            "🏆 **Every 3 months**, the top 10 of each faction receive exclusive rewards.",
            "📊 **Points are earned by rolling** — earn points for your faction with every pull.",
            "❗ Changing faction **resets your faction points**.",
          ].join("\n"))
          .setColor(0x5B21B6)
          .setFooter({ text: "This choice cannot be undone without a Faction Pass" });

        const factionRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("faction_demonic").setLabel("<:DemonicSect:1497265894550671372> Heavenly Demon Cult").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("faction_orthodox").setLabel("<:OrthodoxSect:1497266218749530132> Orthodox Sect").setStyle(ButtonStyle.Primary),
        );

        await modalInteraction.editReply({ embeds: [factionEmbed], components: [factionRow] });
        collector.stop();

        // Wait for faction choice
        try {
          const factionI = await msg.awaitMessageComponent({
            filter: fi => fi.user.id === interaction.user.id && ["faction_demonic","faction_orthodox"].includes(fi.customId),
            time: 5 * 60 * 1000,
          });
          await factionI.deferUpdate();

          const chosenFaction = factionI.customId === "faction_demonic" ? "heavenly_demon" : "orthodox";
          const factionLabel  = chosenFaction === "heavenly_demon" ? "Heavenly Demon Cult 🔴" : "Orthodox Sect 🔵";

          await User.findOneAndUpdate({ userId: interaction.user.id }, {
            faction: chosenFaction,
            factionJoinedAt: new Date(),
            factionPoints: 0,
          });

          await modalInteraction.editReply({
            embeds: [new EmbedBuilder()
              .setTitle("🎉 You're all set!")
              .setDescription(`Welcome, **${username}**!\n\nYou have joined the **${factionLabel}**.\nFight for glory and climb the faction leaderboard!\n\nStart with \`/daily\` then \`/roll\` to get your first cards!`)
              .setColor(chosenFaction === "heavenly_demon" ? 0xef4444 : 0x3b82f6)
              .setThumbnail(interaction.user.displayAvatarURL())
              .addFields({ name: "Your Rewards", value: `${NYAN} **${WELCOME_GOLD.toLocaleString()} Nyang**\n📜 **50× Common Talisman**\n📋 **20× Uncommon Talisman**\n🌟 **1× Exceptional Talisman**` })
              .setFooter({ text: "Use /help anytime to see all commands" })
            ],
            components: [],
          });
        } catch {
          await modalInteraction.editReply({ components: [] }).catch(() => {});
        }
        return;
      }

      await modalInteraction.editReply({
        embeds: [buildPage(page)],
        components: [buildNavRow(page)],
      });
    });

    collector.on("end", (_, reason) => {
      if (reason !== "user") {
        modalInteraction.editReply({ components: [] }).catch(() => {});
      }
    });
  },
};
