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

// Start
(async () => {
  await connectMongo();
  await connectRedis();
  startDashboard(client);
  await client.login(process.env.DISCORD_TOKEN);
  startMessageScheduler();
  startBannerExpirationChecker();
})();

module.exports = client;
