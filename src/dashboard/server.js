const express      = require("express");
const path         = require("path");
const crypto       = require("crypto");
const cookieParser = require("cookie-parser");
const multer       = require("multer");
const fs           = require("fs");

const Banner          = require("../models/Banner");
const Card            = require("../models/Card");
const Raid            = require("../models/Raid");
const User            = require("../models/User");
const PlayerCard      = require("../models/PlayerCard");
const AuditLog        = require("../models/AuditLog");
const ScheduledEvent  = require("../models/ScheduledEvent");
const ScheduledMessage = require("../models/ScheduledMessage");
const logger          = require("../utils/logger");

const app    = express();
const PORT   = process.env.DASHBOARD_PORT || 3000;
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

// Discord OAuth2 config
const DISCORD_CLIENT_ID     = process.env.CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DASHBOARD_URL         = (process.env.DASHBOARD_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const REDIRECT_URI          = `${DASHBOARD_URL}/auth/callback`;
const DEFAULT_ADMIN_ID      = "912376040142307419";
// Members who can access — add Discord user IDs here or promote via /team
// Admin is always DEFAULT_ADMIN_ID

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));
app.use(cookieParser(SECRET));

const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use("/uploads", express.static(UPLOADS_DIR));

// ─── Session ──────────────────────────────────────────────────────────────────
function setSession(res, data) {
  const payload = JSON.stringify(data);
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64");
  res.cookie("sess", `${Buffer.from(payload).toString("base64")}.${sig}`, {
    httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function getSession(req) {
  const cookie = req.cookies?.sess;
  if (!cookie) return null;
  const [b64, sig] = cookie.split(".");
  if (!b64 || !sig) return null;
  const payload = Buffer.from(b64, "base64").toString();
  const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("base64");
  if (sig !== expected) return null;
  try { return JSON.parse(payload); } catch { return null; }
}

// ─── Auth middleware ──────────────────────────────────────────────────────────
function auth(req, res, next) {
  const sess = getSession(req);
  if (!sess) return res.redirect("/login");
  req.user = sess;
  next();
}

function adminOnly(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).send(renderPage("Forbidden", `<div class="alert alert-red">Admin access required.</div>`, req.user));
  next();
}

function editorOrAdmin(req, res, next) {
  if (!["admin", "editor"].includes(req.user?.role)) return res.status(403).send(renderPage("Forbidden", `<div class="alert alert-red">Editor access required.</div>`, req.user));
  next();
}

// ─── Audit ────────────────────────────────────────────────────────────────────
async function audit(user, action, resource, resourceId, description, before = null, after = null) {
  await AuditLog.create({ performedBy: user.username, role: user.role, action, resource, resourceId, description, before, after });
}

// ─── Layout ───────────────────────────────────────────────────────────────────
function renderPage(title, content, user = null) {
  const isAdmin = user?.role === "admin";
  const isEditor = ["admin","editor"].includes(user?.role);
  const nav = user ? `
    <nav>
      <span class="brand">🦆 DuckyTCG</span>
      <a href="/">Dashboard</a>
      ${isEditor ? `<a href="/banners">Banners</a><a href="/cards">Cards</a><a href="/media">Media</a><a href="/calendar">Calendar</a>` : ""}
      ${isAdmin ? `<a href="/raids">Raids</a><a href="/players">Players</a>` : ""}
      <a href="/messages">Messages</a>
      ${isAdmin ? `<a href="/team">Team</a>` : ""}
      <a href="/audit">Audit</a>
      <span style="margin-left:auto;display:flex;align-items:center;gap:8px">
        ${user.avatar ? `<img src="https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png" style="width:28px;height:28px;border-radius:50%"/>` : ""}
        <span style="font-size:13px;color:#a78bfa">${user.username}</span>
        <span style="font-size:11px;color:#666">(${user.role})</span>
      </span>
      <span id="notif-bell" style="cursor:pointer;font-size:18px;position:relative" onclick="toggleNotif()">
        🔔<span id="notif-count" style="display:none;position:absolute;top:-4px;right:-6px;background:#ef4444;color:#fff;font-size:9px;font-weight:700;padding:1px 4px;border-radius:999px"></span>
      </span>
      <div id="notif-panel" style="display:none;position:absolute;top:48px;right:80px;width:320px;background:#1a1a24;border:1px solid #2d2d3d;border-radius:8px;z-index:999;max-height:400px;overflow-y:auto;box-shadow:0 8px 24px #0008">
        <div style="padding:10px 14px;border-bottom:1px solid #2d2d3d;font-size:13px;font-weight:600;color:#e0e0e0">Recent Activity</div>
        <div id="notif-list" style="padding:8px 0"></div>
      </div>
      <a href="/logout" style="color:#ef4444;font-size:13px">Logout</a>
    </nav>
    <script>
    async function toggleNotif() {
      const panel = document.getElementById("notif-panel");
      const isOpen = panel.style.display !== "none";
      panel.style.display = isOpen ? "none" : "block";
      if (!isOpen) {
        const res = await fetch("/api/notifications");
        const data = await res.json();
        const list = document.getElementById("notif-list");
        const badge = { create:"#16a34a", update:"#2563eb", delete:"#dc2626" };
        list.innerHTML = data.map(n => \`<div style="padding:8px 14px;border-bottom:1px solid #2d2d3d;font-size:12px">
          <span style="background:\${badge[n.action]||"#374151"};color:#fff;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600">\${n.action}</span>
          <span style="color:#a78bfa;margin:0 4px">\${n.performedBy}</span>
          <span style="color:#e0e0e0">\${n.description}</span>
          <div style="color:#666;font-size:10px;margin-top:2px">\${new Date(n.createdAt).toLocaleString("en-GB")}</div>
        </div>\`).join("") || "<div style='padding:12px 14px;color:#666;font-size:12px'>No recent activity</div>";
      }
    }
    // Poll notification count every 30s
    async function updateNotifCount() {
      try {
        const res = await fetch("/api/notifications/count");
        const { count } = await res.json();
        const el = document.getElementById("notif-count");
        if (count > 0) { el.textContent = count > 9 ? "9+" : count; el.style.display = "inline"; }
        else { el.style.display = "none"; }
      } catch {}
    }
    updateNotifCount();
    setInterval(updateNotifCount, 30000);
    document.addEventListener("click", e => {
      if (!e.target.closest("#notif-bell")) document.getElementById("notif-panel").style.display = "none";
    });
    </script>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title} — DuckyTCG Admin</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,sans-serif;background:#0f0f13;color:#e0e0e0;min-height:100vh}
    a{color:#a78bfa;text-decoration:none}a:hover{text-decoration:underline}
    nav{background:#1a1a24;border-bottom:1px solid #2d2d3d;padding:10px 24px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;position:relative}
    nav .brand{font-weight:700;color:#a78bfa;font-size:17px;margin-right:8px}
    nav a{color:#c4b5fd;font-size:13px}
    .container{max-width:1200px;margin:0 auto;padding:28px 24px}
    h1{font-size:22px;font-weight:600;margin-bottom:20px;color:#f0f0f0}
    h2{font-size:17px;font-weight:600;margin-bottom:14px;color:#e0e0e0}
    .card{background:#1a1a24;border:1px solid #2d2d3d;border-radius:10px;padding:20px;margin-bottom:18px}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;margin-bottom:20px}
    .stat{background:#1a1a24;border:1px solid #2d2d3d;border-radius:8px;padding:18px;text-align:center}
    .stat .value{font-size:30px;font-weight:700;color:#a78bfa}
    .stat .label{font-size:12px;color:#888;margin-top:4px}
    form{display:flex;flex-direction:column;gap:11px}
    label{font-size:12px;color:#aaa;margin-bottom:2px;display:block}
    input,select,textarea{background:#0f0f13;border:1px solid #2d2d3d;border-radius:6px;color:#e0e0e0;padding:7px 11px;font-size:13px;width:100%}
    input:focus,select:focus,textarea:focus{outline:none;border-color:#a78bfa}
    .row{display:grid;grid-template-columns:1fr 1fr;gap:11px}
    .row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:11px}
    button,.btn{background:#7c3aed;color:#fff;border:none;border-radius:6px;padding:8px 16px;font-size:13px;cursor:pointer;font-weight:500;display:inline-block}
    button:hover,.btn:hover{background:#6d28d9}
    .btn-red{background:#dc2626}.btn-red:hover{background:#b91c1c}
    .btn-green{background:#16a34a}.btn-green:hover{background:#15803d}
    .btn-sm{padding:4px 10px;font-size:12px}
    .btn-gray{background:#374151}.btn-gray:hover{background:#1f2937}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th{text-align:left;padding:9px 11px;color:#888;font-weight:500;border-bottom:1px solid #2d2d3d;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
    td{padding:9px 11px;border-bottom:1px solid #1e1e2a;vertical-align:middle}
    tr:last-child td{border-bottom:none}
    .badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600}
    .badge-purple{background:#3b1d6e;color:#c4b5fd}.badge-blue{background:#1d3461;color:#93c5fd}
    .badge-gray{background:#2d2d3d;color:#9ca3af}.badge-green{background:#14532d;color:#86efac}
    .badge-red{background:#450a0a;color:#fca5a5}.badge-yellow{background:#451a03;color:#fcd34d}
    .badge-orange{background:#431407;color:#fdba74}
    .alert{padding:11px 15px;border-radius:6px;margin-bottom:14px;font-size:13px}
    .alert-green{background:#14532d;color:#86efac;border:1px solid #166534}
    .alert-red{background:#450a0a;color:#fca5a5;border:1px solid #7f1d1d}
    /* Calendar */
    .cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
    .cal-day{background:#1a1a24;border:1px solid #2d2d3d;border-radius:6px;padding:6px;min-height:80px;font-size:12px}
    .cal-day.today{border-color:#7c3aed}
    .cal-day.other-month{opacity:.35}
    .cal-day-num{font-size:11px;color:#666;margin-bottom:4px}
    .cal-event{border-radius:3px;padding:2px 5px;font-size:10px;margin-bottom:2px;cursor:pointer;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    .cal-header{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:3px}
    .cal-header-day{text-align:center;font-size:11px;color:#888;padding:4px 0;text-transform:uppercase}
  </style>
</head>
<body>
  ${nav}
  <div class="container">
    <h1>${title}</h1>
    ${content}
  </div>
</body>
</html>`;
}


// ─── API ──────────────────────────────────────────────────────────────────────
app.get("/api/notifications", auth, async (req, res) => {
  const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(20);
  res.json(logs);
});

app.get("/api/notifications/count", auth, async (req, res) => {
  const since = new Date(Date.now() - 60 * 60 * 1000); // last hour
  const count = await AuditLog.countDocuments({ createdAt: { $gte: since } });
  res.json({ count });
});

app.get("/api/pull-stats", auth, async (req, res) => {
  const now = new Date();
  const todayStart  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart   = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 7);
  const [today, week] = await Promise.all([
    PlayerCard.countDocuments({ createdAt: { $gte: todayStart } }),
    PlayerCard.countDocuments({ createdAt: { $gte: weekStart } }),
  ]);
  res.json({ today, week });
});

// ─── Discord OAuth2 ───────────────────────────────────────────────────────────
app.get("/login", (req, res) => {
  const sess = getSession(req);
  if (sess) return res.redirect("/");
  const state = crypto.randomBytes(16).toString("hex");
  res.cookie("oauth_state", state, { httpOnly: true, maxAge: 5 * 60 * 1000 });
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "identify",
    state,
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get("/auth/callback", async (req, res) => {
  const { code, state } = req.query;
  const savedState = req.cookies?.oauth_state;

  if (!code || !state || state !== savedState) return res.redirect("/login");
  res.clearCookie("oauth_state");

  try {
    // Exchange code for token
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.redirect("/login?err=token");

    // Get Discord user info
    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const discordUser = await userRes.json();

    // Check if allowed
    const isDefaultAdmin = discordUser.id === DEFAULT_ADMIN_ID;

    // Check if they have a TeamMember record (for editors added manually)
    // We reuse TeamMember model but with discordId instead of password
    const { default: TeamMember } = await import(`../models/TeamMember.js`).catch(() => ({ default: null }));

    let role = null;
    if (isDefaultAdmin) {
      role = "admin";
    } else {
      // Check TeamMember by discordId
      const member = await require("../models/TeamMember").findOne({ discordId: discordUser.id, isActive: true });
      if (member) role = member.role;
    }

    if (!role) {
      return res.send(renderPage("Access Denied", `
        <div class="card" style="max-width:400px;margin:60px auto;text-align:center">
          <div style="font-size:40px;margin-bottom:16px">🔒</div>
          <h2>Access Denied</h2>
          <p style="color:#888;margin-top:8px">Your Discord account is not authorized to access this dashboard.</p>
          <p style="color:#666;font-size:12px;margin-top:8px">ID: ${discordUser.id}</p>
          <a href="/logout" class="btn btn-red" style="margin-top:16px;display:inline-block">Back</a>
        </div>
      `));
    }

    setSession(res, {
      discordId: discordUser.id,
      username: discordUser.global_name || discordUser.username,
      avatar: discordUser.avatar,
      role,
    });

    res.redirect("/");
  } catch (err) {
    logger.error("OAuth2 error:", err);
    res.redirect("/login?err=1");
  }
});

app.get("/logout", (req, res) => {
  res.clearCookie("sess");
  res.redirect("/login");
});

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
app.get("/", auth, async (req, res) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart  = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 7);
  const [userCount, cardCount, bannerCount, pcCount, pullsToday, pullsWeek] = await Promise.all([
    User.countDocuments(), Card.countDocuments(),
    Banner.countDocuments({ isActive: true }),
    PlayerCard.countDocuments({ isBurned: false }),
    PlayerCard.countDocuments({ createdAt: { $gte: todayStart } }),
    PlayerCard.countDocuments({ createdAt: { $gte: weekStart } }),
  ]);
  const topPlayers = await User.find().sort({ combatPower: -1 }).limit(5);
  const recentLogs = await AuditLog.find().sort({ createdAt: -1 }).limit(6);
  const upcomingEvents = await ScheduledEvent.find({ startDate: { $gte: new Date() } }).sort({ startDate: 1 }).limit(5);
  const pendingMessages = await ScheduledMessage.find({ sent: false, scheduledAt: { $gte: new Date() } }).sort({ scheduledAt: 1 }).limit(5);

  const actionBadge = { create:"badge-green", update:"badge-blue", delete:"badge-red" };
  const logRows = recentLogs.map(l => `<tr>
    <td><span class="badge ${actionBadge[l.action]||"badge-gray"}">${l.action}</span></td>
    <td>${l.resource}</td><td>${l.description}</td>
    <td><span class="badge badge-purple">${l.performedBy}</span></td>
    <td style="color:#666;font-size:11px">${new Date(l.createdAt).toLocaleString("en-GB")}</td>
  </tr>`).join("");

  const eventRows = upcomingEvents.map(e => `<tr>
    <td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${e.color};margin-right:6px"></span><strong>${e.title}</strong></td>
    <td><span class="badge badge-gray">${e.type}</span></td>
    <td style="color:#888;font-size:12px">${new Date(e.startDate).toLocaleDateString("en-GB")}</td>
  </tr>`).join("");

  const msgRows = pendingMessages.map(m => `<tr>
    <td><strong>${m.title}</strong></td>
    <td style="color:#888;font-size:12px">${m.channelId}</td>
    <td style="color:#888;font-size:12px">${new Date(m.scheduledAt).toLocaleString("en-GB")}</td>
  </tr>`).join("");

  res.send(renderPage("Dashboard", `
    <div class="grid">
      <div class="stat"><div class="value">${userCount}</div><div class="label">Players</div></div>
      <div class="stat"><div class="value">${cardCount}</div><div class="label">Cards</div></div>
      <div class="stat"><div class="value">${bannerCount}</div><div class="label">Active Banners</div></div>
      <div class="stat"><div class="value">${pcCount}</div><div class="label">Cards Owned</div></div>
      <div class="stat"><div class="value">${pullsToday}</div><div class="label">Pulls Today</div></div>
      <div class="stat"><div class="value">${pullsWeek}</div><div class="label">Pulls This Week</div></div>
    </div>
    <div class="row" style="gap:18px">
      <div>
        <div class="card">
          <h2>Top Players</h2>
          <table><thead><tr><th>#</th><th>Username</th><th>CP</th><th>Cards</th></tr></thead>
          <tbody>${topPlayers.map((p,i)=>`<tr><td>${i+1}</td><td>${p.username}</td><td>${p.combatPower.toLocaleString()}</td><td>${p.stats.totalCardsEverObtained}</td></tr>`).join("")}</tbody></table>
        </div>
        <div class="card">
          <h2>Recent Activity</h2>
          <table><thead><tr><th>Action</th><th>Resource</th><th>Description</th><th>By</th><th>When</th></tr></thead>
          <tbody>${logRows||"<tr><td colspan='5' style='color:#666'>No activity yet</td></tr>"}</tbody></table>
        </div>
      </div>
      <div>
        <div class="card">
          <h2>Upcoming Events <a href="/calendar" class="btn btn-sm btn-gray" style="margin-left:8px">View Calendar</a></h2>
          <table><thead><tr><th>Event</th><th>Type</th><th>Date</th></tr></thead>
          <tbody>${eventRows||"<tr><td colspan='3' style='color:#666'>No upcoming events</td></tr>"}</tbody></table>
        </div>
        <div class="card">
          <h2>Scheduled Messages <a href="/messages" class="btn btn-sm btn-gray" style="margin-left:8px">Manage</a></h2>
          <table><thead><tr><th>Message</th><th>Channel</th><th>Scheduled</th></tr></thead>
          <tbody>${msgRows||"<tr><td colspan='3' style='color:#666'>No pending messages</td></tr>"}</tbody></table>
        </div>
      </div>
    </div>
  `, req.user));
});

// ─── CALENDAR ────────────────────────────────────────────────────────────────
app.get("/calendar", auth, editorOrAdmin, async (req, res) => {
  const now = new Date();
  const year  = parseInt(req.query.year  || now.getFullYear());
  const month = parseInt(req.query.month || now.getMonth());

  const start = new Date(year, month, 1);
  const end   = new Date(year, month + 1, 0);

  const events = await ScheduledEvent.find({
    startDate: { $gte: new Date(year, month - 1, 15), $lte: new Date(year, month + 1, 15) }
  });

  // Build calendar grid
  const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const monthName = start.toLocaleString("en-US", { month: "long", year: "numeric" });

  const prevMonth = month === 0 ? { year: year-1, month: 11 } : { year, month: month-1 };
  const nextMonth = month === 11 ? { year: year+1, month: 0 } : { year, month: month+1 };

  // Map events by date
  const eventMap = {};
  for (const e of events) {
    const key = new Date(e.startDate).toISOString().slice(0,10);
    if (!eventMap[key]) eventMap[key] = [];
    eventMap[key].push(e);
  }

  // First day of week offset
  const firstDow = start.getDay();
  const daysInMonth = end.getDate();
  const daysInPrev = new Date(year, month, 0).getDate();

  let cells = "";
  let dayCount = 0;

  // Previous month filler
  for (let i = firstDow - 1; i >= 0; i--) {
    cells += `<div class="cal-day other-month"><div class="cal-day-num">${daysInPrev - i}</div></div>`;
    dayCount++;
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const isToday = dateStr === now.toISOString().slice(0,10);
    const dayEvents = eventMap[dateStr] || [];
    const evHtml = dayEvents.slice(0,3).map(e =>
      `<div class="cal-event" style="background:${e.color}22;border-left:2px solid ${e.color};color:${e.color}" title="${e.title}">${e.title}</div>`
    ).join("") + (dayEvents.length > 3 ? `<div style="font-size:10px;color:#666">+${dayEvents.length-3} more</div>` : "");

    cells += `<div class="cal-day ${isToday?"today":""}"><div class="cal-day-num">${d}</div>${evHtml}</div>`;
    dayCount++;
  }

  // Next month filler
  const remaining = 42 - dayCount;
  for (let d = 1; d <= remaining; d++) {
    cells += `<div class="cal-day other-month"><div class="cal-day-num">${d}</div></div>`;
  }

  const headerDays = DAYS.map(d => `<div class="cal-header-day">${d}</div>`).join("");

  res.send(renderPage("Calendar", `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <div style="display:flex;gap:8px;align-items:center">
        <a href="/calendar?year=${prevMonth.year}&month=${prevMonth.month}" class="btn btn-gray btn-sm">◀</a>
        <h2 style="margin:0">${monthName}</h2>
        <a href="/calendar?year=${nextMonth.year}&month=${nextMonth.month}" class="btn btn-gray btn-sm">▶</a>
        <a href="/calendar?year=${now.getFullYear()}&month=${now.getMonth()}" class="btn btn-sm" style="margin-left:8px">Today</a>
      </div>
      <a href="/calendar/new" class="btn btn-green">+ Add Event</a>
    </div>
    <div class="cal-header">${headerDays}</div>
    <div class="cal-grid">${cells}</div>

    <div class="card" style="margin-top:24px">
      <h2>All Events</h2>
      <table>
        <thead><tr><th>Title</th><th>Type</th><th>Start</th><th>End</th><th>Actions</th></tr></thead>
        <tbody>${events.sort((a,b)=>a.startDate-b.startDate).map(e => `<tr>
          <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${e.color};margin-right:6px"></span><strong>${e.title}</strong></td>
          <td><span class="badge badge-gray">${e.type}</span></td>
          <td style="font-size:12px">${new Date(e.startDate).toLocaleDateString("en-GB")}</td>
          <td style="font-size:12px">${e.endDate ? new Date(e.endDate).toLocaleDateString("en-GB") : "—"}</td>
          <td>
            <a href="/calendar/${e._id}/edit" class="btn btn-sm">Edit</a>
            <a href="/calendar/${e._id}/delete" class="btn btn-sm btn-red" onclick="return confirm('Delete this event?')">Delete</a>
          </td>
        </tr>`).join("") || "<tr><td colspan='5' style='color:#666'>No events yet</td></tr>"}</tbody>
      </table>
    </div>
  `, req.user));
});

app.get("/calendar/new", auth, editorOrAdmin, async (req, res) => {
  const banners = await Banner.find().sort({ name: 1 });
  res.send(renderPage("New Event", `
    <div class="card" style="max-width:560px">
      <form method="POST" action="/calendar/new">
        <div><label>Title</label><input name="title" placeholder="Banner Release: Naruto" required/></div>
        <div class="row">
          <div><label>Type</label><select name="type">
            <option value="banner">Banner</option><option value="event">Event</option>
            <option value="raid">Raid</option><option value="maintenance">Maintenance</option><option value="other">Other</option>
          </select></div>
          <div><label>Color</label><input type="color" name="color" value="#7c3aed" style="height:38px;padding:2px 6px"/></div>
        </div>
        <div class="row">
          <div><label>Start Date</label><input type="datetime-local" name="startDate" required/></div>
          <div><label>End Date (optional)</label><input type="datetime-local" name="endDate"/></div>
        </div>
        <div><label>Linked Banner (optional)</label>
          <select name="bannerId">
            <option value="">— None —</option>
            ${banners.map(b=>`<option value="${b.bannerId}">${b.name}</option>`).join("")}
          </select>
        </div>
        <div><label>Description</label><textarea name="description" rows="3" placeholder="Event description..."></textarea></div>
        <div style="display:flex;gap:10px"><button type="submit">Create Event</button><a href="/calendar" class="btn btn-red">Cancel</a></div>
      </form>
    </div>
  `, req.user));
});

app.post("/calendar/new", auth, editorOrAdmin, async (req, res) => {
  const { title, type, color, startDate, endDate, bannerId, description } = req.body;
  await ScheduledEvent.create({
    title, type, color, description,
    startDate: new Date(startDate),
    endDate: endDate ? new Date(endDate) : null,
    bannerId: bannerId || null,
    createdBy: req.user.username,
  });
  await audit(req.user, "create", "event", title, `Created event "${title}"`, null, null);
  res.redirect("/calendar");
});

app.get("/calendar/:id/edit", auth, editorOrAdmin, async (req, res) => {
  const event = await ScheduledEvent.findById(req.params.id);
  if (!event) return res.redirect("/calendar");
  const banners = await Banner.find().sort({ name: 1 });
  const fmt = d => d ? new Date(d).toISOString().slice(0,16) : "";
  res.send(renderPage(`Edit — ${event.title}`, `
    <div class="card" style="max-width:560px">
      <form method="POST" action="/calendar/${event._id}/edit">
        <div><label>Title</label><input name="title" value="${event.title}" required/></div>
        <div class="row">
          <div><label>Type</label><select name="type">
            ${["banner","event","raid","maintenance","other"].map(t=>`<option value="${t}" ${event.type===t?"selected":""}>${t}</option>`).join("")}
          </select></div>
          <div><label>Color</label><input type="color" name="color" value="${event.color}" style="height:38px;padding:2px 6px"/></div>
        </div>
        <div class="row">
          <div><label>Start Date</label><input type="datetime-local" name="startDate" value="${fmt(event.startDate)}" required/></div>
          <div><label>End Date</label><input type="datetime-local" name="endDate" value="${fmt(event.endDate)}"/></div>
        </div>
        <div><label>Linked Banner</label>
          <select name="bannerId">
            <option value="">— None —</option>
            ${banners.map(b=>`<option value="${b.bannerId}" ${event.bannerId===b.bannerId?"selected":""}>${b.name}</option>`).join("")}
          </select>
        </div>
        <div><label>Description</label><textarea name="description" rows="3">${event.description||""}</textarea></div>
        <div style="display:flex;gap:10px"><button type="submit">Save</button><a href="/calendar" class="btn btn-red">Cancel</a></div>
      </form>
    </div>
  `, req.user));
});

app.post("/calendar/:id/edit", auth, editorOrAdmin, async (req, res) => {
  const { title, type, color, startDate, endDate, bannerId, description } = req.body;
  await ScheduledEvent.findByIdAndUpdate(req.params.id, {
    title, type, color, description,
    startDate: new Date(startDate),
    endDate: endDate ? new Date(endDate) : null,
    bannerId: bannerId || null,
  });
  await audit(req.user, "update", "event", req.params.id, `Updated event "${title}"`, null, null);
  res.redirect("/calendar");
});

app.get("/calendar/:id/delete", auth, editorOrAdmin, async (req, res) => {
  const event = await ScheduledEvent.findByIdAndDelete(req.params.id);
  if (event) await audit(req.user, "delete", "event", req.params.id, `Deleted event "${event.title}"`, null, null);
  res.redirect("/calendar");
});

// ─── MESSAGES ────────────────────────────────────────────────────────────────
app.get("/messages", auth, async (req, res) => {
  const messages = await ScheduledMessage.find().sort({ scheduledAt: -1 }).limit(50);
  const rows = messages.map(m => `<tr>
    <td><strong>${m.title}</strong></td>
    <td><code style="font-size:11px">${m.channelId}</code></td>
    <td style="font-size:12px">${new Date(m.scheduledAt).toLocaleString("en-GB")}</td>
    <td><span class="badge ${m.sent?"badge-green":"badge-yellow"}">${m.sent?"Sent":"Pending"}</span></td>
    <td>
      ${!m.sent ? `<a href="/messages/${m._id}/send-now" class="btn btn-sm btn-green" onclick="return confirm('Send now?')">Send Now</a>
      <a href="/messages/${m._id}/delete" class="btn btn-sm btn-red" onclick="return confirm('Delete?')">Delete</a>` : ""}
    </td>
  </tr>`).join("");

  res.send(renderPage("Scheduled Messages", `
    <a href="/messages/new" class="btn btn-green" style="margin-bottom:20px;display:inline-block">+ New Message</a>
    <div class="card">
      <table><thead><tr><th>Title</th><th>Channel ID</th><th>Scheduled</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${rows||"<tr><td colspan='5' style='color:#666;text-align:center'>No messages yet</td></tr>"}</tbody></table>
    </div>
  `, req.user));
});

app.get("/messages/new", auth, async (req, res) => {
  const banners = await Banner.find({ isActive: true }).sort({ name: 1 });
  res.send(renderPage("New Scheduled Message", `
    <div class="card" style="max-width:640px">
      <form method="POST" action="/messages/new">
        <div><label>Title (internal label)</label><input name="title" placeholder="Naruto Banner Announcement" required/></div>
        <div><label>Discord Channel ID</label><input name="channelId" placeholder="123456789012345678" required/></div>
        <div><label>Schedule Date & Time</label><input type="datetime-local" name="scheduledAt" required/></div>

        <hr style="border-color:#2d2d3d;margin:12px 0"/>
        <h2>Message Content</h2>
        <div><label>Plain text (optional)</label><textarea name="content" rows="2" placeholder="@everyone New banner is live!"></textarea></div>

        <hr style="border-color:#2d2d3d;margin:12px 0"/>
        <h2>Embed (optional)</h2>
        <div><label>Embed Title</label><input name="embedTitle" id="prev-title" oninput="updatePreview()" placeholder="Pick Up! Naruto is now live!"/></div>
        <div><label>Embed Description</label><textarea name="embedDesc" id="prev-desc" oninput="updatePreview()" rows="4" placeholder="New banner featuring Naruto characters..."></textarea></div>
        <div class="row">
          <div><label>Embed Color</label><input type="color" name="embedColor" value="#7c3aed" id="prev-color" oninput="updatePreview()" style="height:38px;padding:2px 6px"/></div>
          <div><label>Embed Image URL</label><input name="embedImage" id="prev-image" oninput="updatePreview()" placeholder="https://..."/></div>
        </div>

        <hr style="border-color:#2d2d3d;margin:12px 0"/>
        <h2>Preview</h2>
        <div id="embed-preview" style="border-left:4px solid #7c3aed;background:#2b2d31;border-radius:4px;padding:12px 16px;max-width:480px;margin-bottom:12px">
          <div id="prev-title-display" style="font-weight:700;color:#fff;font-size:15px;margin-bottom:6px"></div>
          <div id="prev-desc-display" style="color:#dbdee1;font-size:14px;white-space:pre-line;margin-bottom:8px"></div>
          <img id="prev-img-display" src="" style="display:none;max-width:100%;border-radius:6px;margin-top:6px"/>
        </div>

        <hr style="border-color:#2d2d3d;margin:12px 0"/>
        <div><label>Quick fill from Banner</label>
          <select onchange="fillFromBanner(this.value)">
            <option value="">— Select a banner to auto-fill —</option>
            ${banners.map(b=>`<option value="${b.bannerId}" data-name="${b.name}" data-image="${b.imageUrl||""}">${b.name}</option>`).join("")}
          </select>
        </div>

        <div style="display:flex;gap:10px;margin-top:8px">
          <button type="submit">Schedule Message</button>
          <a href="/messages" class="btn btn-red">Cancel</a>
        </div>
      </form>
    </div>
    <script>
    function fillFromBanner(id) {
      const sel = document.querySelector('select[onchange]');
      const opt = sel.options[sel.selectedIndex];
      if (!id) return;
      document.querySelector('[name=embedTitle]').value = opt.dataset.name + ' is now live!';
      document.querySelector('[name=embedImage]').value = opt.dataset.image || '';
      document.querySelector('[name=title]').value = opt.dataset.name + ' Announcement';
      updatePreview();
    }
    function updatePreview() {
      const title = document.getElementById("prev-title")?.value || "";
      const desc  = document.getElementById("prev-desc")?.value || "";
      const color = document.getElementById("prev-color")?.value || "#7c3aed";
      const img   = document.getElementById("prev-image")?.value || "";
      document.getElementById("prev-title-display").textContent = title;
      document.getElementById("prev-desc-display").textContent  = desc;
      document.getElementById("embed-preview").style.borderLeftColor = color;
      const imgEl = document.getElementById("prev-img-display");
      if (img) { imgEl.src = img; imgEl.style.display = "block"; }
      else { imgEl.style.display = "none"; }
    }
    updatePreview();
    </script>
  `, req.user));
});

app.post("/messages/new", auth, async (req, res) => {
  const { title, channelId, scheduledAt, content, embedTitle, embedDesc, embedColor, embedImage } = req.body;
  await ScheduledMessage.create({
    title, channelId, scheduledAt: new Date(scheduledAt),
    content: content || "",
    embedTitle: embedTitle || "",
    embedDesc: embedDesc || "",
    embedColor: embedColor || "#7c3aed",
    embedImage: embedImage || "",
    createdBy: req.user.username,
  });
  await audit(req.user, "create", "message", title, `Scheduled message "${title}" for ${new Date(scheduledAt).toLocaleString("en-GB")}`, null, null);
  res.redirect("/messages");
});

app.get("/messages/:id/send-now", auth, async (req, res) => {
  const msg = await ScheduledMessage.findById(req.params.id);
  if (!msg || msg.sent) return res.redirect("/messages");
  await msg.updateOne({ scheduledAt: new Date(Date.now() - 1000) }); // trigger on next scheduler tick
  res.redirect("/messages");
});

app.get("/messages/:id/delete", auth, async (req, res) => {
  const msg = await ScheduledMessage.findByIdAndDelete(req.params.id);
  if (msg) await audit(req.user, "delete", "message", req.params.id, `Deleted scheduled message "${msg.title}"`, null, null);
  res.redirect("/messages");
});

// ─── BANNERS ──────────────────────────────────────────────────────────────────
app.get("/banners", auth, editorOrAdmin, async (req, res) => {
  const banners = await Banner.find().sort({ createdAt: -1 });
  const rows = banners.map(b => {
    const statusBadge = b.isActive ? `<span class="badge badge-green">Active</span>` : `<span class="badge badge-gray">Inactive</span>`;
    const typeBadge = b.type === "pickup" ? `<span class="badge badge-purple">Pick Up</span>` : `<span class="badge badge-blue">Regular</span>`;
    const ends = b.endsAt ? new Date(b.endsAt).toLocaleDateString("en-GB") : "—";
    const poolTotal = (b.pool.common?.length||0)+(b.pool.rare?.length||0)+(b.pool.special?.length||0)+(b.pool.exceptional?.length||0);
    return `<tr>
      <td><strong>${b.name}</strong><br/><small style="color:#666">${b.bannerId}</small></td>
      <td>${typeBadge}</td><td>${statusBadge}</td><td>${ends}</td><td>${poolTotal} cards</td>
      <td>
        <a href="/banners/${b.bannerId}/edit" class="btn btn-sm">Edit</a>
        <a href="/banners/${b.bannerId}/pool" class="btn btn-sm btn-green">Pool</a>
        <a href="/banners/${b.bannerId}/stats" class="btn btn-sm btn-gray">Stats</a>
        <a href="/banners/${b.bannerId}/toggle" class="btn btn-sm btn-red">${b.isActive?"Disable":"Enable"}</a>
      </td>
    </tr>`;
  }).join("");
  res.send(renderPage("Banners", `
    <a href="/banners/new" class="btn" style="margin-bottom:20px;display:inline-block">+ New Banner</a>
    <div class="card"><table>
      <thead><tr><th>Banner</th><th>Type</th><th>Status</th><th>Ends</th><th>Pool</th><th>Actions</th></tr></thead>
      <tbody>${rows||"<tr><td colspan='6' style='color:#666;text-align:center'>No banners yet</td></tr>"}</tbody>
    </table></div>
  `, req.user));
});

app.get("/banners/new", auth, editorOrAdmin, (req, res) => {
  res.send(renderPage("New Banner", `
    <div class="card" style="max-width:600px">
      <form method="POST" action="/banners/new">
        <div class="row">
          <div><label>Banner ID</label><input name="bannerId" placeholder="naruto_pickup_1" required/></div>
          <div><label>Type</label><select name="type"><option value="pickup">Pick Up</option><option value="regular">Regular</option></select></div>
        </div>
        <div><label>Name</label><input name="name" placeholder="Pick Up! Naruto" required/></div>
        <div><label>Anime</label><input name="anime" placeholder="Naruto" required/></div>
        <div><label>Image URL</label><input name="imageUrl" placeholder="https://..."/></div>
        <div><label>Description</label><input name="description" placeholder="Banner featuring Naruto characters"/></div>
        <div class="row">
          <div><label>Starts At</label><input type="date" name="startsAt" required/></div>
          <div><label>Ends At (empty = permanent)</label><input type="date" name="endsAt"/></div>
        </div>
        <div class="row3">
          <div><label>Common %</label><input type="number" name="rateCommon" value="60"/></div>
          <div><label>Rare %</label><input type="number" name="rateRare" value="25"/></div>
          <div><label>Special %</label><input type="number" name="rateSpecial" value="12"/></div>
        </div>
        <div class="row"><div><label>Exceptional %</label><input type="number" name="rateExceptional" value="3"/></div><div><label>Hard Pity</label><input type="number" name="hardPity" value="90"/></div></div>
        <div style="display:flex;gap:10px"><button type="submit">Create Banner</button><a href="/banners" class="btn btn-red">Cancel</a></div>
      </form>
    </div>
  `, req.user));
});

app.post("/banners/new", auth, editorOrAdmin, async (req, res) => {
  try {
    const { bannerId, name, anime, type, imageUrl, description, startsAt, endsAt, rateCommon, rateRare, rateSpecial, rateExceptional, hardPity } = req.body;
    const banner = await Banner.create({ bannerId, name, anime, type, imageUrl: imageUrl||null, description: description||null, startsAt: new Date(startsAt), endsAt: endsAt?new Date(endsAt):null, rates: { common:parseFloat(rateCommon), rare:parseFloat(rateRare), special:parseFloat(rateSpecial), exceptional:parseFloat(rateExceptional) }, pity: { hardPity:parseInt(hardPity), softPityStart:75 }, pool: { common:[], rare:[], special:[], exceptional:[] }, featuredCards:[] });
    await audit(req.user, "create", "banner", bannerId, `Created banner "${name}"`, null, banner.toObject());
    res.redirect("/banners");
  } catch (err) { res.send(renderPage("Error", `<div class="alert alert-red">${err.message}</div><a href="/banners/new" class="btn">Back</a>`, req.user)); }
});

app.get("/banners/:id/edit", auth, editorOrAdmin, async (req, res) => {
  const banner = await Banner.findOne({ bannerId: req.params.id });
  if (!banner) return res.redirect("/banners");
  const fmt = d => d ? new Date(d).toISOString().slice(0,10) : "";
  res.send(renderPage(`Edit — ${banner.name}`, `
    <div class="card" style="max-width:600px">
      <form method="POST" action="/banners/${banner.bannerId}/edit">
        <div><label>Name</label><input name="name" value="${banner.name}" required/></div>
        <div><label>Anime</label><input name="anime" value="${banner.anime}" required/></div>
        <div><label>Image URL</label><input name="imageUrl" value="${banner.imageUrl||""}"/></div>
        <div><label>Description</label><input name="description" value="${banner.description||""}"/></div>
        <div class="row"><div><label>Starts At</label><input type="date" name="startsAt" value="${fmt(banner.startsAt)}"/></div><div><label>Ends At</label><input type="date" name="endsAt" value="${fmt(banner.endsAt)}"/></div></div>
        <div class="row3"><div><label>Common %</label><input type="number" name="rateCommon" value="${banner.rates.common}"/></div><div><label>Rare %</label><input type="number" name="rateRare" value="${banner.rates.rare}"/></div><div><label>Special %</label><input type="number" name="rateSpecial" value="${banner.rates.special}"/></div></div>
        <div class="row"><div><label>Exceptional %</label><input type="number" name="rateExceptional" value="${banner.rates.exceptional}"/></div><div><label>Hard Pity</label><input type="number" name="hardPity" value="${banner.pity.hardPity}"/></div></div>
        <div style="display:flex;gap:10px"><button type="submit">Save</button><a href="/banners" class="btn btn-red">Cancel</a></div>
      </form>
    </div>
  `, req.user));
});

app.post("/banners/:id/edit", auth, editorOrAdmin, async (req, res) => {
  const { name, anime, imageUrl, description, startsAt, endsAt, rateCommon, rateRare, rateSpecial, rateExceptional, hardPity } = req.body;
  const before = await Banner.findOne({ bannerId: req.params.id });
  const after = await Banner.findOneAndUpdate({ bannerId: req.params.id }, { name, anime, imageUrl: imageUrl||null, description: description||null, startsAt: new Date(startsAt), endsAt: endsAt?new Date(endsAt):null, rates: { common:parseFloat(rateCommon), rare:parseFloat(rateRare), special:parseFloat(rateSpecial), exceptional:parseFloat(rateExceptional) }, "pity.hardPity": parseInt(hardPity) }, { new: true });
  await audit(req.user, "update", "banner", req.params.id, `Updated banner "${name}"`, before?.toObject(), after?.toObject());
  res.redirect("/banners");
});

app.get("/banners/:id/toggle", auth, editorOrAdmin, async (req, res) => {
  const banner = await Banner.findOne({ bannerId: req.params.id });
  if (banner) { await banner.updateOne({ isActive: !banner.isActive }); await audit(req.user, "update", "banner", req.params.id, `${banner.isActive?"Disabled":"Enabled"} banner "${banner.name}"`, null, null); }
  res.redirect("/banners");
});

app.get("/banners/:id/pool", auth, editorOrAdmin, async (req, res) => {
  const banner = await Banner.findOne({ bannerId: req.params.id });
  if (!banner) return res.redirect("/banners");
  const allCards = await Card.find({ isAvailable: true }).sort({ anime: 1, name: 1 });
  const poolIds = new Set([...banner.pool.common,...banner.pool.rare,...banner.pool.special,...banner.pool.exceptional]);
  const featuredIds = new Set(banner.featuredCards);
  const rarityBadge = { common:"badge-gray",rare:"badge-blue",special:"badge-purple",exceptional:"badge-yellow" };
  const cardRows = allCards.map(c => {
    const inPool = poolIds.has(c.cardId);
    const isFeatured = featuredIds.has(c.cardId);
    return `<tr>
      <td>${c.imageUrl ? `<img src="${c.imageUrl}" style="width:32px;height:32px;object-fit:cover;border-radius:4px"/>` : "—"}</td>
      <td><strong>${c.name}</strong></td><td>${c.anime}</td><td><span class="badge ${rarityBadge[c.rarity]}">${c.rarity}</span></td><td>${c.role}</td>
      <td>
        ${c.imageUrl ? `<button type="button" class="btn btn-sm btn-gray" onclick="navigator.clipboard.writeText('${c.imageUrl}');this.textContent='✓ Copied';setTimeout(()=>this.textContent='Copy URL',1500)">Copy URL</button>` : ""}
        <form method="POST" action="/banners/${banner.bannerId}/pool" style="display:inline"><input type="hidden" name="cardId" value="${c.cardId}"/><input type="hidden" name="action" value="${inPool?"remove":"add"}"/><button type="submit" class="btn btn-sm ${inPool?"btn-red":"btn-green"}">${inPool?"Remove":"Add"}</button></form>
        ${inPool?`<form method="POST" action="/banners/${banner.bannerId}/featured" style="display:inline"><input type="hidden" name="cardId" value="${c.cardId}"/><input type="hidden" name="action" value="${isFeatured?"unfeature":"feature"}"/><button type="submit" class="btn btn-sm ${isFeatured?"":"btn-green"}">${isFeatured?"★ Featured":"☆ Feature"}</button></form>`:""}
      </td>
    </tr>`;
  }).join("");
  res.send(renderPage(`Pool — ${banner.name}`, `<p style="color:#888;margin-bottom:16px">Pool: ${poolIds.size} cards — Featured: ${featuredIds.size} <a href="/banners" class="btn btn-sm" style="margin-left:16px">← Back</a></p><div class="card"><table><thead><tr><th>Art</th><th>Name</th><th>Anime</th><th>Rarity</th><th>Role</th><th>Actions</th></tr></thead><tbody>${cardRows||"<tr><td colspan='5' style='color:#666'>No cards yet</td></tr>"}</tbody></table></div>`, req.user));
});

app.post("/banners/:id/pool", auth, editorOrAdmin, async (req, res) => {
  const { cardId, action } = req.body;
  const banner = await Banner.findOne({ bannerId: req.params.id });
  const card = await Card.findOne({ cardId });
  if (!banner || !card) return res.redirect(`/banners/${req.params.id}/pool`);
  const before = banner.toObject();
  if (action === "add") { await Banner.findOneAndUpdate({ bannerId: req.params.id }, { $addToSet: { [`pool.${card.rarity}`]: cardId } }); await audit(req.user, "update", "banner", req.params.id, `Added "${card.name}" to "${banner.name}"`, before, null); }
  else { await Banner.findOneAndUpdate({ bannerId: req.params.id }, { $pull: { [`pool.${card.rarity}`]: cardId, featuredCards: cardId } }); await audit(req.user, "update", "banner", req.params.id, `Removed "${card.name}" from "${banner.name}"`, before, null); }
  res.redirect(`/banners/${req.params.id}/pool`);
});

app.post("/banners/:id/featured", auth, editorOrAdmin, async (req, res) => {
  const { cardId, action } = req.body;
  const card = await Card.findOne({ cardId });
  const banner = await Banner.findOne({ bannerId: req.params.id });
  if (action === "feature") { await Banner.findOneAndUpdate({ bannerId: req.params.id }, { $addToSet: { featuredCards: cardId } }); await audit(req.user, "update", "banner", req.params.id, `Featured "${card?.name}" in "${banner?.name}"`, null, null); }
  else { await Banner.findOneAndUpdate({ bannerId: req.params.id }, { $pull: { featuredCards: cardId } }); await audit(req.user, "update", "banner", req.params.id, `Unfeatured "${card?.name}"`, null, null); }
  res.redirect(`/banners/${req.params.id}/pool`);
});


// ─── BANNER STATS ─────────────────────────────────────────────────────────────
app.get("/banners/:id/stats", auth, editorOrAdmin, async (req, res) => {
  const banner = await Banner.findOne({ bannerId: req.params.id });
  if (!banner) return res.redirect("/banners");

  // Cards obtained from this banner = PlayerCards whose cardId is in the pool
  const poolIds = [...banner.pool.common,...banner.pool.rare,...banner.pool.special,...banner.pool.exceptional];
  
  const [totalPulls, cardDist, topPullers] = await Promise.all([
    PlayerCard.countDocuments({ cardId: { $in: poolIds } }),
    PlayerCard.aggregate([
      { $match: { cardId: { $in: poolIds } } },
      { $lookup: { from: "cards", localField: "cardId", foreignField: "cardId", as: "card" } },
      { $unwind: "$card" },
      { $group: { _id: { cardId: "$cardId", name: "$card.name", rarity: "$card.rarity" }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 }
    ]),
    PlayerCard.aggregate([
      { $match: { cardId: { $in: poolIds } } },
      { $group: { _id: "$userId", pulls: { $sum: 1 } } },
      { $sort: { pulls: -1 } },
      { $limit: 10 },
      { $lookup: { from: "users", localField: "_id", foreignField: "userId", as: "user" } },
      { $unwind: { path: "$user", preserveNullAndEmpty: true } },
    ])
  ]);

  // Rarity breakdown
  const rarityCount = { common: 0, rare: 0, special: 0, exceptional: 0 };
  for (const d of cardDist) rarityCount[d._id.rarity] = (rarityCount[d._id.rarity] || 0) + d.count;
  const rarityBadge = { common:"badge-gray",rare:"badge-blue",special:"badge-purple",exceptional:"badge-yellow" };

  // Actual vs theoretical rates
  const theoreticalRates = banner.rates || {};
  const rarityRows = Object.entries(rarityCount).map(([r, count]) => {
    const actual = totalPulls > 0 ? ((count/totalPulls)*100).toFixed(1) : "0.0";
    const theory = theoreticalRates[r] ?? 0;
    return `<tr>
      <td><span class="badge ${rarityBadge[r]}">${r}</span></td>
      <td>${count}</td>
      <td><strong>${actual}%</strong></td>
      <td>${theory}%</td>
      <td style="color:${parseFloat(actual) > theory ? "#86efac" : "#fca5a5"}">${(parseFloat(actual) - theory).toFixed(1)}%</td>
    </tr>`;
  }).join("");

  const topCardRows = cardDist.map(d => `<tr>
    <td><strong>${d._id.name}</strong></td>
    <td><span class="badge ${rarityBadge[d._id.rarity]}">${d._id.rarity}</span></td>
    <td>${d.count}</td>
    <td>${totalPulls > 0 ? ((d.count/totalPulls)*100).toFixed(1) : 0}%</td>
  </tr>`).join("");

  const topPullerRows = topPullers.map((p, i) => `<tr>
    <td>${i+1}</td>
    <td><strong>${p.user?.username || p._id}</strong></td>
    <td>${p.pulls}</td>
  </tr>`).join("");

  res.send(renderPage(`Stats — ${banner.name}`, `
    <div style="margin-bottom:16px"><a href="/banners" class="btn btn-sm btn-gray">← Back to Banners</a></div>
    <div class="grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat"><div class="value">${totalPulls.toLocaleString()}</div><div class="label">Total Pulls</div></div>
      <div class="stat"><div class="value">${poolIds.length}</div><div class="label">Cards in Pool</div></div>
      <div class="stat"><div class="value">${rarityCount.exceptional}</div><div class="label">Exceptionals Pulled</div></div>
    </div>
    <div class="row" style="gap:18px">
      <div>
        <div class="card">
          <h2>Rarity Distribution</h2>
          <table><thead><tr><th>Rarity</th><th>Obtained</th><th>Actual %</th><th>Theory %</th><th>Diff</th></tr></thead>
          <tbody>${rarityRows}</tbody></table>
        </div>
        <div class="card">
          <h2>Top Pullers</h2>
          <table><thead><tr><th>#</th><th>Player</th><th>Pulls</th></tr></thead>
          <tbody>${topPullerRows||"<tr><td colspan='3' style='color:#666'>No data</td></tr>"}</tbody></table>
        </div>
      </div>
      <div class="card">
        <h2>Most Pulled Cards</h2>
        <table><thead><tr><th>Card</th><th>Rarity</th><th>Obtained</th><th>Rate</th></tr></thead>
        <tbody>${topCardRows||"<tr><td colspan='4' style='color:#666'>No pulls yet</td></tr>"}</tbody></table>
      </div>
    </div>
  `, req.user));
});

// ─── CARDS ────────────────────────────────────────────────────────────────────
app.get("/cards", auth, editorOrAdmin, async (req, res) => {
  const cards = await Card.find().sort({ anime: 1, rarity: 1, name: 1 });
  const rarityBadge = { common:"badge-gray",rare:"badge-blue",special:"badge-purple",exceptional:"badge-yellow" };
  const roleBadge = { dps:"badge-red",support:"badge-green",tank:"badge-blue" };
  const rows = cards.map(c => `<tr>
    <td>${c.imageUrl?`<img src="${c.imageUrl}" style="width:36px;height:36px;object-fit:cover;border-radius:4px"/>`:"—"}</td>
    <td><strong>${c.name}</strong><br/><small style="color:#666">${c.cardId}</small></td>
    <td>${c.anime}</td><td><span class="badge ${rarityBadge[c.rarity]}">${c.rarity}</span></td>
    <td><span class="badge ${roleBadge[c.role]}">${c.role}</span></td><td>${c.totalPrints}</td>
    <td><a href="/cards/${c.cardId}/detail" class="btn btn-sm btn-gray">Detail</a> <a href="/cards/${c.cardId}/edit" class="btn btn-sm">Edit</a></td>
  </tr>`).join("");
  res.send(renderPage("Cards", `<a href="/cards/new" class="btn" style="margin-bottom:20px;display:inline-block">+ New Card</a><div class="card"><table><thead><tr><th>Art</th><th>Card</th><th>Anime</th><th>Rarity</th><th>Role</th><th>Prints</th><th>Actions</th></tr></thead><tbody>${rows||"<tr><td colspan='7' style='color:#666;text-align:center'>No cards yet</td></tr>"}</tbody></table></div>`, req.user));
});

app.get("/cards/new", auth, editorOrAdmin, async (req, res) => {
  const banners = await Banner.find().sort({ type: 1, name: 1 });
  const bannerOptions = banners.map(b => `<option value="${b.bannerId}">[${b.type==="pickup"?"Pick Up":"Regular"}] ${b.name}${b.isActive?"":" (inactive)"}</option>`).join("");
  res.send(renderPage("New Card", `
    <div class="card" style="max-width:600px">
      <form method="POST" action="/cards/new">
        <div class="row"><div><label>Card ID</label><input name="cardId" placeholder="naruto_001" required/></div><div><label>Name</label><input name="name" placeholder="Naruto Uzumaki" required/></div></div>
        <div class="row"><div><label>Anime</label><input name="anime" placeholder="Naruto" required/></div><div><label>Image URL</label><input name="imageUrl" placeholder="https://..."/></div></div>
        <div class="row"><div><label>Rarity</label><select name="rarity"><option value="common">Common</option><option value="rare">Rare</option><option value="special">Special</option><option value="exceptional">Exceptional</option></select></div><div><label>Role</label><select name="role"><option value="dps">DPS</option><option value="support">Support</option><option value="tank">Tank</option></select></div></div>
        <div><label>Add to Banner (optional)</label><select name="addToBanner"><option value="">— Don't add —</option>${bannerOptions}</select></div>
        <div class="row3"><div><label>Base Damage</label><input type="number" name="baseDamage" value="100"/></div><div><label>Base Mana</label><input type="number" name="baseMana" value="100"/></div><div><label>Base HP</label><input type="number" name="baseHp" value="100"/></div></div>
        <div style="display:flex;gap:10px"><button type="submit">Create Card</button><a href="/cards" class="btn btn-red">Cancel</a></div>
      </form>
    </div>
  `, req.user));
});

app.post("/cards/new", auth, editorOrAdmin, async (req, res) => {
  try {
    const { cardId, name, anime, imageUrl, rarity, role, addToBanner, baseDamage, baseMana, baseHp } = req.body;
    let bannerType = "regular";
    if (addToBanner) { const b = await Banner.findOne({ bannerId: addToBanner }); if (b) bannerType = b.type; }
    const card = await Card.create({ cardId, name, anime, imageUrl: imageUrl||null, rarity, role, bannerType, baseStats: { damage:parseInt(baseDamage), mana:parseInt(baseMana), hp:parseInt(baseHp) } });
    if (addToBanner) await Banner.findOneAndUpdate({ bannerId: addToBanner }, { $addToSet: { [`pool.${rarity}`]: cardId } });
    await audit(req.user, "create", "card", cardId, `Created card "${name}" (${rarity} ${role})`, null, card.toObject());
    res.redirect("/cards");
  } catch (err) { res.send(renderPage("Error", `<div class="alert alert-red">${err.message}</div><a href="/cards/new" class="btn">Back</a>`, req.user)); }
});

app.get("/cards/:id/edit", auth, editorOrAdmin, async (req, res) => {
  const card = await Card.findOne({ cardId: req.params.id });
  if (!card) return res.redirect("/cards");
  res.send(renderPage(`Edit — ${card.name}`, `
    <div class="card" style="max-width:600px">
      ${card.imageUrl?`<img src="${card.imageUrl}" style="height:110px;border-radius:8px;margin-bottom:14px"/>` : ""}
      <form method="POST" action="/cards/${card.cardId}/edit">
        <div class="row"><div><label>Name</label><input name="name" value="${card.name}" required/></div><div><label>Anime</label><input name="anime" value="${card.anime}" required/></div></div>
        <div><label>Image URL</label><input name="imageUrl" value="${card.imageUrl||""}"/></div>
        <div class="row"><div><label>Rarity</label><select name="rarity">${["common","rare","special","exceptional"].map(r=>`<option value="${r}" ${card.rarity===r?"selected":""}>${r}</option>`).join("")}</select></div><div><label>Role</label><select name="role">${["dps","support","tank"].map(r=>`<option value="${r}" ${card.role===r?"selected":""}>${r}</option>`).join("")}</select></div></div>
        <div class="row3"><div><label>Base Damage</label><input type="number" name="baseDamage" value="${card.baseStats.damage}"/></div><div><label>Base Mana</label><input type="number" name="baseMana" value="${card.baseStats.mana}"/></div><div><label>Base HP</label><input type="number" name="baseHp" value="${card.baseStats.hp}"/></div></div>
        <div style="display:flex;gap:10px"><button type="submit">Save</button><a href="/cards" class="btn btn-red">Cancel</a></div>
      </form>
    </div>
  `, req.user));
});

app.post("/cards/:id/edit", auth, editorOrAdmin, async (req, res) => {
  const { name, anime, imageUrl, rarity, role, baseDamage, baseMana, baseHp } = req.body;
  const before = await Card.findOne({ cardId: req.params.id });
  const after = await Card.findOneAndUpdate({ cardId: req.params.id }, { name, anime, imageUrl: imageUrl||null, rarity, role, baseStats: { damage:parseInt(baseDamage), mana:parseInt(baseMana), hp:parseInt(baseHp) } }, { new: true });
  await audit(req.user, "update", "card", req.params.id, `Updated card "${name}"`, before?.toObject(), after?.toObject());
  res.redirect("/cards");
});


// ─── CARD DETAIL ──────────────────────────────────────────────────────────────
app.get("/cards/:id/detail", auth, editorOrAdmin, async (req, res) => {
  const card = await Card.findOne({ cardId: req.params.id });
  if (!card) return res.redirect("/cards");

  const [totalPrints, topPrints, ownerCount] = await Promise.all([
    PlayerCard.countDocuments({ cardId: card.cardId, isBurned: false }),
    PlayerCard.find({ cardId: card.cardId, isBurned: false })
      .sort({ printNumber: 1 })
      .limit(10)
      .lean(),
    PlayerCard.aggregate([
      { $match: { cardId: card.cardId, isBurned: false } },
      { $group: { _id: "$userId" } },
      { $count: "total" }
    ])
  ]);

  // Enrich top prints with username
  const userIds = [...new Set(topPrints.map(p => p.userId))];
  const users = await User.find({ userId: { $in: userIds } }).select("userId username").lean();
  const userMap = Object.fromEntries(users.map(u => [u.userId, u.username]));

  const rarityBadge = { common:"badge-gray",rare:"badge-blue",special:"badge-purple",exceptional:"badge-yellow" };
  const roleBadge = { dps:"badge-red",support:"badge-green",tank:"badge-blue" };
  const totalOwners = ownerCount[0]?.total ?? 0;

  const printRows = topPrints.map(p => `<tr>
    <td><strong>#${p.printNumber}</strong>${p.printNumber===1?" 👑":""}</td>
    <td>${userMap[p.userId] || p.userId}</td>
    <td>Lv.${p.level}${p.isAscended?" ✨":""}</td>
    <td>${(p.cachedStats?.combatPower ?? 0).toLocaleString()}</td>
  </tr>`).join("");

  res.send(renderPage(`Card — ${card.name}`, `
    <div style="margin-bottom:16px"><a href="/cards" class="btn btn-sm btn-gray">← Back to Cards</a></div>
    <div class="row" style="gap:20px;align-items:flex-start">
      <div style="max-width:260px">
        ${card.imageUrl ? `<img src="${card.imageUrl}" style="width:100%;border-radius:10px;margin-bottom:14px"/>` : ""}
        <div class="card" style="margin-bottom:0">
          <table style="font-size:13px">
            <tr><td style="color:#888">Rarity</td><td><span class="badge ${rarityBadge[card.rarity]}">${card.rarity}</span></td></tr>
            <tr><td style="color:#888">Role</td><td><span class="badge ${roleBadge[card.role]}">${card.role}</span></td></tr>
            <tr><td style="color:#888">Anime</td><td>${card.anime}</td></tr>
            <tr><td style="color:#888">Base DMG</td><td>${card.baseStats?.damage ?? 0}</td></tr>
            <tr><td style="color:#888">Base Mana</td><td>${card.baseStats?.mana ?? 0}</td></tr>
            <tr><td style="color:#888">Base HP</td><td>${card.baseStats?.hp ?? 0}</td></tr>
            <tr><td style="color:#888">Total Prints</td><td><strong>${card.totalPrints}</strong></td></tr>
          </table>
        </div>
      </div>
      <div style="flex:1">
        <div class="grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px">
          <div class="stat"><div class="value">${totalPrints}</div><div class="label">Copies Owned</div></div>
          <div class="stat"><div class="value">${totalOwners}</div><div class="label">Unique Owners</div></div>
          <div class="stat"><div class="value">${card.totalPrints}</div><div class="label">Total Ever Printed</div></div>
        </div>
        <div class="card">
          <h2>Lowest Prints (rarest)</h2>
          <table><thead><tr><th>Print</th><th>Owner</th><th>Level</th><th>CP</th></tr></thead>
          <tbody>${printRows||"<tr><td colspan='4' style='color:#666'>No copies in circulation</td></tr>"}</tbody></table>
        </div>
      </div>
    </div>
  `, req.user));
});

// ─── RAIDS (admin only) ───────────────────────────────────────────────────────
app.get("/raids", auth, adminOnly, async (req, res) => {
  const raids = await Raid.find().sort({ createdAt: -1 }).limit(20);
  const statusBadge = { active:"badge-green",defeated:"badge-gray",expired:"badge-red" };
  const rows = raids.map(r => `<tr><td><strong>${r.name}</strong><br/><small style="color:#666">${r.anime}</small></td><td><span class="badge ${statusBadge[r.status]}">${r.status}</span></td><td>${r.currentHp.toLocaleString()} / ${r.maxHp.toLocaleString()} (${Math.round((r.currentHp/r.maxHp)*100)}%)</td><td>${r.participants.length}</td><td>${new Date(r.endsAt).toLocaleDateString("en-GB")}</td></tr>`).join("");
  res.send(renderPage("Raids", `
    <div class="card" style="max-width:500px;margin-bottom:24px">
      <h2>Create New Raid</h2>
      <form method="POST" action="/raids/new">
        <div class="row"><div><label>Boss Name</label><input name="name" placeholder="Pain" required/></div><div><label>Anime</label><input name="anime" placeholder="Naruto" required/></div></div>
        <div><label>Image URL (optional)</label><input name="imageUrl" placeholder="https://..."/></div>
        <div class="row"><div><label>HP</label><input type="number" name="hp" value="1000000" min="1000" required/></div><div><label>Duration (hours)</label><input type="number" name="hours" value="48" min="1" required/></div></div>
        <button type="submit">Create Raid</button>
      </form>
    </div>
    <div class="card"><table><thead><tr><th>Boss</th><th>Status</th><th>HP</th><th>Participants</th><th>Ends</th></tr></thead><tbody>${rows||"<tr><td colspan='5' style='color:#666;text-align:center'>No raids yet</td></tr>"}</tbody></table></div>
  `, req.user));
});

app.post("/raids/new", auth, adminOnly, async (req, res) => {
  const { name, anime, imageUrl, hp, hours } = req.body;
  await Raid.updateMany({ status: "active" }, { status: "expired" });
  const raidId = `raid_${Date.now()}`;
  const endsAt = new Date(Date.now() + parseInt(hours)*60*60*1000);
  const raid = await Raid.create({ raidId, name, anime, imageUrl: imageUrl||null, maxHp:parseInt(hp), currentHp:parseInt(hp), endsAt });
  await audit(req.user, "create", "raid", raidId, `Created raid "${name}" (${hp.toLocaleString()} HP, ${hours}h)`, null, raid.toObject());
  res.redirect("/raids");
});

// ─── PLAYERS (admin only) ─────────────────────────────────────────────────────
app.get("/players", auth, adminOnly, async (req, res) => {
  const search  = (req.query.q || "").trim();
  const sortBy  = req.query.sort || "createdAt";
  const sortDir = req.query.dir === "asc" ? 1 : -1;
  const sortMap = { cp: "combatPower", gold: "currency.gold", date: "createdAt", streak: "loginStreak" };
  const sortField = sortMap[sortBy] || "createdAt";
  const query = search ? { username: { $regex: search, $options: "i" } } : {};
  const players = await User.find(query).sort({ [sortField]: sortDir }).limit(100);
  const sortLink = (field, label) => {
    const active = sortBy === field;
    const dir = active && req.query.dir !== "asc" ? "asc" : "desc";
    const arrow = active ? (dir === "asc" ? " ↑" : " ↓") : "";
    return `<a href="/players?q=${encodeURIComponent(search)}&sort=${field}&dir=${dir}" style="color:${active?"#a78bfa":"#888"}">${label}${arrow}</a>`;
  };
  const rows = players.map(p => `<tr>
    <td><strong>${p.username}</strong><br/><small style="color:#666">${p.userId}</small></td>
    <td>${p.currency.gold.toLocaleString()}</td><td>${p.currency.regularTickets} / ${p.currency.pickupTickets}</td>
    <td>${p.combatPower.toLocaleString()}</td><td>${p.loginStreak}</td>
    <td>
      <a href="/players/${p.userId}/give" class="btn btn-sm btn-green">Give Currency</a>
      <a href="/players/${p.userId}/give-card" class="btn btn-sm">Give Card</a>
    </td>
  </tr>`).join("");
  res.send(renderPage("Players", `
    <form method="GET" action="/players" style="display:flex;gap:10px;margin-bottom:16px;align-items:flex-end">
      <div style="flex:1"><label>Search by username</label><input name="q" value="${search}" placeholder="Search..." autofocus/></div>
      <input type="hidden" name="sort" value="${sortBy}"/>
      <button type="submit">Search</button>
      ${search ? `<a href="/players" class="btn btn-red">Clear</a>` : ""}
    </form>
    <div class="card"><table>
      <thead><tr>
        <th>Player</th>
        <th>${sortLink("gold","Duckcoin")}</th>
        <th>Tickets (R/P)</th>
        <th>${sortLink("cp","CP")}</th>
        <th>${sortLink("streak","Streak")}</th>
        <th>${sortLink("date","Joined")}</th>
        <th>Actions</th>
      </tr></thead>
      <tbody>${rows||"<tr><td colspan='7' style='color:#666;text-align:center'>No players found</td></tr>"}</tbody>
    </table></div>
  `, req.user));
});

app.get("/players/:id/give", auth, adminOnly, async (req, res) => {
  const player = await User.findOne({ userId: req.params.id });
  if (!player) return res.redirect("/players");
  res.send(renderPage(`Give Currency — ${player.username}`, `<div class="card" style="max-width:400px"><form method="POST" action="/players/${player.userId}/give"><div><label>Currency</label><select name="type"><option value="gold">Duckcoin</option><option value="regularTickets">Regular Tickets</option><option value="pickupTickets">Pick Up Tickets</option><option value="premiumCurrency">Premium</option></select></div><div><label>Amount</label><input type="number" name="amount" value="1000" min="1" required/></div><div style="display:flex;gap:10px"><button type="submit">Give</button><a href="/players" class="btn btn-red">Cancel</a></div></form></div>`, req.user));
});

app.post("/players/:id/give", auth, adminOnly, async (req, res) => {
  const { type, amount } = req.body;
  const player = await User.findOneAndUpdate({ userId: req.params.id }, { $inc: { [`currency.${type}`]: parseInt(amount) } }, { new: true });
  await audit(req.user, "update", "player", req.params.id, `Gave ${amount} ${type} to ${player?.username}`, null, null);
  res.redirect("/players");
});

app.get("/players/:id/give-card", auth, adminOnly, async (req, res) => {
  const player = await User.findOne({ userId: req.params.id });
  if (!player) return res.redirect("/players");
  const cards = await Card.find({ isAvailable: true }).sort({ anime: 1, rarity: 1, name: 1 });
  const options = cards.map(c => `<option value="${c.cardId}">[${c.rarity.toUpperCase()}] ${c.name} — ${c.anime} (${c.role})</option>`).join("");
  res.send(renderPage(`Give Card — ${player.username}`, `<div class="card" style="max-width:500px"><form method="POST" action="/players/${player.userId}/give-card"><div><label>Card</label><select name="cardId" required><option value="">— Select a card —</option>${options}</select></div><div style="margin-top:4px;font-size:12px;color:#666">Added at level 1 with next print number.</div><div style="display:flex;gap:10px;margin-top:8px"><button type="submit">Give Card</button><a href="/players" class="btn btn-red">Cancel</a></div></form></div>`, req.user));
});

app.post("/players/:id/give-card", auth, adminOnly, async (req, res) => {
  const { cardId } = req.body;
  const player = await User.findOne({ userId: req.params.id });
  const card = await Card.findOne({ cardId });
  if (!player || !card) return res.redirect("/players");
  const { calculateStats } = require("../services/cardStats");
  const updatedCard = await Card.findOneAndUpdate({ cardId }, { $inc: { totalPrints: 1 } }, { new: true });
  await PlayerCard.create({ userId: player.userId, cardId, printNumber: updatedCard.totalPrints, level: 1, cachedStats: calculateStats(card, 1) });
  await User.findOneAndUpdate({ userId: player.userId }, { $inc: { "stats.totalCardsEverObtained": 1 } });
  await audit(req.user, "update", "player", player.userId, `Gave card "${card.name}" (Print #${updatedCard.totalPrints}) to ${player.username}`, null, null);
  res.redirect("/players");
});

// ─── MEDIA ────────────────────────────────────────────────────────────────────
const catStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const CATS = ["banner","card","other"];
    const cat = CATS.includes(req.body?.category) ? req.body.category : "other";
    const dir = path.join(UPLOADS_DIR, cat);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = path.basename(file.originalname, ext).replace(/[^a-z0-9_-]/gi,"_").toLowerCase();
    cb(null, `${name}_${Date.now()}${ext}`);
  },
});
const upload = multer({ storage: catStorage, fileFilter: (req,file,cb) => {
  if ([".jpg",".jpeg",".png",".gif",".webp"].includes(path.extname(file.originalname).toLowerCase())) return cb(null,true);
  cb(new Error("Images only"));
}});

