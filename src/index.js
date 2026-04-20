require("dotenv").config();
const { Client, GatewayIntentBits, Collection } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { connectMongo } = require("./services/database");
const { connectRedis } = require("./services/redis");
const logger = require("./utils/logger");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
  ],
});

client.commands = new Collection();

// Load commands recursively
const commandsPath = path.join(__dirname, "commands");
const loadCommands = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      loadCommands(fullPath);
    } else if (entry.name.endsWith(".js")) {
      const command = require(fullPath);
      if (command?.data?.name) {
        client.commands.set(command.data.name, command);
        logger.info(`Loaded command: ${command.data.name}`);
      }
    }
  }
};
loadCommands(commandsPath);

// Load events
const eventsPath = path.join(__dirname, "events");
for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith(".js"))) {
  const event = require(path.join(eventsPath, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

const { startDashboard } = require("./dashboard/server");

// Scheduled message sender — checks every minute
function startMessageScheduler() {
  const ScheduledMessage = require("./models/ScheduledMessage");
  const { EmbedBuilder } = require("discord.js");

  setInterval(async () => {
    const now = new Date();
    const pending = await ScheduledMessage.find({ sent: false, scheduledAt: { $lte: now } });
    for (const msg of pending) {
      try {
        const channel = await client.channels.fetch(msg.channelId);
        if (!channel) { await msg.updateOne({ sent: true, sentAt: now }); continue; }

        const payload = {};
        if (msg.content) payload.content = msg.content;

        if (msg.embedTitle || msg.embedDesc) {
          const embed = new EmbedBuilder();
          if (msg.embedTitle) embed.setTitle(msg.embedTitle);
          if (msg.embedDesc)  embed.setDescription(msg.embedDesc);
          if (msg.embedColor) embed.setColor(msg.embedColor);
          if (msg.embedImage) embed.setImage(msg.embedImage);
          payload.embeds = [embed];
        }

        await channel.send(payload);
        await msg.updateOne({ sent: true, sentAt: now });
        logger.info(`Sent scheduled message "${msg.title}" to channel ${msg.channelId}`);
      } catch (err) {
        logger.error(`Failed to send scheduled message "${msg.title}":`, err);
      }
    }
  }, 60_000);
}

// Banner auto-expiration — checks every 5 minutes
function startBannerExpirationChecker() {
  const Banner = require("./models/Banner");

  const check = async () => {
    const now = new Date();
    const expired = await Banner.find({ isActive: true, endsAt: { $lte: now } });
    for (const banner of expired) {
      await banner.updateOne({ isActive: false });
      logger.info(`Banner "${banner.name}" auto-expired`);
    }
  };

  check(); // Run immediately on startup
  setInterval(check, 5 * 60_000);
}


// Mana tick — runs every 5 minutes
// 1. Writes progressive Qi/Dantian values to DB (so /dantian reflects real-time)
// 2. Sends DM when Qi or Dantian first reaches full (resets flag when they drop below full)
function startManaNotificationChecker() {
  const { qiMax, dantianMax, regenQi, regenDantian } = require("./services/mana");
  const User = require("./models/User");

  // In-memory flags: Set of "userId_qi" / "userId_dantian"
  // Added when full DM sent, removed when value drops below max
  const notified = new Set();

  setInterval(async () => {
    try {
      // Fetch all users who have any notification on OR have regen in progress
      const users = await User.find({
        $or: [
          { "notifications.qiFull": true },
          { "notifications.dantianFull": true },
          { "mana.qi": { $gt: 0 } }, // has partial Qi to update
          { "mana.dantian": { $gt: 0 } }, // has partial Dantian to update
        ],
      });

      for (const user of users) {
        try {
          const maxQi      = qiMax(user.accountLevel);
          const maxDantian = dantianMax(user.accountLevel);
          const newQi      = regenQi(user);
          const newDantian = regenDantian(user);

          const qiKey      = `${user.userId}_qi`;
          const dantianKey = `${user.userId}_dantian`;

          // Only write to DB if value actually changed
          const qiChanged      = newQi      !== (user.mana?.qi      ?? maxQi);
          const dantianChanged = newDantian !== (user.mana?.dantian ?? maxDantian);

          if (qiChanged || dantianChanged) {
            const update = {};
            if (qiChanged) {
              update["mana.qi"] = newQi;
              // Reset lastQiUpdate to now so next tick calculates from current value
              update["mana.lastQiUpdate"] = new Date();
            }
            if (dantianChanged) {
              update["mana.dantian"] = newDantian;
              update["mana.lastDantianUpdate"] = new Date();
            }
            await User.findOneAndUpdate({ userId: user.userId }, update);
          }

          // ── Notifications ─────────────────────────────────────────────────

          // Qi full — notify only first time after reaching max, reset flag when drops below
          if (newQi < maxQi) {
            notified.delete(qiKey); // dropped below full → ready to notify again next time
          } else if (user.notifications?.qiFull && newQi >= maxQi && !notified.has(qiKey)) {
            notified.add(qiKey);
            try {
              const discordUser = await client.users.fetch(user.userId);
              await discordUser.send(`<:Qi:1495523502961459200> **Your Qi is full!** (${maxQi}/${maxQi})
Use \`/roll\` to spend it.`);
            } catch {}
          }

          // Dantian full — same logic
          if (newDantian < maxDantian) {
            notified.delete(dantianKey);
          } else if (user.notifications?.dantianFull && newDantian >= maxDantian && !notified.has(dantianKey)) {
            notified.add(dantianKey);
            try {
              const discordUser = await client.users.fetch(user.userId);
              await discordUser.send(`<:Dantian:1495528597610303608> **Your Dantian is full!** (${maxDantian}/${maxDantian})
Use \`/refill\` to transfer energy to your Qi.`);
            } catch {}
          }

        } catch {}
      }
    } catch (err) {
      logger.error("Mana tick error:", err);
    }
  }, 5 * 60_000); // every 5 minutes
}


// Premium expiry checker — runs every hour
function startPremiumExpiryChecker() {
  const User = require("./models/User");
  setInterval(async () => {
    const now = new Date();
    const expired = await User.find({ isPremium: true, premiumUntil: { $lte: now } });
    for (const u of expired) {
      await u.updateOne({ isPremium: false });
      logger.info(`Premium expired for user ${u.userId}`);
    }
  }, 60 * 60_000); // every hour
}

// Start
(async () => {
  await connectMongo();
  await connectRedis();
  startDashboard(client);
  await client.login(process.env.DISCORD_TOKEN);
  startMessageScheduler();
  startBannerExpirationChecker();
  startManaNotificationChecker();
  startPremiumExpiryChecker();
})();

module.exports = client;
