require("dotenv").config();
const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");

const commands = [];

const loadCommands = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      loadCommands(fullPath);
    } else if (entry.name.endsWith(".js")) {
      const cmd = require(fullPath);
      if (cmd?.data) commands.push(cmd.data.toJSON());
    }
  }
};
loadCommands(path.join(__dirname, "commands"));

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

const GUILD_IDS = [
  process.env.GUILD_ID,
  "1494695953125474478",
].filter(Boolean);

(async () => {
  console.log(`Deploying ${commands.length} commands to ${GUILD_IDS.length} server(s)...`);
  for (const guildId of GUILD_IDS) {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
      { body: commands }
    );
    console.log(`✅ Deployed to guild ${guildId}`);
  }
  console.log("Done.");
})();
