const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType,
} = require("discord.js");
const { requireProfile } = require("../../utils/requireProfile");
const User = require("../../models/User");

const JADE = "<:Jade:1496624534139179009>";
const NYAN = "<:Nyan:1495048966528831508>";

const FACTIONS = {
  heavenly_demon: { label: "Heavenly Demon Cult", emoji: "<:DemonicSect:1497265894550671372>", color: 0xef4444 },
  orthodox:       { label: "Orthodox Sect",        emoji: "<:OrthodoxSect:1497266218749530132>", color: 0x3b82f6 },
};

function opponentKey(faction) {
  return faction === "heavenly_demon" ? "orthodox" : "heavenly_demon";
}

async function buildLeaderboardEmbed(faction, title) {
  const top = await User.find({ faction })
    .sort({ factionPoints: -1 })
    .limit(10)
    .select("username factionPoints");

  const f   = FACTIONS[faction];
  const opp = FACTIONS[opponentKey(faction)];

  const lines = top.length
    ? top.map((u, idx) => {
        const medal = ["🥇","🥈","🥉"][idx] ?? `**${idx + 1}.**`;
        return `${medal} **${u.username}** — ${(u.factionPoints || 0).toLocaleString()} pts`;
      })
    : ["*No members yet.*"];

  return new EmbedBuilder()
    .setTitle(`${f.emoji} ${title ?? f.label}`)
    .setDescription(lines.join("\n"))
    .setColor(f.color)
    .setFooter({ text: `Top 10 · ${f.label}` });
}

async function buildOverallEmbed() {
  const top = await User.find({ faction: { $in: ["heavenly_demon","orthodox"] } })
    .sort({ factionPoints: -1 })
    .limit(10)
    .select("username factionPoints faction");

  const lines = top.length
    ? top.map((u, idx) => {
        const medal = ["🥇","🥈","🥉"][idx] ?? `**${idx + 1}.**`;
        const fEmoji = FACTIONS[u.faction]?.emoji ?? "";
        return `${medal} ${fEmoji} **${u.username}** — ${(u.factionPoints || 0).toLocaleString()} pts`;
      })
    : ["*No members yet.*"];

  return new EmbedBuilder()
    .setTitle("⚔️ Overall Leaderboard")
    .setDescription(lines.join("\n"))
    .setColor(0x8b5cf6)
    .setFooter({ text: "All factions combined" });
}