app.get("/media", auth, (req, res) => {
  const CATS = ["banner","card","other"];
  const category = CATS.includes(req.query.cat) ? req.query.cat : "banner";
  const catDir = path.join(UPLOADS_DIR, category);
  if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });
  const files = fs.readdirSync(catDir).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const tabs = CATS.map(c => `<a href="/media?cat=${c}" style="padding:8px 20px;border-radius:6px 6px 0 0;font-size:13px;text-decoration:none;background:${c===category?"#1a1a24":"transparent"};color:${c===category?"#a78bfa":"#888"};border:${c===category?"1px solid #2d2d3d":"1px solid transparent"};border-bottom:${c===category?"1px solid #1a1a24":"none"};margin-bottom:-1px">${c.charAt(0).toUpperCase()+c.slice(1)}</a>`).join("");
  const grid = files.length ? [...files].reverse().map(f => {
    const url = `${baseUrl}/uploads/${category}/${f}`;
    return `<div style="background:#0f0f13;border:1px solid #2d2d3d;border-radius:8px;overflow:hidden"><img src="/uploads/${category}/${f}" style="width:100%;height:130px;object-fit:cover;display:block"/>
    <div style="padding:8px"><div style="font-size:10px;color:#666;margin-bottom:6px;word-break:break-all">${f}</div>
    <div style="display:flex;gap:5px"><input type="text" value="${url}" readonly onclick="this.select()" style="flex:1;font-size:10px;padding:3px 7px;cursor:pointer"/>
    <button onclick="navigator.clipboard.writeText('${url}');this.textContent='✓';setTimeout(()=>this.textContent='Copy',1200)" class="btn btn-sm">Copy</button></div>
    <form method="POST" action="/media/delete?cat=${category}" style="margin-top:5px"><input type="hidden" name="filename" value="${f}"/><input type="hidden" name="category" value="${category}"/><button type="submit" class="btn btn-sm btn-red" style="width:100%" onclick="return confirm('Delete?')">Delete</button></form>
    </div></div>`;
  }).join("") : `<p style="color:#666;grid-column:1/-1;padding:20px 0">No images here yet.</p>`;
  res.send(renderPage("Media", `
    <div class="card" style="max-width:500px;margin-bottom:20px">
      <h2>Upload Image</h2>
      <form method="POST" action="/media/upload?cat=${category}" enctype="multipart/form-data">
        <div><label>Category</label><select name="category">${CATS.map(c=>`<option value="${c}" ${c===category?"selected":""}>${c.charAt(0).toUpperCase()+c.slice(1)}</option>`).join("")}</select></div>
        <div><label>File (jpg, png, gif, webp)</label><input type="file" name="image" accept="image/*" required/></div>
        <button type="submit">Upload</button>
      </form>
    </div>
    <div style="display:flex;gap:0;border-bottom:1px solid #2d2d3d;margin-bottom:16px">${tabs}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px">${grid}</div>
  `, req.user));
});

