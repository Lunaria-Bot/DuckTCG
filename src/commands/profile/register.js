const {
  SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ComponentType,
} = require("discord.js");
const User = require("../../models/User");
const { qiMax, dantianMax } = require("../../services/mana");

const NYAN   = "<:Nyan:1495048966528831508>";
const JADE   = "<:Jade:1495038405866688703>";
const PERMA  = "<:perma_ticket:1494344593863344258>";
const PICKUP = "<:pickup_ticket:1494344547046523091>";
const QI     = "<:Qi:1495523502961459200>";
const DAN    = "<:Dantian:1495528597610303608>";
const EX     = "<:Exceptional:1496204269110563038>";
const SP     = "<:Special:1496200970042872010>";
const RARE   = "<:Rare:1496150241462849536>";
const COM    = "<:Common:1495730171301462186>";

const WELCOME_GOLD    = 1000;
const WELCOME_TICKETS = 10;

// ─── Tutorial pages ───────────────────────────────────────────────────────────
const TUTORIAL = [
  {
    title: "👋 Welcome to Seorin TCG!",
    color: 0x7c3aed,
    description: "You've just joined an **Anime Gacha RPG** experience.\nHere's a quick guide to get you started — use the buttons below to navigate.",
    fields: [
      {
        name: "Your Welcome Rewards",
        value: [
          `${PERMA} **${WELCOME_TICKETS} Regular Tickets** — for your first pulls`,
          `${NYAN} **${WELCOME_GOLD.toLocaleString()} Nyang** — the main currency`,
        ].join("\n"),
      },
      {
        name: "What you'll learn",
        value: "① Mana System  ·  ② Rolling  ·  ③ Banners  ·  ④ Daily & Quests  ·  ⑤ Shop  ·  ⑥ Inventory",
      },
    ],
    footer: "Page 1 / 7  ·  Use ▶ to continue",
  },
  {
    title: `${QI} Mana System — Qi & Dantian`,
    color: 0x6d28d9,
    description: "Your energy system works in two layers:",
    fields: [
      {
        name: `${QI} Qi — Inner Energy`,
        value: "Used directly for `/roll`. Starts at **10** and scales with your level up to **40** at Lv25.\nRegenerates passively in **1h30** from 0 to full.",
        inline: false,
      },
      {
        name: `${DAN} Dantian — Stored Energy`,
        value: "A reservoir that refills over **8 hours**. Use `/refill` to instantly transfer Dantian → Qi.\nBuy **Lesser Qi Pills** in the shop to restore 1/4 Dantian on demand.",
        inline: false,
      },
      {
        name: "Commands",
        value: "`/dantian` — check your Qi & Dantian\n`/refill` — transfer Dantian to Qi\n`/settings` — enable notifications when full",
        inline: false,
      },
    ],
    footer: "Page 2 / 7",
  },
  {
    title: `${COM} Rolling Cards`,
    color: 0x2563eb,
    description: "Spend Qi to roll for random cards from the card pool.",
    fields: [
      {
        name: "How to Roll",
        value: [
          "`/roll` — roll 1 to 5 cards (costs 1 Qi each)",
          "After each roll, **Roll ×1** and **Roll ×5** buttons appear for quick re-rolls",
        ].join("\n"),
        inline: false,
      },
      {
        name: "Rarity Chances",
        value: [
          `${EX} Exceptional — **0.5%**`,
          `${SP} Special — **2.5%**`,
          `${RARE} Rare — **2%**`,
          `${COM} Common — **95%**`,
        ].join("\n"),
        inline: true,
      },
      {
        name: "Roll Limit Upgrade",
        value: `Buy **Roll Limit Upgrade** in the ${NYAN} shop to increase your max from **5 → 7** per command.`,
        inline: false,
      },
    ],
    footer: "Page 3 / 7",
  },
  {
    title: `${PERMA} Banners`,
    color: 0x9c59b6,
    description: "Banners offer **higher rates** and **featured cards** using tickets or Jade.",
    fields: [
      {
        name: "Banner Types",
        value: [
          `${PERMA} **Regular Banner** — use Regular Tickets or ${JADE} 160 Jade per pull`,
          `${PICKUP} **Pick Up Banner** — limited time, use Pick Up Tickets or ${JADE} 160 Jade`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "Pity System",
        value: "Soft pity starts at **75 pulls** — rates increase progressively.\nHard pity at **90 pulls** guarantees an Exceptional card.",
        inline: false,
      },
      {
        name: "Commands",
        value: "`/banners` — browse active banners, pull ×1 or ×10",
        inline: false,
      },
    ],
    footer: "Page 4 / 7",
  },
  {
    title: "📅 Daily Rewards & Quests",
    color: 0xf59e0b,
    description: "Log in every day and complete quests to earn rewards.",
    fields: [
      {
        name: "Daily Reward",
        value: [
          "`/daily` — claim your daily reward (Nyang, tickets, Jade)",
          "Rewards scale over a **28-day cycle** — milestones on Day 7, 14, 21, 28",
          "Don't miss a day — your streak resets if you skip!",
        ].join("\n"),
        inline: false,
      },
      {
        name: "Quests",
        value: [
          "`/quests` — view and claim your daily & weekly quests",
          "**3 daily** quests reset every day at midnight UTC",
          "**3 weekly** quests reset every Monday",
          "Complete them for bonus Nyang, tickets and XP",
        ].join("\n"),
        inline: false,
      },
    ],
    footer: "Page 5 / 7",
  },
  {
    title: `${NYAN} Shop`,
    color: 0xf59e0b,
    description: "Spend your Nyang and Jade on useful items.",
    fields: [
      {
        name: `${NYAN} Nyang Items`,
        value: [
          `**Roll Limit Upgrade** — 50,000 ${NYAN} · permanent +2 max rolls`,
          `**10× Regular Ticket** — 30,000 ${NYAN}`,
          `**Faction Pass** — 15,000 ${NYAN} · monthly`,
          `**Lesser Qi Pill** — 8,000 ${NYAN} · restores 1/4 Dantian · 2×/week`,
        ].join("\n"),
        inline: false,
      },
      {
        name: `${JADE} Jade Items`,
        value: [
          `**Premium** — 200 ${JADE} · 30 days of perks`,
          `**Special Card Box** — 150 ${JADE} · guaranteed Special card`,
          `**Gear Box** — 50 ${JADE}`,
          `**Pet Treat Box** — 30 ${JADE}`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "Commands",
        value: "`/shop` — open the shop\n`/use pill` — use a Lesser Qi Pill",
        inline: false,
      },
    ],
    footer: "Page 6 / 7",
  },
  {
    title: "🃏 Your Card Collection",
    color: 0x059669,
    description: "Manage and explore your cards.",
    fields: [
      {
        name: "Key Commands",
        value: [
          "`/inventory` — browse your owned cards, sort by rarity/level/anime",
          "`/collection` — visual album showing owned vs missing cards",
          "`/card` — browse all available cards with filters",
          "`/burn` — destroy duplicate cards for Nyang",
        ].join("\n"),
        inline: false,
      },
      {
        name: "Leveling Cards",
        value: "Cards gain XP through `/adventure` and `/raid`.\nMax level is **100** (125 after Ascension at Lv100).\nHigher level = higher Combat Power.",
        inline: false,
      },
      {
        name: "You're ready! 🎉",
        value: `Start with \`/daily\` then \`/roll\` to get your first cards!\nUse \`/help\` anytime to see all commands.`,
        inline: false,
      },
    ],
    footer: "Page 7 / 7  ·  Good luck, Summoner!",
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
      currency: { gold: WELCOME_GOLD, premiumCurrency: 0, pickupTickets: 0, regularTickets: WELCOME_TICKETS },
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
        await modalInteraction.editReply({
          embeds: [new EmbedBuilder()
            .setTitle("🎉 You're all set!")
            .setDescription(`Welcome, **${username}**! Your adventure begins now.\n\nStart with \`/daily\` to claim your first reward, then \`/roll\` to get your first cards!`)
            .setColor(0x22c55e)
            .setThumbnail(interaction.user.displayAvatarURL())
            .addFields({ name: "Your Rewards", value: `${PERMA} **${WELCOME_TICKETS} Regular Tickets**\n${NYAN} **${WELCOME_GOLD.toLocaleString()} Nyang**` })
            .setFooter({ text: "Use /help anytime to see all commands" })
          ],
          components: [],
        });
        collector.stop();
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