function buildRewardsEmbed() {
  return new EmbedBuilder()
    .setTitle("🏆 Seasonal Rewards — Every 3 Months")
    .setColor(0xfbbf24)
    .setDescription("Rewards are distributed every **3 months** to top players in each faction and the overall leaderboard.")
    .addFields(
      {
        name: "🌐 Overall Leaderboard (Both Factions)",
        value: [
          `🥇 **1st** — Premium 30 days + Limited Card *(1st place anime)* + 🏅 Badge 1st`,
          `🥈 **2nd** — Premium 7 days + Limited Card *(2nd place anime)* + 🏅 Badge 2nd`,
          `🥉 **3rd** — Limited Card *(3rd place anime)* + 🏅 Badge 3rd`,
          `**5–10** — 🏅 Badge Top 10 + ${JADE} Jade + ${NYAN} Nyang`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "⚔️ Per Faction Leaderboard (Top 10 each faction)",
        value: [
          `🏅 **1st** — ${JADE} 500 Jade`,
          `🏅 **2nd** — ${JADE} 400 Jade`,
          `🏅 **3rd** — ${JADE} 300 Jade`,
          `🏅 **4th** — ${JADE} 250 Jade`,
          `🏅 **5th** — ${JADE} 200 Jade`,
          `🏅 **6–10** — ${JADE} 100 Jade *(decreasing)*`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "📌 Notes",
        value: [
          `• **Changing faction resets your points** — plan carefully`,
          `• Points are earned by rolling: ${NYAN} Common = 1pt · Rare = 2pt · Special = 5pt`,
          `• Use a **Faction Pass** (15,000 ${NYAN} in shop) to switch faction once per month`,
        ].join("\n"),
        inline: false,
      }
    )
    .setFooter({ text: "Placeholder — actual rewards may vary" });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("factions")
    .setDescription("View faction leaderboards, rewards, and manage your faction"),

  async execute(interaction) {
    await interaction.deferReply();

    const user = await requireProfile(interaction);
    if (!user) return;

    if (!user.faction) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setTitle("⚔️ No Faction")
          .setDescription("You haven't joined a faction yet.\nUse `/register` to set up your profile and choose a faction.")
          .setColor(0x6b7280)
        ]
      });
    }

    const f   = FACTIONS[user.faction];
    const opp = FACTIONS[opponentKey(user.faction)];

    // Has faction pass?
    const now = Date.now();
    const lastBought = user.shopLimits?.factionPassLastBought;
    const hasPass = lastBought && (now - new Date(lastBought).getTime()) < 30 * 24 * 60 * 60 * 1000;

    // Check if bought recently and actually the pass is unused
    // (simplified: hasFactionPass item in inventory — for now check if they have it as a purchased item)
    // We'll use a simple flag: if factionPassLastBought was updated MORE recently than factionJoinedAt, pass is available
    const passAvailable = lastBought && user.factionJoinedAt &&
      new Date(lastBought) > new Date(user.factionJoinedAt);

    let view = "own"; // own | opponent | overall | rewards

    async function buildMessage() {
      let embed;
      const components = [];

      if (view === "own") {
        embed = await buildLeaderboardEmbed(user.faction);
        embed.setDescription(
          `**Your Faction:** ${f.emoji} ${f.label}\n` +
          `**Your Points:** ${(user.factionPoints || 0).toLocaleString()} pts\n\n` +
          (embed.data.description || "")
        );
      } else if (view === "opponent") {
        embed = await buildLeaderboardEmbed(opponentKey(user.faction), `${opp.emoji} ${opp.label}`);
      } else if (view === "overall") {
        embed = await buildOverallEmbed();
      } else if (view === "rewards") {
        embed = buildRewardsEmbed();
      }

      // Row 1 — main nav
      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("fac_own").setLabel(`${f.emoji} ${f.label}`).setStyle(view === "own" ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("fac_opp").setLabel(`${opp.emoji} ${opp.label}`).setStyle(view === "opponent" ? opp.color === 0xef4444 ? ButtonStyle.Danger : ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("fac_overall").setLabel("⚔️ Overall").setStyle(view === "overall" ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("fac_rewards").setLabel("🏆 Rewards").setStyle(view === "rewards" ? ButtonStyle.Success : ButtonStyle.Secondary),
      );
      components.push(row1);

      // Row 2 — change faction (only if pass available)
      if (passAvailable) {
        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("fac_change").setLabel(`🔄 Change Faction (Pass available)`).setStyle(ButtonStyle.Success),
        );
        components.push(row2);
      }

      return { embeds: [embed], components };
    }

    const msg = await interaction.editReply(await buildMessage());

    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 5 * 60 * 1000,
    });

    collector.on("collect", async i => {
      try {
        await i.deferUpdate();

        if      (i.customId === "fac_own")     view = "own";
        else if (i.customId === "fac_opp")     view = "opponent";
        else if (i.customId === "fac_overall") view = "overall";
        else if (i.customId === "fac_rewards") view = "rewards";
        else if (i.customId === "fac_change") {
          // Show confirmation
          const confirmEmbed = new EmbedBuilder()
            .setTitle("⚠️ Change Faction?")
            .setDescription([
              `You are about to leave **${f.emoji} ${f.label}** and join **${opp.emoji} ${opp.label}**.`,
              "",
              "❗ **This will reset all your faction points to 0.**",
              "❗ Your Faction Pass will be consumed.",
              "",
              "Are you sure?",
            ].join("\n"))
            .setColor(0xf59e0b);

          const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("fac_confirm_change").setLabel("✓ Confirm").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("fac_cancel_change").setLabel("✕ Cancel").setStyle(ButtonStyle.Secondary),
          );

          await interaction.editReply({ embeds: [confirmEmbed], components: [confirmRow] });

          try {
            const conf = await msg.awaitMessageComponent({
              filter: ci => ci.user.id === interaction.user.id && ["fac_confirm_change","fac_cancel_change"].includes(ci.customId),
              componentType: ComponentType.Button,
              time: 30_000,
            });
            await conf.deferUpdate();

            if (conf.customId === "fac_confirm_change") {
              const newFaction = opponentKey(user.faction);
              await User.findOneAndUpdate({ userId: interaction.user.id }, {
                faction: newFaction,
                factionPoints: 0,
                factionJoinedAt: new Date(),
                "shopLimits.factionPassLastBought": null, // consume pass
              });
              user.faction      = newFaction;
              user.factionPoints = 0;
              view = "own";
            }
          } catch {}
        }

        await interaction.editReply(await buildMessage());
      } catch (err) {
        console.error("[factions]", err);
      }
    });

    collector.on("end", () => { interaction.editReply({ components: [] }).catch(() => {}); });
  },
};