app.post("/media/upload", auth, (req, res) => {
  const CATS = ["banner","card","other"];
  upload.single("image")(req, res, err => {
    if (err) return res.send(renderPage("Error", `<div class="alert alert-red">${err.message}</div><a href="/media" class="btn">Back</a>`, req.user));
    const cat = CATS.includes(req.body?.category) ? req.body.category : "other";
    res.redirect(`/media?cat=${cat}`);
  });
});

app.post("/media/delete", auth, (req, res) => {
  const CATS = ["banner","card","other"];
  const { filename, category } = req.body;
  const cat = CATS.includes(category) ? category : "other";
  if (filename && /^[a-z0-9_\-.]+$/i.test(filename)) { const fp = path.join(UPLOADS_DIR, cat, filename); if (fs.existsSync(fp)) fs.unlinkSync(fp); }
  res.redirect(`/media?cat=${cat}`);
});

// ─── TEAM (admin only) ────────────────────────────────────────────────────────
app.get("/team", auth, adminOnly, async (req, res) => {
  const TeamMember = require("../models/TeamMember");
  const members = await TeamMember.find().sort({ createdAt: -1 });
  const rows = members.map(m => `<tr>
    <td><strong>${m.username}</strong>${m.discordId?`<br/><small style="color:#666">${m.discordId}</small>`:""}
    </td>
    <td><span class="badge ${m.role==="admin"?"badge-red":"badge-blue"}">${m.role}</span></td>
    <td><span class="badge ${m.isActive?"badge-green":"badge-gray"}">${m.isActive?"Active":"Disabled"}</span></td>
    <td style="color:#666;font-size:12px">${new Date(m.createdAt).toLocaleDateString("en-GB")}</td>
    <td>
      ${m.discordId !== req.user.discordId ? `<a href="/team/${m._id}/toggle" class="btn btn-sm ${m.isActive?"btn-red":""}">${m.isActive?"Disable":"Enable"}</a>` : "<span style='color:#666;font-size:12px'>You</span>"}
    </td>
  </tr>`).join("");
  res.send(renderPage("Team", `
    <div class="card" style="max-width:500px;margin-bottom:24px">
      <h2>Add Team Member by Discord ID</h2>
      <form method="POST" action="/team/new">
        <div class="row">
          <div><label>Discord User ID</label><input name="discordId" placeholder="123456789012345678" required/></div>
          <div><label>Display Name</label><input name="username" placeholder="Username" required/></div>
        </div>
        <div><label>Role</label><select name="role">
          <option value="editor">Editor (cards + banners)</option>
          <option value="admin">Admin (full access)</option>
        </select></div>
        <button type="submit">Add Member</button>
      </form>
    </div>
    <div class="card"><table>
      <thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Added</th><th>Actions</th></tr></thead>
      <tbody>${rows||"<tr><td colspan='5' style='color:#666;text-align:center'>No team members yet</td></tr>"}</tbody>
    </table></div>
  `, req.user));
});

