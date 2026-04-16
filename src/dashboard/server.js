const express = require("express");
const path = require("path");
const Banner = require("../models/Banner");
const Card = require("../models/Card");
const Raid = require("../models/Raid");
const User = require("../models/User");
const PlayerCard = require("../models/PlayerCard");
const logger = require("../utils/logger");

const app = express();
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "changeme";
const PORT = process.env.DASHBOARD_PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ─── Auth middleware ──────────────────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.query.token || req.headers["x-admin-token"] || req.body?.token;
  if (token !== ADMIN_TOKEN) {
    return res.status(401).send(renderPage("Unauthorized", `
      <div class="card">
        <h2>Access Denied</h2>
        <p>Invalid or missing admin token.</p>
        <form method="GET" action="/">
          <input type="password" name="token" placeholder="Admin token" required />
          <button type="submit">Login</button>
        </form>
      </div>
    `));
  }
  req.token = token;
  next();
}

// ─── Layout helper ────────────────────────────────────────────────────────────
function renderPage(title, content, token = "") {
  const t = token ? `?token=${token}` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${title} — TCG Admin</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0f0f13; color: #e0e0e0; min-height: 100vh; }
    a { color: #a78bfa; text-decoration: none; }
    a:hover { text-decoration: underline; }
    nav { background: #1a1a24; border-bottom: 1px solid #2d2d3d; padding: 12px 24px; display: flex; gap: 20px; align-items: center; }
    nav .brand { font-weight: 700; color: #a78bfa; font-size: 18px; margin-right: 16px; }
    nav a { color: #c4b5fd; font-size: 14px; }
    .container { max-width: 1100px; margin: 0 auto; padding: 32px 24px; }
    h1 { font-size: 24px; font-weight: 600; margin-bottom: 24px; color: #f0f0f0; }
    h2 { font-size: 18px; font-weight: 600; margin-bottom: 16px; color: #e0e0e0; }
    .card { background: #1a1a24; border: 1px solid #2d2d3d; border-radius: 10px; padding: 24px; margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .stat { background: #1a1a24; border: 1px solid #2d2d3d; border-radius: 8px; padding: 20px; text-align: center; }
    .stat .value { font-size: 32px; font-weight: 700; color: #a78bfa; }
    .stat .label { font-size: 13px; color: #888; margin-top: 4px; }
    form { display: flex; flex-direction: column; gap: 12px; }
    label { font-size: 13px; color: #aaa; margin-bottom: 2px; display: block; }
    input, select, textarea { background: #0f0f13; border: 1px solid #2d2d3d; border-radius: 6px; color: #e0e0e0; padding: 8px 12px; font-size: 14px; width: 100%; }
    input:focus, select:focus, textarea:focus { outline: none; border-color: #a78bfa; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .row3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
    button, .btn { background: #7c3aed; color: #fff; border: none; border-radius: 6px; padding: 9px 18px; font-size: 14px; cursor: pointer; font-weight: 500; display: inline-block; }
    button:hover, .btn:hover { background: #6d28d9; }
    .btn-red { background: #dc2626; }
    .btn-red:hover { background: #b91c1c; }
    .btn-green { background: #16a34a; }
    .btn-green:hover { background: #15803d; }
    .btn-sm { padding: 5px 12px; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { text-align: left; padding: 10px 12px; color: #888; font-weight: 500; border-bottom: 1px solid #2d2d3d; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }
    td { padding: 10px 12px; border-bottom: 1px solid #1e1e2a; vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
    .badge-purple { background: #3b1d6e; color: #c4b5fd; }
    .badge-blue { background: #1d3461; color: #93c5fd; }
    .badge-gray { background: #2d2d3d; color: #9ca3af; }
    .badge-green { background: #14532d; color: #86efac; }
    .badge-red { background: #450a0a; color: #fca5a5; }
    .badge-yellow { background: #451a03; color: #fcd34d; }
    .alert { padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; font-size: 14px; }
    .alert-green { background: #14532d; color: #86efac; border: 1px solid #166534; }
    .alert-red { background: #450a0a; color: #fca5a5; border: 1px solid #7f1d1d; }
    .tabs { display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 1px solid #2d2d3d; padding-bottom: 0; }
    .tab { padding: 8px 16px; border-radius: 6px 6px 0 0; font-size: 14px; cursor: pointer; color: #888; border: 1px solid transparent; border-bottom: none; margin-bottom: -1px; }
    .tab.active { background: #1a1a24; color: #a78bfa; border-color: #2d2d3d; }
  </style>
</head>
<body>
  <nav>
    <span class="brand">🃏 TCG Admin</span>
    <a href="/${t}">Dashboard</a>
    <a href="/banners${t}">Banners</a>
    <a href="/cards${t}">Cards</a>
    <a href="/raids${t}">Raids</a>
    <a href="/players${t}">Players</a>
  </nav>
  <div class="container">
    <h1>${title}</h1>
    ${content}
  </div>
</body>
</html>`;
}

function nav(token) { return `?token=${token}`; }
function q(token) { return `?token=${token}`; }

// ─── Routes ───────────────────────────────────────────────────────────────────

// Login redirect
app.get("/", (req, res, next) => {
  const token = req.query.token;
  if (!token) {
    return res.send(renderPage("Login", `
      <div class="card" style="max-width:400px">
        <h2>Admin Login</h2>
        <form method="GET" action="/">
          <div><label>Admin Token</label><input type="password" name="token" required autofocus/></div>
          <button type="submit">Login</button>
        </form>
      </div>
    `));
  }
  next();
}, auth, async (req, res) => {
  const [userCount, cardCount, bannerCount, pcCount] = await Promise.all([
    User.countDocuments(),
    Card.countDocuments(),
    Banner.countDocuments({ isActive: true }),
    PlayerCard.countDocuments({ isBurned: false }),
  ]);

  const topPlayers = await User.find().sort({ combatPower: -1 }).limit(5);

  res.send(renderPage("Dashboard", `
    <div class="grid">
      <div class="stat"><div class="value">${userCount}</div><div class="label">Registered Players</div></div>
      <div class="stat"><div class="value">${cardCount}</div><div class="label">Cards in DB</div></div>
      <div class="stat"><div class="value">${bannerCount}</div><div class="label">Active Banners</div></div>
      <div class="stat"><div class="value">${pcCount}</div><div class="label">Cards Owned</div></div>
    </div>
    <div class="card">
      <h2>Top Players by Combat Power</h2>
      <table>
        <thead><tr><th>#</th><th>Username</th><th>Combat Power</th><th>Cards</th><th>Gold</th></tr></thead>
        <tbody>
          ${topPlayers.map((p, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${p.username}</td>
              <td>${p.combatPower.toLocaleString()}</td>
              <td>${p.stats.totalCardsEverObtained}</td>
              <td>${p.currency.gold.toLocaleString()}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `, req.token));
});

// ─── BANNERS ──────────────────────────────────────────────────────────────────
app.get("/banners", auth, async (req, res) => {
  const banners = await Banner.find().sort({ createdAt: -1 });
  const t = q(req.token);

  const rows = banners.map(b => {
    const statusBadge = b.isActive
      ? `<span class="badge badge-green">Active</span>`
      : `<span class="badge badge-gray">Inactive</span>`;
    const typeBadge = b.type === "pickup"
      ? `<span class="badge badge-purple">Pick Up</span>`
      : `<span class="badge badge-blue">Regular</span>`;
    const ends = b.endsAt ? new Date(b.endsAt).toLocaleDateString("en-GB") : "—";
    const poolTotal = (b.pool.common?.length || 0) + (b.pool.rare?.length || 0) + (b.pool.special?.length || 0) + (b.pool.exceptional?.length || 0);
    return `<tr>
      <td><strong>${b.name}</strong><br/><small style="color:#666">${b.bannerId}</small></td>
      <td>${typeBadge}</td>
      <td>${statusBadge}</td>
      <td>${ends}</td>
      <td>${poolTotal} cards</td>
      <td>
        <a href="/banners/${b.bannerId}/edit${t}" class="btn btn-sm">Edit</a>
        <a href="/banners/${b.bannerId}/pool${t}" class="btn btn-sm btn-green">Pool</a>
        <a href="/banners/${b.bannerId}/toggle${t}" class="btn btn-sm btn-red">${b.isActive ? "Disable" : "Enable"}</a>
      </td>
    </tr>`;
  }).join("");

  res.send(renderPage("Banners", `
    <a href="/banners/new${t}" class="btn" style="margin-bottom:20px;display:inline-block">+ New Banner</a>
    <div class="card">
      <table>
        <thead><tr><th>Banner</th><th>Type</th><th>Status</th><th>Ends</th><th>Pool</th><th>Actions</th></tr></thead>
        <tbody>${rows || "<tr><td colspan='6' style='color:#666;text-align:center'>No banners yet</td></tr>"}</tbody>
      </table>
    </div>
  `, req.token));
});

app.get("/banners/new", auth, (req, res) => {
  const t = q(req.token);
  res.send(renderPage("New Banner", `
    <div class="card" style="max-width:600px">
      <form method="POST" action="/banners/new${t}">
        <div class="row">
          <div><label>Banner ID (unique)</label><input name="bannerId" placeholder="naruto_pickup_1" required/></div>
          <div><label>Type</label>
            <select name="type">
              <option value="pickup">Pick Up</option>
              <option value="regular">Regular</option>
            </select>
          </div>
        </div>
        <div><label>Banner Name</label><input name="name" placeholder="Pick Up! Naruto" required/></div>
        <div><label>Anime</label><input name="anime" placeholder="Naruto" required/></div>
        <div><label>Image URL</label><input name="imageUrl" placeholder="https://..."/></div>
        <div><label>Description (shown in dropdown)</label><input name="description" placeholder="Banner featuring Naruto characters"/></div>
        <div class="row">
          <div><label>Starts At</label><input type="date" name="startsAt" required/></div>
          <div><label>Ends At (leave empty = permanent)</label><input type="date" name="endsAt"/></div>
        </div>
        <div class="row3">
          <div><label>Common %</label><input type="number" name="rateCommon" value="60" min="0" max="100"/></div>
          <div><label>Rare %</label><input type="number" name="rateRare" value="25" min="0" max="100"/></div>
          <div><label>Special %</label><input type="number" name="rateSpecial" value="12" min="0" max="100"/></div>
        </div>
        <div class="row">
          <div><label>Exceptional %</label><input type="number" name="rateExceptional" value="3" min="0" max="100"/></div>
          <div><label>Hard Pity (pulls)</label><input type="number" name="hardPity" value="90"/></div>
        </div>
        <div style="display:flex;gap:10px">
          <button type="submit">Create Banner</button>
          <a href="/banners${t}" class="btn btn-red">Cancel</a>
        </div>
      </form>
    </div>
  `, req.token));
});

app.post("/banners/new", auth, async (req, res) => {
  const t = q(req.token);
  try {
    const { bannerId, name, anime, type, imageUrl, description, startsAt, endsAt, rateCommon, rateRare, rateSpecial, rateExceptional, hardPity } = req.body;
    await Banner.create({
      bannerId, name, anime, type,
      imageUrl: imageUrl || null,
      description: description || null,
      startsAt: new Date(startsAt),
      endsAt: endsAt ? new Date(endsAt) : null,
      rates: {
        common: parseFloat(rateCommon),
        rare: parseFloat(rateRare),
        special: parseFloat(rateSpecial),
        exceptional: parseFloat(rateExceptional),
      },
      pity: { hardPity: parseInt(hardPity), softPityStart: 75 },
      pool: { common: [], rare: [], special: [], exceptional: [] },
      featuredCards: [],
    });
    res.redirect(`/banners${t}&msg=Banner created`);
  } catch (err) {
    res.send(renderPage("Error", `<div class="alert alert-red">${err.message}</div><a href="/banners/new${t}" class="btn">Back</a>`, req.token));
  }
});

app.get("/banners/:id/edit", auth, async (req, res) => {
  const t = q(req.token);
  const banner = await Banner.findOne({ bannerId: req.params.id });
  if (!banner) return res.redirect(`/banners${t}`);

  const fmt = (d) => d ? new Date(d).toISOString().slice(0, 10) : "";

  res.send(renderPage(`Edit — ${banner.name}`, `
    <div class="card" style="max-width:600px">
      <form method="POST" action="/banners/${banner.bannerId}/edit${t}">
        <div><label>Banner Name</label><input name="name" value="${banner.name}" required/></div>
        <div><label>Anime</label><input name="anime" value="${banner.anime}" required/></div>
        <div><label>Image URL</label><input name="imageUrl" value="${banner.imageUrl || ""}"/></div>
        <div><label>Description</label><input name="description" value="${banner.description || ""}"/></div>
        <div class="row">
          <div><label>Starts At</label><input type="date" name="startsAt" value="${fmt(banner.startsAt)}"/></div>
          <div><label>Ends At</label><input type="date" name="endsAt" value="${fmt(banner.endsAt)}"/></div>
        </div>
        <div class="row3">
          <div><label>Common %</label><input type="number" name="rateCommon" value="${banner.rates.common}"/></div>
          <div><label>Rare %</label><input type="number" name="rateRare" value="${banner.rates.rare}"/></div>
          <div><label>Special %</label><input type="number" name="rateSpecial" value="${banner.rates.special}"/></div>
        </div>
        <div class="row">
          <div><label>Exceptional %</label><input type="number" name="rateExceptional" value="${banner.rates.exceptional}"/></div>
          <div><label>Hard Pity</label><input type="number" name="hardPity" value="${banner.pity.hardPity}"/></div>
        </div>
        <div style="display:flex;gap:10px">
          <button type="submit">Save Changes</button>
          <a href="/banners${t}" class="btn btn-red">Cancel</a>
        </div>
      </form>
    </div>
  `, req.token));
});

app.post("/banners/:id/edit", auth, async (req, res) => {
  const t = q(req.token);
  const { name, anime, imageUrl, description, startsAt, endsAt, rateCommon, rateRare, rateSpecial, rateExceptional, hardPity } = req.body;
  await Banner.findOneAndUpdate({ bannerId: req.params.id }, {
    name, anime,
    imageUrl: imageUrl || null,
    description: description || null,
    startsAt: new Date(startsAt),
    endsAt: endsAt ? new Date(endsAt) : null,
    rates: { common: parseFloat(rateCommon), rare: parseFloat(rateRare), special: parseFloat(rateSpecial), exceptional: parseFloat(rateExceptional) },
    "pity.hardPity": parseInt(hardPity),
  });
  res.redirect(`/banners${t}`);
});

app.get("/banners/:id/toggle", auth, async (req, res) => {
  const t = q(req.token);
  const banner = await Banner.findOne({ bannerId: req.params.id });
  if (banner) await banner.updateOne({ isActive: !banner.isActive });
  res.redirect(`/banners${t}`);
});

// Banner pool manager
app.get("/banners/:id/pool", auth, async (req, res) => {
  const t = q(req.token);
  const banner = await Banner.findOne({ bannerId: req.params.id });
  if (!banner) return res.redirect(`/banners${t}`);

  const allCards = await Card.find({ isAvailable: true }).sort({ anime: 1, name: 1 });

  const poolIds = new Set([
    ...banner.pool.common, ...banner.pool.rare,
    ...banner.pool.special, ...banner.pool.exceptional,
  ]);
  const featuredIds = new Set(banner.featuredCards);

  const rarityBadge = { common: "badge-gray", rare: "badge-blue", special: "badge-purple", exceptional: "badge-yellow" };

  const cardRows = allCards.map(c => {
    const inPool = poolIds.has(c.cardId);
    const isFeatured = featuredIds.has(c.cardId);
    return `<tr>
      <td><strong>${c.name}</strong></td>
      <td>${c.anime}</td>
      <td><span class="badge ${rarityBadge[c.rarity]}">${c.rarity}</span></td>
      <td>${c.role}</td>
      <td>
        <form method="POST" action="/banners/${banner.bannerId}/pool${t}" style="display:inline">
          <input type="hidden" name="cardId" value="${c.cardId}"/>
          <input type="hidden" name="action" value="${inPool ? "remove" : "add"}"/>
          <button type="submit" class="btn btn-sm ${inPool ? "btn-red" : "btn-green"}">${inPool ? "Remove" : "Add"}</button>
        </form>
        ${inPool ? `
        <form method="POST" action="/banners/${banner.bannerId}/featured${t}" style="display:inline">
          <input type="hidden" name="cardId" value="${c.cardId}"/>
          <input type="hidden" name="action" value="${isFeatured ? "unfeature" : "feature"}"/>
          <button type="submit" class="btn btn-sm ${isFeatured ? "" : "btn-green"}">${isFeatured ? "★ Featured" : "☆ Feature"}</button>
        </form>` : ""}
      </td>
    </tr>`;
  }).join("");

  res.send(renderPage(`Pool — ${banner.name}`, `
    <p style="color:#888;margin-bottom:16px">
      Pool: ${poolIds.size} cards — Featured: ${featuredIds.size}
      <a href="/banners${t}" style="margin-left:16px" class="btn btn-sm">← Back</a>
    </p>
    <div class="card">
      <table>
        <thead><tr><th>Name</th><th>Anime</th><th>Rarity</th><th>Role</th><th>Action</th></tr></thead>
        <tbody>${cardRows || "<tr><td colspan='5' style='color:#666;text-align:center'>No cards in DB yet</td></tr>"}</tbody>
      </table>
    </div>
  `, req.token));
});

app.post("/banners/:id/pool", auth, async (req, res) => {
  const t = q(req.token);
  const { cardId, action } = req.body;
  const banner = await Banner.findOne({ bannerId: req.params.id });
  const card = await Card.findOne({ cardId });
  if (!banner || !card) return res.redirect(`/banners/${req.params.id}/pool${t}`);

  if (action === "add") {
    await Banner.findOneAndUpdate(
      { bannerId: req.params.id },
      { $addToSet: { [`pool.${card.rarity}`]: cardId } }
    );
  } else {
    await Banner.findOneAndUpdate(
      { bannerId: req.params.id },
      {
        $pull: {
          [`pool.${card.rarity}`]: cardId,
          featuredCards: cardId,
        }
      }
    );
  }
  res.redirect(`/banners/${req.params.id}/pool${t}`);
});

app.post("/banners/:id/featured", auth, async (req, res) => {
  const t = q(req.token);
  const { cardId, action } = req.body;
  if (action === "feature") {
    await Banner.findOneAndUpdate({ bannerId: req.params.id }, { $addToSet: { featuredCards: cardId } });
  } else {
    await Banner.findOneAndUpdate({ bannerId: req.params.id }, { $pull: { featuredCards: cardId } });
  }
  res.redirect(`/banners/${req.params.id}/pool${t}`);
});

// ─── CARDS ────────────────────────────────────────────────────────────────────
app.get("/cards", auth, async (req, res) => {
  const t = q(req.token);
  const cards = await Card.find().sort({ anime: 1, rarity: 1, name: 1 });
  const rarityBadge = { common: "badge-gray", rare: "badge-blue", special: "badge-purple", exceptional: "badge-yellow" };
  const roleBadge = { dps: "badge-red", support: "badge-green", tank: "badge-blue" };

  const rows = cards.map(c => `<tr>
    <td>${c.imageUrl ? `<img src="${c.imageUrl}" style="width:40px;height:40px;object-fit:cover;border-radius:4px"/>` : "—"}</td>
    <td><strong>${c.name}</strong><br/><small style="color:#666">${c.cardId}</small></td>
    <td>${c.anime}</td>
    <td><span class="badge ${rarityBadge[c.rarity]}">${c.rarity}</span></td>
    <td><span class="badge ${roleBadge[c.role]}">${c.role}</span></td>
    <td>${c.totalPrints}</td>
    <td>
      <a href="/cards/${c.cardId}/edit${t}" class="btn btn-sm">Edit</a>
    </td>
  </tr>`).join("");

  res.send(renderPage("Cards", `
    <a href="/cards/new${t}" class="btn" style="margin-bottom:20px;display:inline-block">+ New Card</a>
    <div class="card">
      <table>
        <thead><tr><th>Art</th><th>Card</th><th>Anime</th><th>Rarity</th><th>Role</th><th>Prints</th><th>Actions</th></tr></thead>
        <tbody>${rows || "<tr><td colspan='7' style='color:#666;text-align:center'>No cards yet</td></tr>"}</tbody>
      </table>
    </div>
  `, req.token));
});

app.get("/cards/new", auth, (req, res) => {
  const t = q(req.token);
  res.send(renderPage("New Card", `
    <div class="card" style="max-width:600px">
      <form method="POST" action="/cards/new${t}">
        <div class="row">
          <div><label>Card ID (unique)</label><input name="cardId" placeholder="naruto_001" required/></div>
          <div><label>Name</label><input name="name" placeholder="Naruto Uzumaki" required/></div>
        </div>
        <div class="row">
          <div><label>Anime</label><input name="anime" placeholder="Naruto" required/></div>
          <div><label>Image URL</label><input name="imageUrl" placeholder="https://..." required/></div>
        </div>
        <div class="row">
          <div><label>Rarity</label>
            <select name="rarity">
              <option value="common">Common</option>
              <option value="rare">Rare</option>
              <option value="special">Special</option>
              <option value="exceptional">Exceptional</option>
            </select>
          </div>
          <div><label>Role</label>
            <select name="role">
              <option value="dps">DPS</option>
              <option value="support">Support</option>
              <option value="tank">Tank</option>
            </select>
          </div>
        </div>
        <div><label>Banner Type</label>
          <select name="bannerType">
            <option value="regular">Regular</option>
            <option value="pickup">Pick Up</option>
          </select>
        </div>
        <div class="row3">
          <div><label>Base Damage</label><input type="number" name="baseDamage" value="100"/></div>
          <div><label>Base Mana</label><input type="number" name="baseMana" value="100"/></div>
          <div><label>Base HP</label><input type="number" name="baseHp" value="100"/></div>
        </div>
        <div style="display:flex;gap:10px">
          <button type="submit">Create Card</button>
          <a href="/cards${t}" class="btn btn-red">Cancel</a>
        </div>
      </form>
    </div>
  `, req.token));
});

app.post("/cards/new", auth, async (req, res) => {
  const t = q(req.token);
  try {
    const { cardId, name, anime, imageUrl, rarity, role, bannerType, baseDamage, baseMana, baseHp } = req.body;
    await Card.create({
      cardId, name, anime, imageUrl, rarity, role, bannerType,
      baseStats: { damage: parseInt(baseDamage), mana: parseInt(baseMana), hp: parseInt(baseHp) },
    });
    res.redirect(`/cards${t}`);
  } catch (err) {
    res.send(renderPage("Error", `<div class="alert alert-red">${err.message}</div><a href="/cards/new${t}" class="btn">Back</a>`, req.token));
  }
});

app.get("/cards/:id/edit", auth, async (req, res) => {
  const t = q(req.token);
  const card = await Card.findOne({ cardId: req.params.id });
  if (!card) return res.redirect(`/cards${t}`);

  res.send(renderPage(`Edit — ${card.name}`, `
    <div class="card" style="max-width:600px">
      ${card.imageUrl ? `<img src="${card.imageUrl}" style="height:120px;border-radius:8px;margin-bottom:16px"/>` : ""}
      <form method="POST" action="/cards/${card.cardId}/edit${t}">
        <div class="row">
          <div><label>Name</label><input name="name" value="${card.name}" required/></div>
          <div><label>Anime</label><input name="anime" value="${card.anime}" required/></div>
        </div>
        <div><label>Image URL</label><input name="imageUrl" value="${card.imageUrl || ""}"/></div>
        <div class="row">
          <div><label>Rarity</label>
            <select name="rarity">
              ${["common","rare","special","exceptional"].map(r => `<option value="${r}" ${card.rarity===r?"selected":""}>${r}</option>`).join("")}
            </select>
          </div>
          <div><label>Role</label>
            <select name="role">
              ${["dps","support","tank"].map(r => `<option value="${r}" ${card.role===r?"selected":""}>${r}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="row3">
          <div><label>Base Damage</label><input type="number" name="baseDamage" value="${card.baseStats.damage}"/></div>
          <div><label>Base Mana</label><input type="number" name="baseMana" value="${card.baseStats.mana}"/></div>
          <div><label>Base HP</label><input type="number" name="baseHp" value="${card.baseStats.hp}"/></div>
        </div>
        <div style="display:flex;gap:10px">
          <button type="submit">Save</button>
          <a href="/cards${t}" class="btn btn-red">Cancel</a>
        </div>
      </form>
    </div>
  `, req.token));
});

app.post("/cards/:id/edit", auth, async (req, res) => {
  const t = q(req.token);
  const { name, anime, imageUrl, rarity, role, baseDamage, baseMana, baseHp } = req.body;
  await Card.findOneAndUpdate({ cardId: req.params.id }, {
    name, anime, imageUrl: imageUrl || null, rarity, role,
    baseStats: { damage: parseInt(baseDamage), mana: parseInt(baseMana), hp: parseInt(baseHp) },
  });
  res.redirect(`/cards${t}`);
});

// ─── RAIDS ────────────────────────────────────────────────────────────────────
app.get("/raids", auth, async (req, res) => {
  const t = q(req.token);
  const raids = await Raid.find().sort({ createdAt: -1 }).limit(20);
  const statusBadge = { active: "badge-green", defeated: "badge-gray", expired: "badge-red" };

  const rows = raids.map(r => {
    const hpPct = Math.round((r.currentHp / r.maxHp) * 100);
    return `<tr>
      <td><strong>${r.name}</strong><br/><small style="color:#666">${r.anime}</small></td>
      <td><span class="badge ${statusBadge[r.status]}">${r.status}</span></td>
      <td>${r.currentHp.toLocaleString()} / ${r.maxHp.toLocaleString()} (${hpPct}%)</td>
      <td>${r.participants.length}</td>
      <td>${new Date(r.endsAt).toLocaleDateString("en-GB")}</td>
    </tr>`;
  }).join("");

  res.send(renderPage("Raids", `
    <div class="card" style="max-width:500px;margin-bottom:24px">
      <h2>Create New Raid</h2>
      <form method="POST" action="/raids/new${t}">
        <div class="row">
          <div><label>Boss Name</label><input name="name" placeholder="Pain" required/></div>
          <div><label>Anime</label><input name="anime" placeholder="Naruto" required/></div>
        </div>
        <div><label>Image URL (optional)</label><input name="imageUrl" placeholder="https://..."/></div>
        <div class="row">
          <div><label>HP</label><input type="number" name="hp" value="1000000" min="1000" required/></div>
          <div><label>Duration (hours)</label><input type="number" name="hours" value="48" min="1" required/></div>
        </div>
        <button type="submit">Create Raid</button>
      </form>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>Boss</th><th>Status</th><th>HP</th><th>Participants</th><th>Ends</th></tr></thead>
        <tbody>${rows || "<tr><td colspan='5' style='color:#666;text-align:center'>No raids yet</td></tr>"}</tbody>
      </table>
    </div>
  `, req.token));
});

app.post("/raids/new", auth, async (req, res) => {
  const t = q(req.token);
  const { name, anime, imageUrl, hp, hours } = req.body;
  await Raid.updateMany({ status: "active" }, { status: "expired" });
  const raidId = `raid_${Date.now()}`;
  const endsAt = new Date(Date.now() + parseInt(hours) * 60 * 60 * 1000);
  await Raid.create({ raidId, name, anime, imageUrl: imageUrl || null, maxHp: parseInt(hp), currentHp: parseInt(hp), endsAt });
  res.redirect(`/raids${t}`);
});

// ─── PLAYERS ──────────────────────────────────────────────────────────────────
app.get("/players", auth, async (req, res) => {
  const t = q(req.token);
  const players = await User.find().sort({ createdAt: -1 });

  const rows = players.map(p => `<tr>
    <td><strong>${p.username}</strong><br/><small style="color:#666">${p.userId}</small></td>
    <td>${p.currency.gold.toLocaleString()}</td>
    <td>${p.currency.regularTickets} / ${p.currency.pickupTickets}</td>
    <td>${p.combatPower.toLocaleString()}</td>
    <td>${p.loginStreak}</td>
    <td>
      <a href="/players/${p.userId}/give${t}" class="btn btn-sm btn-green">Give</a>
    </td>
  </tr>`).join("");

  res.send(renderPage("Players", `
    <div class="card">
      <table>
        <thead><tr><th>Player</th><th>Gold</th><th>Tickets (R/P)</th><th>CP</th><th>Streak</th><th>Actions</th></tr></thead>
        <tbody>${rows || "<tr><td colspan='6' style='color:#666;text-align:center'>No players yet</td></tr>"}</tbody>
      </table>
    </div>
  `, req.token));
});

app.get("/players/:id/give", auth, async (req, res) => {
  const t = q(req.token);
  const player = await User.findOne({ userId: req.params.id });
  if (!player) return res.redirect(`/players${t}`);

  res.send(renderPage(`Give Currency — ${player.username}`, `
    <div class="card" style="max-width:400px">
      <form method="POST" action="/players/${player.userId}/give${t}">
        <div><label>Currency Type</label>
          <select name="type">
            <option value="gold">Gold</option>
            <option value="regularTickets">Regular Tickets</option>
            <option value="pickupTickets">Pick Up Tickets</option>
            <option value="premiumCurrency">Premium</option>
          </select>
        </div>
        <div><label>Amount</label><input type="number" name="amount" value="1000" min="1" required/></div>
        <div style="display:flex;gap:10px">
          <button type="submit">Give</button>
          <a href="/players${t}" class="btn btn-red">Cancel</a>
        </div>
      </form>
    </div>
  `, req.token));
});

app.post("/players/:id/give", auth, async (req, res) => {
  const t = q(req.token);
  const { type, amount } = req.body;
  await User.findOneAndUpdate(
    { userId: req.params.id },
    { $inc: { [`currency.${type}`]: parseInt(amount) } }
  );
  res.redirect(`/players${t}`);
});

// ─── Start ────────────────────────────────────────────────────────────────────
function startDashboard() {
  app.listen(PORT, () => {
    logger.info(`Dashboard running on port ${PORT}`);
  });
}

module.exports = { startDashboard };
