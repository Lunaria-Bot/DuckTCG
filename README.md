# TCG Bot

Anime Gacha RPG Discord Bot — Discord.js v14, MongoDB, Redis, Coolify/Docker.

## Stack

- **Runtime**: Node.js 20 + Discord.js v14
- **Database**: MongoDB 7 (cards, players, raids, banners)
- **Cache**: Redis 7 (pity, raid cooldowns, adventure cooldowns)
- **Hosting**: Coolify (Docker Compose)

## Structure

```
src/
├── commands/
│   ├── gacha/        pull.js · banners.js · inventory.js · burn.js
│   ├── combat/       team.js · raid.js · adventure.js
│   ├── profile/      profile.js · register.js
│   └── admin/        admin.js
├── events/           ready.js · interactionCreate.js
├── models/           User · Card · PlayerCard · Banner · Raid
├── services/         database.js · redis.js · gacha.js · cardStats.js
├── utils/            logger.js · getOrCreateUser.js
├── index.js
└── deploy-commands.js
```

## Setup

```bash
cp .env.example .env
# Fill in DISCORD_TOKEN, CLIENT_ID, GUILD_ID, REDIS_PASSWORD

npm install
node src/deploy-commands.js   # register slash commands with Discord
npm start
```

## Coolify — Docker

1. Create a new application from the GitHub repo
2. Build method: **Dockerfile**
3. Add environment variables from `.env.example`
4. Add MongoDB and Redis services in the same Coolify network
5. Set `MONGO_URI=mongodb://mongo:27017/tcgbot` and `REDIS_HOST=redis`

## Commands

| Command | Description |
|---|---|
| `/register` | Create your profile + welcome rewards (10 tickets + 1000 gold) |
| `/pull <banner> <single\|multi>` | Pull on a banner |
| `/banners` | View active banners |
| `/inventory` | View your cards (paginated) |
| `/burn <card_id>` | Burn a card for Gold |
| `/team view\|set\|remove` | Manage your combat team |
| `/raid attack\|info` | Attack the boss / view leaderboard |
| `/adventure start\|status\|claim` | 6-hour adventure |
| `/profile [user]` | View player profile |
| `/admin ...` | Admin: currency, banners, raids |

## Stats System (cardStats.js)

```
Rarity mult : Common ×1 · Rare ×1.5 · Special ×2.5 · Exceptional ×4
Level mult  : 1 + (level - 1) × 0.0415   → ~×5 at level 100
Role bonus  : DPS Damage×2 · Support Mana×2 · Tank HP×2.2
Combat Power: damage×1.2 + mana×1.1 + hp×0.8
```

## Pity System

- Soft pity from pull 75: +6% Exceptional rate per pull
- Hard pity at pull 90: Exceptional guaranteed
- 50/50 on featured cards — if lost, next Exceptional = featured guaranteed
- Pity state stored in Redis (30d TTL) + synced to DB

## Upcoming Features (2nd priority)

- Trading / Player market
- Pet system
- Web profile page (Express + React)