app.post("/team/new", auth, adminOnly, async (req, res) => {
  const TeamMember = require("../models/TeamMember");
  const { discordId, username, role } = req.body;
  // Use discordId as "password" placeholder — auth is via Discord OAuth
  const bcrypt = require("bcrypt");
  const hash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 8);
  await TeamMember.create({ username, discordId, password: hash, role, createdBy: req.user.username });
  await audit(req.user, "create", "team", username, `Added team member "${username}" (${role}) — Discord: ${discordId}`, null, null);
  res.redirect("/team");
});

app.get("/team/:id/toggle", auth, adminOnly, async (req, res) => {
  const TeamMember = require("../models/TeamMember");
  const m = await TeamMember.findById(req.params.id);
  if (m && m.discordId !== req.user.discordId) {
    await m.updateOne({ isActive: !m.isActive });
    await audit(req.user, "update", "team", m.username, `${m.isActive?"Disabled":"Enabled"} "${m.username}"`, null, null);
  }
  res.redirect("/team");
});

// ─── AUDIT ────────────────────────────────────────────────────────────────────
app.get("/audit", auth, async (req, res) => {
  const filterUser = req.query.user || "";
  const filterResource = req.query.resource || "";
  const page = parseInt(req.query.page) || 1;
  const limit = 30;
  const query = {};
  if (filterUser) query.performedBy = filterUser;
  if (filterResource) query.resource = filterResource;
  const [logs, total] = await Promise.all([AuditLog.find(query).sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit), AuditLog.countDocuments(query)]);
  const totalPages = Math.ceil(total / limit);
  const actionBadge = { create:"badge-green",update:"badge-blue",delete:"badge-red" };
  const resourceBadge = { banner:"badge-purple",card:"badge-yellow",raid:"badge-orange",player:"badge-blue",team:"badge-gray",event:"badge-green",message:"badge-blue" };
  const rows = logs.map(l => {
    const canRollback = !l.rolledBack && l.before && ["card","banner"].includes(l.resource) && l.action === "update" && req.user.role === "admin";
    return `<tr>
      <td style="font-size:11px;color:#666">${new Date(l.createdAt).toLocaleString("en-GB")}</td>
      <td><span class="badge badge-purple">${l.performedBy}</span></td>
      <td><span class="badge ${actionBadge[l.action]||"badge-gray"}">${l.action}</span></td>
      <td><span class="badge ${resourceBadge[l.resource]||"badge-gray"}">${l.resource}</span></td>
      <td>${l.description}${l.rolledBack?` <span class="badge badge-red">rolled back</span>`:""}</td>
      <td>${canRollback?`<a href="/audit/${l._id}/rollback" class="btn btn-sm btn-red" onclick="return confirm('Rollback?')">Rollback</a>`:""}  </td>
    </tr>`;
  }).join("");
  const pagination = totalPages > 1 ? Array.from({length:totalPages},(_,i)=>i+1).map(p=>`<a href="/audit?page=${p}&user=${filterUser}&resource=${filterResource}" class="btn btn-sm ${p===page?"":"btn-gray"}" style="margin:2px">${p}</a>`).join("") : "";
  res.send(renderPage("Audit Log", `
    <form method="GET" action="/audit" style="display:flex;gap:11px;margin-bottom:18px;align-items:flex-end">
      <div style="flex:1"><label>User</label><input name="user" value="${filterUser}" placeholder="Filter by user"/></div>
      <div style="flex:1"><label>Resource</label><select name="resource"><option value="">All</option>${["banner","card","raid","player","team","event","message"].map(r=>`<option value="${r}" ${filterResource===r?"selected":""}>${r}</option>`).join("")}</select></div>
      <button type="submit">Filter</button><a href="/audit" class="btn btn-red">Clear</a>
    </form>
    <div class="card"><table><thead><tr><th>When</th><th>By</th><th>Action</th><th>Resource</th><th>Description</th><th></th></tr></thead><tbody>${rows||"<tr><td colspan='6' style='color:#666;text-align:center'>No logs yet</td></tr>"}</tbody></table></div>
    ${pagination?`<div style="margin-top:12px">${pagination}</div>`:""}
  `, req.user));
});

app.get("/audit/:id/rollback", auth, adminOnly, async (req, res) => {
  const log = await AuditLog.findById(req.params.id);
  if (!log || log.rolledBack || !log.before) return res.redirect("/audit");
  if (log.resource === "card") { const { _id, __v, createdAt, updatedAt, ...data } = log.before; await Card.findOneAndUpdate({ cardId: log.resourceId }, data); await audit(req.user, "update", "card", log.resourceId, `Rolled back card "${log.resourceId}"`, null, log.before); }
  else if (log.resource === "banner") { const { _id, __v, createdAt, updatedAt, ...data } = log.before; await Banner.findOneAndUpdate({ bannerId: log.resourceId }, data); await audit(req.user, "update", "banner", log.resourceId, `Rolled back banner "${log.resourceId}"`, null, log.before); }
  await log.updateOne({ rolledBack: true, rolledBackBy: req.user.username, rolledBackAt: new Date() });
  res.redirect("/audit");
});

// ─── Start ────────────────────────────────────────────────────────────────────
function startDashboard(discordClient) {
  app.locals.client = discordClient;
  app.listen(PORT, () => logger.info(`Dashboard running on port ${PORT}`));
}

module.exports = { startDashboard };
