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

  setInterval(async () => {
    try {
      const users = await User.find({
        $or: [
          { "notifications.qiFull": true },
          { "notifications.dantianFull": true },
          { "mana.qi": { $gt: 0 } },
          { "mana.dantian": { $gt: 0 } },
        ],
      });

      for (const user of users) {
        try {
          const maxQi      = qiMax(user.accountLevel);
          const maxDantian = dantianMax(user.accountLevel);
          const newQi      = regenQi(user);
          const newDantian = regenDantian(user);

          const dbUpdate = {};

          // Progressive regen writes
          if (newQi !== (user.mana?.qi ?? maxQi)) {
            dbUpdate["mana.qi"]          = newQi;
            dbUpdate["mana.lastQiUpdate"] = new Date();
          }
          if (newDantian !== (user.mana?.dantian ?? maxDantian)) {
            dbUpdate["mana.dantian"]           = newDantian;
            dbUpdate["mana.lastDantianUpdate"] = new Date();
          }

          // ── Qi notification ───────────────────────────────────────────────
          // Rule: send DM only when transitioning from not-full → full
          // notifiedFull.qi = true means we already sent the DM since last time it was spent
          const qiWasFull    = user.notifiedFull?.qi === true;
          const qiIsNowFull  = newQi >= maxQi;
          const qiWasNotFull = newQi < maxQi;

          if (qiWasNotFull && qiWasFull) {
            // Value dropped below max — reset flag so next fill triggers a new DM
            dbUpdate["notifiedFull.qi"] = false;
          } else if (qiIsNowFull && !qiWasFull && user.notifications?.qiFull) {
            // Just reached full AND haven't notified yet → set flag first, then DM
            dbUpdate["notifiedFull.qi"] = true;
          }

          // ── Dantian notification ──────────────────────────────────────────
          const dantianWasFull   = user.notifiedFull?.dantian === true;
          const dantianIsNowFull = newDantian >= maxDantian;
          const dantianWasNotFull = newDantian < maxDantian;

          if (dantianWasNotFull && dantianWasFull) {
            dbUpdate["notifiedFull.dantian"] = false;
          } else if (dantianIsNowFull && !dantianWasFull && user.notifications?.dantianFull) {
            dbUpdate["notifiedFull.dantian"] = true;
          }

          // Write DB changes first
          if (Object.keys(dbUpdate).length) {
            await User.findOneAndUpdate({ userId: user.userId }, dbUpdate);
          }

          // Send DMs AFTER DB write — only if flag just became true
          if (qiIsNowFull && !qiWasFull && user.notifications?.qiFull) {
            try {
              const du = await client.users.fetch(user.userId);
              await du.send(`<:Qi:1495523502961459200> **Your Qi is full!** (${maxQi}/${maxQi})\nUse \`/roll\` to spend it.`);
            } catch {}
          }

          if (dantianIsNowFull && !dantianWasFull && user.notifications?.dantianFull) {
            try {
              const du = await client.users.fetch(user.userId);
              await du.send(`<:Dantian:1495528597610303608> **Your Dantian is full!** (${maxDantian}/${maxDantian})\nUse \`/refill\` to transfer energy to your Qi.`);
            } catch {}
          }

        } catch {}
      }
    } catch (err) {
      logger.error("Mana tick error:", err);
    }
  }, 5 * 60_000);
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
