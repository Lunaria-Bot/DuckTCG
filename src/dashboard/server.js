const express       = require("express");
const path          = require("path");
const crypto        = require("crypto");
const cookieParser  = require("cookie-parser");
const multer        = require("multer");
const fs            = require("fs");

const Banner          = require("../models/Banner");
const Card            = require("../models/Card");
const Raid            = require("../models/Raid");
const User            = require("../models/User");
const PlayerCard      = require("../models/PlayerCard");
const AuditLog        = require("../models/AuditLog");
const ScheduledEvent  = require("../models/ScheduledEvent");
const ScheduledMessage = require("../models/ScheduledMessage");
const Series           = require("../models/Series");
const logger          = require("../utils/logger");

const app    = express();
const PORT   = process.env.DASHBOARD_PORT || 3000;
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

const DISCORD_CLIENT_ID     = process.env.CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DASHBOARD_URL         = (process.env.DASHBOARD_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const REDIRECT_URI          = `${DASHBOARD_URL}/auth/callback`;
const DEFAULT_ADMIN_ID      = "912376040142307419";

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

function auth(req, res, next) {
  const sess = getSession(req);
  if (!sess) return res.redirect("/login");
  req.user = sess;
  next();
}
function adminOnly(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).send(renderPage("Forbidden", `<div class="alert alert-red"><strong>Access denied.</strong> Admin only.</div>`, req.user));
  next();
}
function editorOrAdmin(req, res, next) {
  if (!["admin","editor"].includes(req.user?.role)) return res.status(403).send(renderPage("Forbidden", `<div class="alert alert-red"><strong>Access denied.</strong> Editor or Admin required.</div>`, req.user));
  next();
}

async function audit(user, action, resource, resourceId, description, before = null, after = null) {
  await AuditLog.create({ performedBy: user.username, role: user.role, action, resource, resourceId, description, before, after });
}

// ─── Layout ───────────────────────────────────────────────────────────────────
function renderPage(title, content, user = null, activePage = "") {
  const isAdmin  = user?.role === "admin";
  const isEditor = ["admin","editor"].includes(user?.role);

  const navItems = user ? [
    { href: "/",         icon: "⬡",  label: "Dashboard",  always: true },
    { href: "/banners",  icon: "◈",  label: "Banners",    show: isEditor },
    { href: "/cards",    icon: "⬭",  label: "Cards",      show: isEditor },
    { href: "/series",   icon: "◇",  label: "Series",     show: isEditor },
    { href: "/raids",    icon: "⚔",  label: "Raids",      show: isAdmin },
    { href: "/players",  icon: "◉",  label: "Players",    show: isAdmin },
    { href: "/media",    icon: "▨",  label: "Media",      show: isEditor },
    { href: "/calendar", icon: "◫",  label: "Calendar",   show: isEditor },
    { href: "/messages", icon: "▤",  label: "Messages",   always: true },
    { href: "/team",     icon: "◎",  label: "Team",       show: isAdmin },
    { href: "/audit",    icon: "▦",  label: "Audit Log",  always: true },
  ].filter(n => n.always || n.show) : [];

  const currentPath = activePage || "";

  const sidebar = user ? `
    <aside class="sidebar">
      <div class="sidebar-brand">
        <span class="brand-duck">🌸</span>
        <span class="brand-name">SeorinTCG</span>
      </div>
      <nav class="sidebar-nav">
        ${navItems.map(n => `
          <a href="${n.href}" class="nav-item ${currentPath === n.href ? "active" : ""}">
            <span class="nav-icon">${n.icon}</span>
            <span class="nav-label">${n.label}</span>
          </a>
        `).join("")}
      </nav>
      <div class="sidebar-footer">
        ${user.avatar ? `<img src="https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png" class="user-avatar"/>` : `<div class="user-avatar-placeholder">${user.username[0].toUpperCase()}</div>`}
        <div class="user-info">
          <div class="user-name">${user.username}</div>
          <div class="user-role role-${user.role}">${user.role}</div>
        </div>
        <a href="/logout" class="logout-btn" title="Logout">⏻</a>
      </div>
    </aside>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title} — SeorinTCG</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
  <style>
    :root {
      --bg:       #0c0c11;
      --bg2:      #121218;
      --bg3:      #18181f;
      --bg4:      #1e1e28;
      --border:   #2a2a38;
      --border2:  #353548;
      --text:     #e8e8f0;
      --text2:    #9090aa;
      --text3:    #5a5a72;
      --accent:   #8b5cf6;
      --accent2:  #7c3aed;
      --accent3:  #a78bfa;
      --green:    #10b981;
      --red:      #ef4444;
      --yellow:   #f59e0b;
      --blue:     #3b82f6;
      --sidebar-w: 220px;
      --radius:   10px;
      --radius-sm: 6px;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Outfit', sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
    }
    a { color: var(--accent3); text-decoration: none; }
    a:hover { color: var(--text); }
    code, .mono { font-family: 'JetBrains Mono', monospace; font-size: 0.85em; }

    /* ── Sidebar ── */
    .sidebar {
      width: var(--sidebar-w);
      min-height: 100vh;
      background: var(--bg2);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      position: fixed;
      top: 0; left: 0;
      z-index: 100;
    }
    .sidebar-brand {
      padding: 20px 20px 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      border-bottom: 1px solid var(--border);
    }
    .brand-duck { font-size: 22px; }
    .brand-name { font-size: 16px; font-weight: 700; color: var(--text); letter-spacing: -0.3px; }
    .sidebar-nav {
      flex: 1;
      padding: 12px 10px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      border-radius: var(--radius-sm);
      color: var(--text2);
      font-size: 13.5px;
      font-weight: 500;
      transition: all 0.15s;
    }
    .nav-item:hover { background: var(--bg3); color: var(--text); }
    .nav-item.active { background: rgba(139,92,246,0.15); color: var(--accent3); border-left: 2px solid var(--accent); padding-left: 10px; }
    .nav-icon { font-size: 14px; width: 18px; text-align: center; }
    .sidebar-footer {
      padding: 14px 16px;
      border-top: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .user-avatar { width: 32px; height: 32px; border-radius: 50%; }
    .user-avatar-placeholder {
      width: 32px; height: 32px; border-radius: 50%;
      background: var(--accent2);
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 700;
    }
    .user-info { flex: 1; min-width: 0; }
    .user-name { font-size: 13px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .user-role { font-size: 11px; margin-top: 1px; }
    .role-admin  { color: #f87171; }
    .role-editor { color: var(--accent3); }
    .logout-btn { color: var(--text3); font-size: 16px; cursor: pointer; transition: color 0.15s; flex-shrink: 0; }
    .logout-btn:hover { color: var(--red); }

    /* ── Main ── */
    .main {
      margin-left: var(--sidebar-w);
      flex: 1;
      min-height: 100vh;
    }
    .topbar {
      background: var(--bg2);
      border-bottom: 1px solid var(--border);
      padding: 14px 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 50;
    }
    .topbar-title { font-size: 17px; font-weight: 600; color: var(--text); }
    .topbar-actions { display: flex; align-items: center; gap: 10px; }
    .container { padding: 28px; max-width: 1280px; }

    /* ── Typography ── */
    h1 { font-size: 22px; font-weight: 700; color: var(--text); margin-bottom: 20px; }
    h2 { font-size: 15px; font-weight: 600; color: var(--text); margin-bottom: 14px; letter-spacing: -0.1px; }
    h3 { font-size: 13px; font-weight: 600; color: var(--text2); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; }

    /* ── Cards ── */
    .card {
      background: var(--bg3);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      margin-bottom: 20px;
    }
    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .card-header h2 { margin-bottom: 0; }

    /* ── Stat Grid ── */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 14px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--bg3);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 18px 20px;
    }
    .stat-label { font-size: 11px; font-weight: 600; color: var(--text3); text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 8px; }
    .stat-value { font-size: 28px; font-weight: 700; color: var(--text); line-height: 1; }
    .stat-sub { font-size: 11px; color: var(--text3); margin-top: 4px; }
    .stat-card.accent { border-color: rgba(139,92,246,0.35); background: rgba(139,92,246,0.06); }
    .stat-card.accent .stat-value { color: var(--accent3); }

    /* ── Tables ── */
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th {
      text-align: left;
      padding: 9px 12px;
      font-size: 11px;
      font-weight: 600;
      color: var(--text3);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    td { padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    tbody tr:hover td { background: var(--bg4); }

    /* ── Badges ── */
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .badge-purple  { background: rgba(139,92,246,0.15); color: #c4b5fd; }
    .badge-blue    { background: rgba(59,130,246,0.15);  color: #93c5fd; }
    .badge-green   { background: rgba(16,185,129,0.15);  color: #6ee7b7; }
    .badge-red     { background: rgba(239,68,68,0.15);   color: #fca5a5; }
    .badge-yellow  { background: rgba(245,158,11,0.15);  color: #fcd34d; }
    .badge-orange  { background: rgba(249,115,22,0.15);  color: #fdba74; }
    .badge-gray    { background: rgba(90,90,114,0.2);    color: #9090aa; }

    /* ── Buttons ── */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: var(--radius-sm);
      font-size: 13px;
      font-weight: 600;
      font-family: 'Outfit', sans-serif;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.15s;
      background: var(--accent2);
      color: #fff;
      text-decoration: none;
    }
    .btn:hover { background: var(--accent); color: #fff; }
    .btn-sm { padding: 5px 10px; font-size: 12px; }
    .btn-ghost { background: transparent; border-color: var(--border2); color: var(--text2); }
    .btn-ghost:hover { border-color: var(--accent); color: var(--accent3); background: transparent; }
    .btn-red   { background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.3); color: #fca5a5; }
    .btn-red:hover { background: rgba(239,68,68,0.25); color: #fca5a5; }
    .btn-green { background: rgba(16,185,129,0.15); border-color: rgba(16,185,129,0.3); color: #6ee7b7; }
    .btn-green:hover { background: rgba(16,185,129,0.25); color: #6ee7b7; }
    .btn-gray  { background: var(--bg4); border-color: var(--border); color: var(--text2); }
    .btn-gray:hover { border-color: var(--border2); color: var(--text); }
    button { font-family: 'Outfit', sans-serif; }

    /* ── Forms ── */
    .form-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
    label { font-size: 12px; font-weight: 600; color: var(--text2); letter-spacing: 0.03em; }
    input, select, textarea {
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      color: var(--text);
      padding: 8px 12px;
      font-size: 13px;
      font-family: 'Outfit', sans-serif;
      width: 100%;
      transition: border-color 0.15s;
    }
    input:focus, select:focus, textarea:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(139,92,246,0.12);
    }
    input[type="color"] { padding: 3px 6px; height: 38px; cursor: pointer; }
    input[type="checkbox"] { width: auto; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .form-row3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
    .form-actions { display: flex; gap: 10px; margin-top: 6px; }
    .form-box { background: var(--bg3); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; max-width: 640px; margin-bottom: 20px; }

    /* ── Alerts ── */
    .alert { padding: 12px 16px; border-radius: var(--radius-sm); margin-bottom: 16px; font-size: 13px; }
    .alert-green { background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.25); color: #6ee7b7; }
    .alert-red   { background: rgba(239,68,68,0.1);  border: 1px solid rgba(239,68,68,0.25);  color: #fca5a5; }
    .alert-blue  { background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.25); color: #93c5fd; }

    /* ── Layout Helpers ── */
    .two-col  { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .three-col{ display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }
    .page-actions { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
    .back-link { color: var(--text2); font-size: 13px; display: inline-flex; align-items: center; gap: 6px; margin-bottom: 16px; }
    .back-link:hover { color: var(--text); }
    .empty-state { text-align: center; padding: 32px; color: var(--text3); font-size: 13px; }

    /* ── Search bar ── */
    .search-bar { display: flex; gap: 10px; margin-bottom: 20px; align-items: flex-end; }
    .search-bar input { max-width: 320px; }

    /* ── Calendar ── */
    .cal-header-row { display: grid; grid-template-columns: repeat(7,1fr); gap: 3px; margin-bottom: 3px; }
    .cal-header-day { text-align: center; font-size: 11px; font-weight: 600; color: var(--text3); padding: 6px 0; text-transform: uppercase; letter-spacing: 0.06em; }
    .cal-grid { display: grid; grid-template-columns: repeat(7,1fr); gap: 3px; }
    .cal-day { background: var(--bg3); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 6px 8px; min-height: 80px; font-size: 12px; }
    .cal-day.today { border-color: var(--accent); }
    .cal-day.other-month { opacity: 0.3; }
    .cal-day-num { font-size: 11px; font-weight: 600; color: var(--text3); margin-bottom: 4px; }
    .cal-event { border-radius: 3px; padding: 2px 5px; font-size: 10px; margin-bottom: 2px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }

    /* ── Misc ── */
    .avatar-sm { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }
    .img-thumb { width: 40px; height: 40px; border-radius: var(--radius-sm); object-fit: cover; }
    .text-muted { color: var(--text2); }
    .text-dim   { color: var(--text3); }
    .text-sm    { font-size: 12px; }
    .mono-sm    { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text3); }
    .divider    { border: none; border-top: 1px solid var(--border); margin: 16px 0; }
    .tag-available   { color: var(--green); font-size: 11px; font-weight: 600; }
    .tag-unavailable { color: var(--red);   font-size: 11px; font-weight: 600; }

    /* ── Scrollbar ── */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: var(--bg2); }
    ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 3px; }

    /* ── Login page ── */
    .login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--bg); }
    .login-card {
      background: var(--bg3);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 40px;
      width: 340px;
      text-align: center;
    }
    .login-duck { font-size: 48px; margin-bottom: 16px; }
    .login-title { font-size: 22px; font-weight: 700; color: var(--text); margin-bottom: 6px; }
    .login-sub { font-size: 13px; color: var(--text2); margin-bottom: 24px; }
    .discord-btn {
      display: flex; align-items: center; justify-content: center; gap: 10px;
      background: #5865F2; color: #fff; border: none; border-radius: var(--radius-sm);
      padding: 12px 20px; font-size: 14px; font-weight: 600; font-family: 'Outfit', sans-serif;
      cursor: pointer; width: 100%; text-decoration: none; transition: background 0.15s;
    }
    .discord-btn:hover { background: #4752c4; color: #fff; }
  </style>
</head>
<body>
${sidebar}
<div class="${user ? "main" : ""}">
  ${user ? `
  <div class="topbar">
    <div class="topbar-title">${title}</div>
    <div class="topbar-actions" id="topbar-actions"></div>
  </div>
  <div class="container">
    ${content}
  </div>` : content}
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
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const count = await AuditLog.countDocuments({ createdAt: { $gte: since } });
  res.json({ count });
});

// ─── Auth ─────────────────────────────────────────────────────────────────────
app.get("/login", (req, res) => {
  if (getSession(req)) return res.redirect("/");
  const state = crypto.randomBytes(16).toString("hex");
  res.cookie("oauth_state", state, { httpOnly: true, maxAge: 5 * 60 * 1000 });
  const params = new URLSearchParams({ client_id: DISCORD_CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: "code", scope: "identify", state });
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><link rel="preconnect" href="https://fonts.googleapis.com"/><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap" rel="stylesheet"/><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Outfit',sans-serif;background:#0c0c11;color:#e8e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center}.login-card{background:#18181f;border:1px solid #2a2a38;border-radius:14px;padding:40px;width:340px;text-align:center}.duck{font-size:48px;margin-bottom:16px}.title{font-size:22px;font-weight:700;margin-bottom:6px}.sub{font-size:13px;color:#9090aa;margin-bottom:24px}.discord-btn{display:flex;align-items:center;justify-content:center;gap:10px;background:#5865F2;color:#fff;border:none;border-radius:6px;padding:12px 20px;font-size:14px;font-weight:600;font-family:'Outfit',sans-serif;cursor:pointer;width:100%;text-decoration:none;transition:background 0.15s}.discord-btn:hover{background:#4752c4}</style></head><body><div class="login-card"><div class="duck">🌸</div><div class="title">SeorinTCG Admin</div><div class="sub">Sign in with your Discord account</div><a href="https://discord.com/api/oauth2/authorize?${params}" class="discord-btn"><svg width="20" height="20" viewBox="0 0 71 55" fill="white"><path d="M60.1 4.9A58.5 58.5 0 0 0 45.6.4a40 40 0 0 0-1.8 3.6 54.2 54.2 0 0 0-16.2 0A40 40 0 0 0 25.8.4 58.5 58.5 0 0 0 11.2 4.9C1.6 19.2-.9 33.1.3 46.8a59 59 0 0 0 17.9 9 42 42 0 0 0 3.7-6 38.3 38.3 0 0 1-5.8-2.8l1.4-1.1a42 42 0 0 0 36.2 0l1.4 1.1a38.3 38.3 0 0 1-5.8 2.8 42 42 0 0 0 3.6 6 58.7 58.7 0 0 0 17.9-9C72.3 30.8 68.4 17 60.1 4.9zM23.7 38.3c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.5 0 6.4 3.3 6.3 7.2 0 4-2.8 7.2-6.3 7.2zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.5 0 6.4 3.3 6.3 7.2 0 4-2.8 7.2-6.3 7.2z"/></svg>Login with Discord</a></div></body></html>`);
});

app.get("/auth/callback", async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state || state !== req.cookies?.oauth_state) return res.redirect("/login");
  res.clearCookie("oauth_state");
  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI }) });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.redirect("/login?err=token");
    const userRes = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    const discordUser = await userRes.json();
    let role = null;
    if (discordUser.id === DEFAULT_ADMIN_ID) { role = "admin"; }
    else { const member = await require("../models/TeamMember").findOne({ discordId: discordUser.id, isActive: true }); if (member) role = member.role; }
    if (!role) return res.send(renderPage("Access Denied", `<div style="max-width:400px;margin:60px auto;text-align:center"><div style="font-size:40px;margin-bottom:16px">🔒</div><h2>Access Denied</h2><p style="color:var(--text2);margin-top:8px;font-size:13px">Your Discord account is not authorized.</p><p class="mono-sm" style="margin-top:8px">${discordUser.id}</p><a href="/logout" class="btn btn-red" style="margin-top:16px">Back</a></div>`));
    setSession(res, { discordId: discordUser.id, username: discordUser.global_name || discordUser.username, avatar: discordUser.avatar, role });
    res.redirect("/");
  } catch (err) { logger.error("OAuth2 error:", err); res.redirect("/login?err=1"); }
});
app.get("/logout", (req, res) => { res.clearCookie("sess"); res.redirect("/login"); });

// ─── DASHBOARD HOME ───────────────────────────────────────────────────────────
app.get("/", auth, async (req, res) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart  = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 7);
  const [userCount, cardCount, bannerCount, pcCount, pullsToday, pullsWeek] = await Promise.all([
    User.countDocuments(), Card.countDocuments({ isAvailable: true }),
    Banner.countDocuments({ isActive: true }), PlayerCard.countDocuments({ isBurned: false }),
    PlayerCard.countDocuments({ createdAt: { $gte: todayStart } }),
    PlayerCard.countDocuments({ createdAt: { $gte: weekStart } }),
  ]);
  const topPlayers = await User.find().sort({ combatPower: -1 }).limit(5);
  const recentLogs = await AuditLog.find().sort({ createdAt: -1 }).limit(8);
  const upcomingEvents = await ScheduledEvent.find({ startDate: { $gte: new Date() } }).sort({ startDate: 1 }).limit(5);

  const actionBadge = { create:"badge-green", update:"badge-blue", delete:"badge-red" };

  res.send(renderPage("Dashboard", `
    <div class="stats-grid">
      <div class="stat-card accent">
        <div class="stat-label">Players</div>
        <div class="stat-value">${userCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Cards Available</div>
        <div class="stat-value">${cardCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active Banners</div>
        <div class="stat-value">${bannerCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Cards Owned</div>
        <div class="stat-value">${pcCount.toLocaleString()}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Pulls Today</div>
        <div class="stat-value">${pullsToday}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Pulls This Week</div>
        <div class="stat-value">${pullsWeek.toLocaleString()}</div>
      </div>
    </div>

    <div class="two-col">
      <div>
        <div class="card">
          <div class="card-header"><h2>Top Players</h2></div>
          <div class="table-wrap"><table>
            <thead><tr><th>#</th><th>Player</th><th>CP</th><th>Level</th><th>Cards</th></tr></thead>
            <tbody>${topPlayers.map((p,i) => `<tr>
              <td class="text-dim text-sm">${i+1}</td>
              <td><strong>${p.username}</strong></td>
              <td>${p.combatPower.toLocaleString()}</td>
              <td>Lv.${p.accountLevel}</td>
              <td>${p.stats.totalCardsEverObtained}</td>
            </tr>`).join("") || `<tr><td colspan="5" class="empty-state">No players yet</td></tr>`}
            </tbody>
          </table></div>
        </div>

        <div class="card">
          <div class="card-header">
            <h2>Upcoming Events</h2>
            <a href="/calendar" class="btn btn-ghost btn-sm">View Calendar</a>
          </div>
          ${upcomingEvents.length ? upcomingEvents.map(e => `
            <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
              <span style="width:8px;height:8px;border-radius:50%;background:${e.color};flex-shrink:0"></span>
              <span style="flex:1;font-size:13px"><strong>${e.title}</strong></span>
              <span class="badge badge-gray">${e.type}</span>
              <span class="text-dim text-sm">${new Date(e.startDate).toLocaleDateString("en-GB")}</span>
            </div>`).join("") : `<div class="empty-state">No upcoming events</div>`}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h2>Recent Activity</h2>
          <a href="/audit" class="btn btn-ghost btn-sm">View All</a>
        </div>
        <div style="display:flex;flex-direction:column;gap:1px">
          ${recentLogs.map(l => `
            <div style="display:flex;align-items:flex-start;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">
              <span class="badge ${actionBadge[l.action]||"badge-gray"}" style="flex-shrink:0;margin-top:1px">${l.action}</span>
              <div style="flex:1;min-width:0">
                <div style="font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${l.description}</div>
                <div style="font-size:11px;color:var(--text3);margin-top:2px">${l.performedBy} · ${new Date(l.createdAt).toLocaleString("en-GB")}</div>
              </div>
            </div>`).join("") || `<div class="empty-state">No activity yet</div>`}
        </div>
      </div>
    </div>
  `, req.user, "/"));
});

// ─── CALENDAR ─────────────────────────────────────────────────────────────────
app.get("/calendar", auth, editorOrAdmin, async (req, res) => {
  const now = new Date();
  const year  = parseInt(req.query.year  || now.getFullYear());
  const month = parseInt(req.query.month || now.getMonth());
  const start = new Date(year, month, 1);
  const end   = new Date(year, month + 1, 0);
  const events = await ScheduledEvent.find({ startDate: { $gte: new Date(year, month-1, 15), $lte: new Date(year, month+1, 15) } });
  const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const monthName = start.toLocaleString("en-US", { month: "long", year: "numeric" });
  const prevMonth = month === 0 ? { year: year-1, month: 11 } : { year, month: month-1 };
  const nextMonth = month === 11 ? { year: year+1, month: 0 } : { year, month: month+1 };
  const eventMap = {};
  for (const e of events) { const key = new Date(e.startDate).toISOString().slice(0,10); if (!eventMap[key]) eventMap[key] = []; eventMap[key].push(e); }
  const firstDow = start.getDay();
  const daysInMonth = end.getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  let cells = "";
  let dayCount = 0;
  for (let i = firstDow-1; i >= 0; i--) { cells += `<div class="cal-day other-month"><div class="cal-day-num">${daysInPrev-i}</div></div>`; dayCount++; }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const isToday = dateStr === now.toISOString().slice(0,10);
    const dayEvents = eventMap[dateStr] || [];
    const evHtml = dayEvents.slice(0,3).map(e => `<div class="cal-event" style="background:${e.color}22;border-left:2px solid ${e.color};color:${e.color}">${e.title}</div>`).join("") + (dayEvents.length > 3 ? `<div class="text-sm text-dim">+${dayEvents.length-3}</div>` : "");
    cells += `<div class="cal-day ${isToday?"today":""}"><div class="cal-day-num">${d}</div>${evHtml}</div>`; dayCount++;
  }
  for (let d = 1; d <= 42-dayCount; d++) cells += `<div class="cal-day other-month"><div class="cal-day-num">${d}</div></div>`;

  res.send(renderPage("Calendar", `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <div style="display:flex;gap:8px;align-items:center">
        <a href="/calendar?year=${prevMonth.year}&month=${prevMonth.month}" class="btn btn-ghost btn-sm">←</a>
        <h2 style="margin:0;font-size:18px">${monthName}</h2>
        <a href="/calendar?year=${nextMonth.year}&month=${nextMonth.month}" class="btn btn-ghost btn-sm">→</a>
        <a href="/calendar?year=${now.getFullYear()}&month=${now.getMonth()}" class="btn btn-gray btn-sm" style="margin-left:4px">Today</a>
      </div>
      <a href="/calendar/new" class="btn">+ Add Event</a>
    </div>
    <div class="cal-header-row">${DAYS.map(d=>`<div class="cal-header-day">${d}</div>`).join("")}</div>
    <div class="cal-grid" style="margin-bottom:24px">${cells}</div>
    <div class="card">
      <div class="card-header"><h2>All Events</h2></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Title</th><th>Type</th><th>Start</th><th>End</th><th>Actions</th></tr></thead>
        <tbody>${events.sort((a,b)=>a.startDate-b.startDate).map(e=>`<tr>
          <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${e.color};margin-right:8px"></span><strong>${e.title}</strong></td>
          <td><span class="badge badge-gray">${e.type}</span></td>
          <td class="text-sm text-muted">${new Date(e.startDate).toLocaleDateString("en-GB")}</td>
          <td class="text-sm text-muted">${e.endDate?new Date(e.endDate).toLocaleDateString("en-GB"):"—"}</td>
          <td><a href="/calendar/${e._id}/edit" class="btn btn-gray btn-sm">Edit</a> <a href="/calendar/${e._id}/delete" class="btn btn-red btn-sm" onclick="return confirm('Delete?')">Delete</a></td>
        </tr>`).join("")||`<tr><td colspan="5" class="empty-state">No events</td></tr>`}
        </tbody>
      </table></div>
    </div>
  `, req.user, "/calendar"));
});

app.get("/calendar/new", auth, editorOrAdmin, async (req, res) => {
  const banners = await Banner.find().sort({ name: 1 });
  res.send(renderPage("New Event", `
    <a href="/calendar" class="back-link">← Back to Calendar</a>
    <div class="form-box">
      <form method="POST" action="/calendar/new" style="display:flex;flex-direction:column;gap:0">
        <div class="form-group"><label>Title</label><input name="title" placeholder="Banner Release: Naruto" required/></div>
        <div class="form-row">
          <div class="form-group"><label>Type</label><select name="type"><option value="banner">Banner</option><option value="event">Event</option><option value="raid">Raid</option><option value="maintenance">Maintenance</option><option value="other">Other</option></select></div>
          <div class="form-group"><label>Color</label><input type="color" name="color" value="#8b5cf6"/></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Start Date</label><input type="datetime-local" name="startDate" required/></div>
          <div class="form-group"><label>End Date (optional)</label><input type="datetime-local" name="endDate"/></div>
        </div>
        <div class="form-group"><label>Linked Banner (optional)</label><select name="bannerId"><option value="">— None —</option>${banners.map(b=>`<option value="${b.bannerId}">${b.name}</option>`).join("")}</select></div>
        <div class="form-group"><label>Description</label><textarea name="description" rows="3" placeholder="Event description..."></textarea></div>
        <div class="form-actions"><button type="submit" class="btn">Create Event</button><a href="/calendar" class="btn btn-ghost">Cancel</a></div>
      </form>
    </div>
  `, req.user, "/calendar"));
});

app.post("/calendar/new", auth, editorOrAdmin, async (req, res) => {
  const { title, type, color, startDate, endDate, bannerId, description } = req.body;
  await ScheduledEvent.create({ title, type, color, description, startDate: new Date(startDate), endDate: endDate?new Date(endDate):null, bannerId: bannerId||null, createdBy: req.user.username });
  await audit(req.user, "create", "event", title, `Created event "${title}"`, null, null);
  res.redirect("/calendar");
});

app.get("/calendar/:id/edit", auth, editorOrAdmin, async (req, res) => {
  const event = await ScheduledEvent.findById(req.params.id);
  if (!event) return res.redirect("/calendar");
  const fmt = d => d ? new Date(d).toISOString().slice(0,16) : "";
  const banners = await Banner.find().sort({ name: 1 });
  res.send(renderPage(`Edit Event`, `
    <a href="/calendar" class="back-link">← Back to Calendar</a>
    <div class="form-box">
      <form method="POST" action="/calendar/${event._id}/edit" style="display:flex;flex-direction:column;gap:0">
        <div class="form-group"><label>Title</label><input name="title" value="${event.title}" required/></div>
        <div class="form-row">
          <div class="form-group"><label>Type</label><select name="type">${["banner","event","raid","maintenance","other"].map(t=>`<option value="${t}"${event.type===t?" selected":""}>${t}</option>`).join("")}</select></div>
          <div class="form-group"><label>Color</label><input type="color" name="color" value="${event.color||"#8b5cf6"}"/></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Start Date</label><input type="datetime-local" name="startDate" value="${fmt(event.startDate)}" required/></div>
          <div class="form-group"><label>End Date</label><input type="datetime-local" name="endDate" value="${fmt(event.endDate)}"/></div>
        </div>
        <div class="form-group"><label>Linked Banner</label><select name="bannerId"><option value="">— None —</option>${banners.map(b=>`<option value="${b.bannerId}"${event.bannerId===b.bannerId?" selected":""}>${b.name}</option>`).join("")}</select></div>
        <div class="form-group"><label>Description</label><textarea name="description" rows="3">${event.description||""}</textarea></div>
        <div class="form-actions"><button type="submit" class="btn">Save</button><a href="/calendar" class="btn btn-ghost">Cancel</a></div>
      </form>
    </div>
  `, req.user, "/calendar"));
});
app.post("/calendar/:id/edit", auth, editorOrAdmin, async (req, res) => {
  const { title, type, color, startDate, endDate, bannerId, description } = req.body;
  await ScheduledEvent.findByIdAndUpdate(req.params.id, { title, type, color, description, startDate: new Date(startDate), endDate: endDate?new Date(endDate):null, bannerId: bannerId||null });
  res.redirect("/calendar");
});
app.get("/calendar/:id/delete", auth, editorOrAdmin, async (req, res) => {
  const e = await ScheduledEvent.findByIdAndDelete(req.params.id);
  if (e) await audit(req.user, "delete", "event", req.params.id, `Deleted event "${e.title}"`, null, null);
  res.redirect("/calendar");
});

// ─── MESSAGES ─────────────────────────────────────────────────────────────────
app.get("/messages", auth, async (req, res) => {
  const messages = await ScheduledMessage.find().sort({ scheduledAt: -1 }).limit(50);
  const now = new Date();
  res.send(renderPage("Messages", `
    <div class="two-col" style="align-items:flex-start">
      <div class="form-box" style="margin-bottom:0">
        <h2 style="margin-bottom:16px">Schedule New Message</h2>
        <form method="POST" action="/messages/new" style="display:flex;flex-direction:column;gap:0">
          <div class="form-group"><label>Title</label><input name="title" placeholder="Message title" required/></div>
          <div class="form-group"><label>Channel ID</label><input name="channelId" placeholder="Discord channel ID" required/></div>
          <div class="form-group"><label>Schedule At</label><input type="datetime-local" name="scheduledAt" required/></div>
          <div class="form-group"><label>Content (optional)</label><textarea name="content" rows="2" placeholder="Plain text message..."></textarea></div>
          <div class="form-group"><label>Embed Title</label><input name="embedTitle" placeholder="Embed title..."/></div>
          <div class="form-group"><label>Embed Description</label><textarea name="embedDesc" rows="3" placeholder="Embed description..."></textarea></div>
          <div class="form-row">
            <div class="form-group"><label>Embed Color</label><input type="color" name="embedColor" value="#8b5cf6"/></div>
            <div class="form-group"><label>Embed Image URL</label><input name="embedImage" placeholder="https://..."/></div>
          </div>
          <div class="form-actions"><button type="submit" class="btn">Schedule</button></div>
        </form>
      </div>
      <div class="card" style="margin-bottom:0">
        <div class="card-header"><h2>Scheduled Messages</h2></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Title</th><th>Channel</th><th>Scheduled</th><th>Status</th><th></th></tr></thead>
          <tbody>${messages.map(m=>`<tr>
            <td><strong>${m.title}</strong></td>
            <td class="mono-sm">${m.channelId}</td>
            <td class="text-sm text-muted">${new Date(m.scheduledAt).toLocaleString("en-GB")}</td>
            <td>${m.sent?`<span class="badge badge-green">Sent</span>`:(new Date(m.scheduledAt)<now?`<span class="badge badge-yellow">Pending</span>`:`<span class="badge badge-gray">Queued</span>`)}</td>
            <td style="display:flex;gap:5px">
              ${!m.sent?`<a href="/messages/${m._id}/send-now" class="btn btn-green btn-sm" onclick="return confirm('Send now?')">Send</a>`:""}
              <a href="/messages/${m._id}/delete" class="btn btn-red btn-sm" onclick="return confirm('Delete?')">Delete</a>
            </td>
          </tr>`).join("")||`<tr><td colspan="5" class="empty-state">No messages</td></tr>`}
          </tbody>
        </table></div>
      </div>
    </div>
  `, req.user, "/messages"));
});
app.post("/messages/new", auth, async (req, res) => {
  const { title, channelId, scheduledAt, content, embedTitle, embedDesc, embedColor, embedImage } = req.body;
  await ScheduledMessage.create({ title, channelId, scheduledAt: new Date(scheduledAt), content: content||"", embedTitle: embedTitle||"", embedDesc: embedDesc||"", embedColor: embedColor||"#8b5cf6", embedImage: embedImage||"", createdBy: req.user.username });
  await audit(req.user, "create", "message", title, `Scheduled message "${title}"`, null, null);
  res.redirect("/messages");
});
app.get("/messages/:id/send-now", auth, async (req, res) => {
  await ScheduledMessage.findByIdAndUpdate(req.params.id, { scheduledAt: new Date(Date.now()-1000) });
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
  res.send(renderPage("Banners", `
    <div class="page-actions"><a href="/banners/new" class="btn">+ New Banner</a></div>
    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr><th>Banner</th><th>Type</th><th>Status</th><th>Ends</th><th>Pool</th><th>Actions</th></tr></thead>
        <tbody>${banners.map(b => {
          const poolTotal = (b.pool.common?.length||0)+(b.pool.rare?.length||0)+(b.pool.special?.length||0)+(b.pool.exceptional?.length||0);
          return `<tr>
            <td><div style="font-weight:600">${b.name}</div><div class="mono-sm">${b.bannerId}</div></td>
            <td>${b.type==="pickup"?`<span class="badge badge-purple">Pick Up</span>`:`<span class="badge badge-blue">Regular</span>`}</td>
            <td>${b.isActive?`<span class="badge badge-green">Active</span>`:`<span class="badge badge-gray">Inactive</span>`}</td>
            <td class="text-sm text-muted">${b.endsAt?new Date(b.endsAt).toLocaleDateString("en-GB"):"Permanent"}</td>
            <td class="text-sm">${poolTotal} cards</td>
            <td style="display:flex;gap:5px;flex-wrap:wrap">
              <a href="/banners/${b.bannerId}/edit" class="btn btn-gray btn-sm">Edit</a>
              <a href="/banners/${b.bannerId}/pool" class="btn btn-gray btn-sm">Pool</a>
              <a href="/banners/${b.bannerId}/stats" class="btn btn-ghost btn-sm">Stats</a>
              <a href="/banners/${b.bannerId}/toggle" class="btn ${b.isActive?"btn-red":"btn-green"} btn-sm">${b.isActive?"Disable":"Enable"}</a>
            </td>
          </tr>`;
        }).join("")||`<tr><td colspan="6" class="empty-state">No banners yet</td></tr>`}
        </tbody>
      </table></div>
    </div>
  `, req.user, "/banners"));
});

app.get("/banners/new", auth, editorOrAdmin, (req, res) => {
  res.send(renderPage("New Banner", `
    <a href="/banners" class="back-link">← Back to Banners</a>
    <div class="form-box">
      <form method="POST" action="/banners/new" style="display:flex;flex-direction:column;gap:0">
        <div class="form-row">
          <div class="form-group"><label>Banner ID</label><input name="bannerId" placeholder="naruto_pickup_1" required/></div>
          <div class="form-group"><label>Type</label><select name="type"><option value="pickup">Pick Up</option><option value="regular">Regular</option></select></div>
        </div>
        <div class="form-group"><label>Name</label><input name="name" placeholder="Pick Up! Naruto" required/></div>
        <div class="form-group"><label>Anime</label><input name="anime" placeholder="Naruto" required/></div>
        <div class="form-group"><label>Image URL</label><input name="imageUrl" placeholder="https://..."/></div>
        <div class="form-group"><label>Description</label><input name="description" placeholder="Banner description..."/></div>
        <div class="form-row">
          <div class="form-group"><label>Starts At</label><input type="date" name="startsAt" required/></div>
          <div class="form-group"><label>Ends At (empty = permanent)</label><input type="date" name="endsAt"/></div>
        </div>
        <div class="form-row3">
          <div class="form-group"><label>Common %</label><input type="number" name="rateCommon" value="60"/></div>
          <div class="form-group"><label>Rare %</label><input type="number" name="rateRare" value="25"/></div>
          <div class="form-group"><label>Special %</label><input type="number" name="rateSpecial" value="12"/></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Exceptional %</label><input type="number" name="rateExceptional" value="3"/></div>
          <div class="form-group"><label>Hard Pity</label><input type="number" name="hardPity" value="90"/></div>
        </div>
        <div class="form-actions"><button type="submit" class="btn">Create Banner</button><a href="/banners" class="btn btn-ghost">Cancel</a></div>
      </form>
    </div>
  `, req.user, "/banners"));
});

app.post("/banners/new", auth, editorOrAdmin, async (req, res) => {
  try {
    const { bannerId, name, anime, type, imageUrl, description, startsAt, endsAt, rateCommon, rateRare, rateSpecial, rateExceptional, hardPity } = req.body;
    const banner = await Banner.create({ bannerId, name, anime, type, imageUrl: imageUrl||null, description: description||null, startsAt: new Date(startsAt), endsAt: endsAt?new Date(endsAt):null, rates: { common:parseFloat(rateCommon), rare:parseFloat(rateRare), special:parseFloat(rateSpecial), exceptional:parseFloat(rateExceptional) }, pity: { hardPity:parseInt(hardPity), softPityStart:75 }, pool: { common:[],rare:[],special:[],exceptional:[] }, featuredCards:[] });
    await audit(req.user, "create", "banner", bannerId, `Created banner "${name}"`, null, banner.toObject());
    res.redirect("/banners");
  } catch (err) { res.send(renderPage("Error", `<div class="alert alert-red">${err.message}</div><a href="/banners/new" class="btn">Back</a>`, req.user, "/banners")); }
});

app.get("/banners/:id/edit", auth, editorOrAdmin, async (req, res) => {
  const banner = await Banner.findOne({ bannerId: req.params.id });
  if (!banner) return res.redirect("/banners");
  const fmt = d => d ? new Date(d).toISOString().slice(0,10) : "";
  res.send(renderPage(`Edit — ${banner.name}`, `
    <a href="/banners" class="back-link">← Back to Banners</a>
    <div class="form-box">
      <form method="POST" action="/banners/${banner.bannerId}/edit" style="display:flex;flex-direction:column;gap:0">
        <div class="form-group"><label>Name</label><input name="name" value="${banner.name}" required/></div>
        <div class="form-group"><label>Anime</label><input name="anime" value="${banner.anime}" required/></div>
        <div class="form-group"><label>Image URL</label><input name="imageUrl" value="${banner.imageUrl||""}"/></div>
        <div class="form-group"><label>Description</label><input name="description" value="${banner.description||""}"/></div>
        <div class="form-row"><div class="form-group"><label>Starts At</label><input type="date" name="startsAt" value="${fmt(banner.startsAt)}"/></div><div class="form-group"><label>Ends At</label><input type="date" name="endsAt" value="${fmt(banner.endsAt)}"/></div></div>
        <div class="form-row3"><div class="form-group"><label>Common %</label><input type="number" name="rateCommon" value="${banner.rates.common}"/></div><div class="form-group"><label>Rare %</label><input type="number" name="rateRare" value="${banner.rates.rare}"/></div><div class="form-group"><label>Special %</label><input type="number" name="rateSpecial" value="${banner.rates.special}"/></div></div>
        <div class="form-row"><div class="form-group"><label>Exceptional %</label><input type="number" name="rateExceptional" value="${banner.rates.exceptional}"/></div><div class="form-group"><label>Hard Pity</label><input type="number" name="hardPity" value="${banner.pity.hardPity}"/></div></div>
        <div class="form-actions"><button type="submit" class="btn">Save</button><a href="/banners" class="btn btn-ghost">Cancel</a></div>
      </form>
    </div>
  `, req.user, "/banners"));
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
  const allCards = await Card.find().sort({ anime: 1, rarity: 1, name: 1 });
  const poolIds = new Set([...banner.pool.common,...banner.pool.rare,...banner.pool.special,...banner.pool.exceptional]);
  const featuredIds = new Set(banner.featuredCards);
  const rarityBadge = { common:"badge-gray",rare:"badge-blue",special:"badge-purple",exceptional:"badge-yellow" };
  res.send(renderPage(`Pool — ${banner.name}`, `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
      <a href="/banners" class="back-link" style="margin-bottom:0">← Back</a>
      <span class="badge badge-purple">${poolIds.size} in pool</span>
      <span class="badge badge-yellow">${featuredIds.size} featured</span>
    </div>
    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr><th>Art</th><th>Card</th><th>Anime</th><th>Rarity</th><th>Role</th><th>Actions</th></tr></thead>
        <tbody>${allCards.map(c => {
          const inPool = poolIds.has(c.cardId);
          const isFeatured = featuredIds.has(c.cardId);
          return `<tr>
            <td>${c.imageUrl?`<img src="${c.imageUrl}" class="img-thumb"/>`:"—"}</td>
            <td><strong>${c.name}</strong></td>
            <td class="text-muted">${c.anime}${c.seriesId ? `<div class="text-dim text-sm">${c.seriesId}</div>` : ""}</td>
            <td><span class="badge ${rarityBadge[c.rarity]}">${c.rarity}</span></td>
            <td class="text-sm">${c.role}</td>
            <td style="display:flex;gap:5px;flex-wrap:wrap">
              <form method="POST" action="/banners/${banner.bannerId}/pool" style="display:inline"><input type="hidden" name="cardId" value="${c.cardId}"/><input type="hidden" name="action" value="${inPool?"remove":"add"}"/><button type="submit" class="btn ${inPool?"btn-red":"btn-green"} btn-sm">${inPool?"Remove":"Add"}</button></form>
              ${inPool?`<form method="POST" action="/banners/${banner.bannerId}/featured" style="display:inline"><input type="hidden" name="cardId" value="${c.cardId}"/><input type="hidden" name="action" value="${isFeatured?"unfeature":"feature"}"/><button type="submit" class="btn btn-ghost btn-sm">${isFeatured?"★ Featured":"☆ Feature"}</button></form>`:""}
            </td>
          </tr>`;
        }).join("")||`<tr><td colspan="6" class="empty-state">No cards</td></tr>`}
        </tbody>
      </table></div>
    </div>
  `, req.user, "/banners"));
});
app.post("/banners/:id/pool", auth, editorOrAdmin, async (req, res) => {
  const { cardId, action } = req.body;
  const banner = await Banner.findOne({ bannerId: req.params.id });
  const card = await Card.findOne({ cardId });
  if (!banner || !card) return res.redirect(`/banners/${req.params.id}/pool`);
  const before = banner.toObject();
  if (action === "add") await Banner.findOneAndUpdate({ bannerId: req.params.id }, { $addToSet: { [`pool.${card.rarity}`]: cardId } });
  else await Banner.findOneAndUpdate({ bannerId: req.params.id }, { $pull: { [`pool.${card.rarity}`]: cardId, featuredCards: cardId } });
  await audit(req.user, "update", "banner", req.params.id, `${action==="add"?"Added":"Removed"} "${card.name}" ${action==="add"?"to":"from"} "${banner.name}"`, before, null);
  res.redirect(`/banners/${req.params.id}/pool`);
});
app.post("/banners/:id/featured", auth, editorOrAdmin, async (req, res) => {
  const { cardId, action } = req.body;
  const card = await Card.findOne({ cardId });
  const banner = await Banner.findOne({ bannerId: req.params.id });
  if (action === "feature") await Banner.findOneAndUpdate({ bannerId: req.params.id }, { $addToSet: { featuredCards: cardId } });
  else await Banner.findOneAndUpdate({ bannerId: req.params.id }, { $pull: { featuredCards: cardId } });
  await audit(req.user, "update", "banner", req.params.id, `${action==="feature"?"Featured":"Unfeatured"} "${card?.name}"`, null, null);
  res.redirect(`/banners/${req.params.id}/pool`);
});

app.get("/banners/:id/stats", auth, editorOrAdmin, async (req, res) => {
  const banner = await Banner.findOne({ bannerId: req.params.id });
  if (!banner) return res.redirect("/banners");
  const poolIds = [...banner.pool.common,...banner.pool.rare,...banner.pool.special,...banner.pool.exceptional];
  const [totalPulls, cardDist, topPullers] = await Promise.all([
    PlayerCard.countDocuments({ cardId: { $in: poolIds } }),
    PlayerCard.aggregate([{ $match: { cardId: { $in: poolIds } } },{ $lookup: { from: "cards", localField: "cardId", foreignField: "cardId", as: "card" } },{ $unwind: "$card" },{ $group: { _id: { cardId: "$cardId", name: "$card.name", rarity: "$card.rarity" }, count: { $sum: 1 } } },{ $sort: { count: -1 } },{ $limit: 15 }]),
    PlayerCard.aggregate([{ $match: { cardId: { $in: poolIds } } },{ $group: { _id: "$userId", pulls: { $sum: 1 } } },{ $sort: { pulls: -1 } },{ $limit: 10 },{ $lookup: { from: "users", localField: "_id", foreignField: "userId", as: "user" } },{ $unwind: { path: "$user", preserveNullAndEmpty: true } }]),
  ]);
  const rarityCount = { common:0,rare:0,special:0,exceptional:0 };
  for (const d of cardDist) rarityCount[d._id.rarity] = (rarityCount[d._id.rarity]||0)+d.count;
  const rarityBadge = { common:"badge-gray",rare:"badge-blue",special:"badge-purple",exceptional:"badge-yellow" };
  const theoreticalRates = banner.rates||{};
  res.send(renderPage(`Stats — ${banner.name}`, `
    <a href="/banners" class="back-link">← Back to Banners</a>
    <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:24px">
      <div class="stat-card accent"><div class="stat-label">Total Pulls</div><div class="stat-value">${totalPulls.toLocaleString()}</div></div>
      <div class="stat-card"><div class="stat-label">Cards in Pool</div><div class="stat-value">${poolIds.length}</div></div>
      <div class="stat-card"><div class="stat-label">Exceptionals Pulled</div><div class="stat-value">${rarityCount.exceptional}</div></div>
    </div>
    <div class="two-col">
      <div>
        <div class="card">
          <div class="card-header"><h2>Rarity Distribution</h2></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Rarity</th><th>Obtained</th><th>Actual %</th><th>Theory %</th><th>Diff</th></tr></thead>
            <tbody>${Object.entries(rarityCount).map(([r,count])=>{
              const actual = totalPulls>0?((count/totalPulls)*100).toFixed(1):"0.0";
              const theory = theoreticalRates[r]??0;
              const diff = (parseFloat(actual)-theory).toFixed(1);
              return `<tr><td><span class="badge ${rarityBadge[r]}">${r}</span></td><td>${count}</td><td><strong>${actual}%</strong></td><td class="text-muted">${theory}%</td><td style="color:${parseFloat(diff)>=0?"var(--green)":"var(--red)"}">${diff>0?"+":""}${diff}%</td></tr>`;
            }).join("")}
            </tbody>
          </table></div>
        </div>
        <div class="card">
          <div class="card-header"><h2>Top Pullers</h2></div>
          <div class="table-wrap"><table>
            <thead><tr><th>#</th><th>Player</th><th>Pulls</th></tr></thead>
            <tbody>${topPullers.map((p,i)=>`<tr><td class="text-dim">${i+1}</td><td><strong>${p.user?.username||p._id}</strong></td><td>${p.pulls}</td></tr>`).join("")||`<tr><td colspan="3" class="empty-state">No data</td></tr>`}
            </tbody>
          </table></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h2>Most Pulled Cards</h2></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Card</th><th>Rarity</th><th>Obtained</th><th>Rate</th></tr></thead>
          <tbody>${cardDist.map(d=>`<tr><td><strong>${d._id.name}</strong></td><td><span class="badge ${rarityBadge[d._id.rarity]}">${d._id.rarity}</span></td><td>${d.count}</td><td class="text-muted">${totalPulls>0?((d.count/totalPulls)*100).toFixed(1):0}%</td></tr>`).join("")||`<tr><td colspan="4" class="empty-state">No pulls yet</td></tr>`}
          </tbody>
        </table></div>
      </div>
    </div>
  `, req.user, "/banners"));
});


// ─── SERIES ───────────────────────────────────────────────────────────────────

app.get("/debug/cards-series", auth, async (req, res) => {
  if (req.user?.role !== "admin") return res.status(403).send("Forbidden");
  const cards = await require("../models/Card").find({}).select("cardId name anime seriesId").lean();
  const series = await require("../models/Series").find({}).select("seriesId name").lean();
  res.json({ cards: cards.slice(0, 20), series });
});

app.get("/series", auth, editorOrAdmin, async (req, res) => {
  const seriesList = await Series.find().sort({ name: 1 });
  const cardCounts = await Promise.all(seriesList.map(async s => {
    const count = await Card.countDocuments({ seriesId: s.seriesId });
    return count;
  }));
  res.send(renderPage("Series", `
    <div class="page-actions">
      <a href="/series/new" class="btn">+ New Series</a>
    </div>
    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr><th>Art</th><th>Series</th><th>Cards</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${seriesList.map((s, i) => `<tr>
          <td>${s.imageUrl ? `<img src="${s.imageUrl}" class="img-thumb"/>` : "—"}</td>
          <td>
            <div style="font-weight:600">${s.name}</div>
            <div class="mono-sm">${s.seriesId}</div>
            ${s.description ? `<div class="text-sm text-muted" style="margin-top:2px">${s.description}</div>` : ""}
          </td>
          <td class="text-sm">${cardCounts[i]} cards</td>
          <td><span class="${s.isActive ? "tag-available" : "tag-unavailable"}">${s.isActive ? "● Active" : "○ Inactive"}</span></td>
          <td style="display:flex;gap:5px">
            <a href="/series/${s.seriesId}/edit" class="btn btn-gray btn-sm">Edit</a>
            <a href="/series/${s.seriesId}/cards" class="btn btn-ghost btn-sm">Cards</a>
            <a href="/series/${s.seriesId}/toggle" class="btn ${s.isActive ? "btn-red" : "btn-green"} btn-sm">${s.isActive ? "Disable" : "Enable"}</a>
          </td>
        </tr>`).join("") || `<tr><td colspan="5" class="empty-state">No series yet</td></tr>`}
        </tbody>
      </table></div>
    </div>
  `, req.user, "/series"));
});

app.get("/series/new", auth, editorOrAdmin, (req, res) => {
  res.send(renderPage("New Series", `
    <a href="/series" class="back-link">← Back to Series</a>
    <div class="form-box">
      <form method="POST" action="/series/new" style="display:flex;flex-direction:column;gap:0">
        <div class="form-row">
          <div class="form-group"><label>Series ID</label><input name="seriesId" placeholder="one_piece" required/></div>
          <div class="form-group"><label>Name</label><input name="name" placeholder="One Piece" required/></div>
        </div>
        <div class="form-group"><label>Description (optional)</label><input name="description" placeholder="Manga by Eiichiro Oda..."/></div>
        <div class="form-group"><label>Cover Image URL (optional)</label><input name="imageUrl" placeholder="https://..."/></div>
        <div class="form-group"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" name="isActive" value="true" checked style="width:auto"/> Active</label></div>
        <div class="form-actions"><button type="submit" class="btn">Create Series</button><a href="/series" class="btn btn-ghost">Cancel</a></div>
      </form>
    </div>
  `, req.user, "/series"));
});

app.post("/series/new", auth, editorOrAdmin, async (req, res) => {
  try {
    const { seriesId, name, description, imageUrl, isActive } = req.body;
    const series = await Series.create({ seriesId, name, description: description||"", imageUrl: imageUrl||null, isActive: isActive==="true" });
    await audit(req.user, "create", "series", seriesId, `Created series "${name}"`, null, series.toObject());
    res.redirect("/series");
  } catch (err) { res.send(renderPage("Error", `<div class="alert alert-red">${err.message}</div><a href="/series/new" class="btn">Back</a>`, req.user, "/series")); }
});

app.get("/series/:id/edit", auth, editorOrAdmin, async (req, res) => {
  const series = await Series.findOne({ seriesId: req.params.id });
  if (!series) return res.redirect("/series");
  res.send(renderPage(`Edit — ${series.name}`, `
    <a href="/series" class="back-link">← Back to Series</a>
    <div style="display:flex;gap:20px;align-items:flex-start">
      ${series.imageUrl ? `<img src="${series.imageUrl}" style="width:120px;border-radius:var(--radius);object-fit:cover;flex-shrink:0"/>` : ""}
      <div class="form-box" style="flex:1;margin-bottom:0">
        <form method="POST" action="/series/${series.seriesId}/edit" style="display:flex;flex-direction:column;gap:0">
          <div class="form-group"><label>Name</label><input name="name" value="${series.name}" required/></div>
          <div class="form-group"><label>Description</label><input name="description" value="${series.description||""}"/></div>
          <div class="form-group"><label>Cover Image URL</label><input name="imageUrl" value="${series.imageUrl||""}"/></div>
          <div class="form-group"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" name="isActive" value="true" ${series.isActive?"checked":""} style="width:auto"/> Active</label></div>
          <div class="form-actions"><button type="submit" class="btn">Save</button><a href="/series" class="btn btn-ghost">Cancel</a></div>
        </form>
      </div>
    </div>
  `, req.user, "/series"));
});

app.post("/series/:id/edit", auth, editorOrAdmin, async (req, res) => {
  const { name, description, imageUrl, isActive } = req.body;
  const before = await Series.findOne({ seriesId: req.params.id });
  const after = await Series.findOneAndUpdate({ seriesId: req.params.id }, { name, description: description||"", imageUrl: imageUrl||null, isActive: isActive==="true" }, { new: true });
  await audit(req.user, "update", "series", req.params.id, `Updated series "${name}"`, before?.toObject(), after?.toObject());
  res.redirect("/series");
});

app.get("/series/:id/toggle", auth, editorOrAdmin, async (req, res) => {
  const series = await Series.findOne({ seriesId: req.params.id });
  if (series) { await series.updateOne({ isActive: !series.isActive }); await audit(req.user, "update", "series", req.params.id, `${series.isActive?"Disabled":"Enabled"} series "${series.name}"`, null, null); }
  res.redirect("/series");
});

app.get("/series/:id/cards", auth, editorOrAdmin, async (req, res) => {
  const series = await Series.findOne({ seriesId: req.params.id });
  if (!series) return res.redirect("/series");
  const cards = await Card.find({ seriesId: series.seriesId.toString() }).sort({ rarity: 1, name: 1 });
  const allCards = await Card.find({ seriesId: { $ne: series.seriesId } }).sort({ anime: 1, name: 1 });
  const rarityBadge = { common:"badge-gray",rare:"badge-blue",special:"badge-purple",exceptional:"badge-yellow" };
  res.send(renderPage(`Cards — ${series.name}`, `
    <a href="/series" class="back-link">← Back to Series</a>
    <div style="margin-bottom:12px;display:flex;gap:8px;align-items:center">
      <a href="/series/${series.seriesId}/sync-by-anime" class="btn btn-gray btn-sm" onclick="return confirm('Auto-assign all cards whose anime matches \'${series.name}\'?')">🔄 Auto-assign by Anime Name</a>
      <span class="text-dim text-sm">Assigns cards where anime = "${series.name}"</span>
    </div>
    <div class="two-col" style="align-items:flex-start">
      <div class="card" style="margin-bottom:0">
        <div class="card-header"><h2>Cards in this series <span class="badge badge-purple">${cards.length}</span></h2></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Art</th><th>Card</th><th>Rarity</th><th></th></tr></thead>
          <tbody>${cards.map(c => `<tr>
            <td>${c.imageUrl ? `<img src="${c.imageUrl}" class="img-thumb"/>` : "—"}</td>
            <td><strong>${c.name}</strong><div class="text-dim text-sm">${c.anime}</div></td>
            <td><span class="badge ${rarityBadge[c.rarity]}">${c.rarity}</span></td>
            <td><a href="/series/${series.seriesId}/remove-card?cardId=${c.cardId}" class="btn btn-red btn-sm" onclick="return confirm('Remove from series?')">Remove</a></td>
          </tr>`).join("") || `<tr><td colspan="4" class="empty-state">No cards in this series</td></tr>`}
          </tbody>
        </table></div>
      </div>
      <div class="card" style="margin-bottom:0">
        <div class="card-header"><h2>Add Cards</h2></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Art</th><th>Card</th><th>Rarity</th><th></th></tr></thead>
          <tbody>${allCards.map(c => `<tr>
            <td>${c.imageUrl ? `<img src="${c.imageUrl}" class="img-thumb"/>` : "—"}</td>
            <td><strong>${c.name}</strong><div class="text-dim text-sm">${c.anime}</div></td>
            <td><span class="badge ${rarityBadge[c.rarity]}">${c.rarity}</span></td>
            <td><a href="/series/${series.seriesId}/add-card?cardId=${c.cardId}" class="btn btn-green btn-sm">Add</a></td>
          </tr>`).join("") || `<tr><td colspan="4" class="empty-state">All cards assigned</td></tr>`}
          </tbody>
        </table></div>
      </div>
    </div>
  `, req.user, "/series"));
});

app.get("/series/:id/sync-by-anime", auth, editorOrAdmin, async (req, res) => {
  const series = await Series.findOne({ seriesId: req.params.id });
  if (!series) return res.redirect("/series");
  // Case-insensitive match on anime name, assign regardless of current seriesId
  const result = await Card.updateMany(
    { anime: { $regex: `^${series.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: "i" } },
    { seriesId: series.seriesId }
  );
  await audit(req.user, "update", "series", req.params.id, `Auto-synced ${result.modifiedCount} cards by anime name "${series.name}"`, null, null);
  res.redirect(`/series/${req.params.id}/cards`);
});

app.get("/series/:id/add-card", auth, editorOrAdmin, async (req, res) => {
  const { cardId } = req.query;
  const series = await Series.findOne({ seriesId: req.params.id });
  const update = { seriesId: req.params.id };
  if (series) update.anime = series.name; // keep anime in sync
  await Card.findOneAndUpdate({ cardId }, update);
  await audit(req.user, "update", "series", req.params.id, `Added card "${cardId}" to series`, null, null);
  res.redirect(`/series/${req.params.id}/cards`);
});

app.get("/series/:id/remove-card", auth, editorOrAdmin, async (req, res) => {
  const { cardId } = req.query;
  const card = await Card.findOne({ cardId });
  await Card.findOneAndUpdate({ cardId }, { seriesId: null, anime: card?.name ?? cardId });
  await audit(req.user, "update", "series", req.params.id, `Removed card "${cardId}" from series`, null, null);
  res.redirect(`/series/${req.params.id}/cards`);
});

// ─── CARDS ────────────────────────────────────────────────────────────────────
app.get("/cards", auth, editorOrAdmin, async (req, res) => {
  const search = (req.query.q||"").trim();
  const filterRarity = req.query.rarity||"";
  const filterAvailable = req.query.available||"";
  const query = {};
  if (search) query.$or = [{ name: { $regex: search, $options: "i" } }, { anime: { $regex: search, $options: "i" } }, { cardId: { $regex: search, $options: "i" } }];
  if (filterRarity) query.rarity = filterRarity;
  if (filterAvailable !== "") query.isAvailable = filterAvailable === "1";
  const cards = await Card.find(query).sort({ anime: 1, rarity: 1, name: 1 });
  const rarityBadge = { common:"badge-gray",rare:"badge-blue",special:"badge-purple",exceptional:"badge-yellow" };
  const roleBadge = { dps:"badge-red",support:"badge-green",tank:"badge-blue" };
  res.send(renderPage("Cards", `
    <div style="display:flex;align-items:flex-end;gap:10px;margin-bottom:20px;flex-wrap:wrap">
      <a href="/cards/new" class="btn">+ New Card</a>
      <form method="GET" action="/cards" style="display:flex;gap:8px;align-items:flex-end;flex:1;flex-wrap:wrap">
        <div style="flex:1;min-width:160px"><label class="text-sm text-dim" style="display:block;margin-bottom:4px">Search</label><input name="q" value="${search}" placeholder="Name, anime, ID..."/></div>
        <div><label class="text-sm text-dim" style="display:block;margin-bottom:4px">Rarity</label><select name="rarity"><option value="">All</option>${["common","rare","special","exceptional"].map(r=>`<option value="${r}"${filterRarity===r?" selected":""}>${r}</option>`).join("")}</select></div>
        <div><label class="text-sm text-dim" style="display:block;margin-bottom:4px">Status</label><select name="available"><option value="">All</option><option value="1"${filterAvailable==="1"?" selected":""}>Available</option><option value="0"${filterAvailable==="0"?" selected":""}>Unavailable</option></select></div>
        <button type="submit" class="btn btn-gray">Filter</button>
        ${(search||filterRarity||filterAvailable)?`<a href="/cards" class="btn btn-ghost">Clear</a>`:""}
      </form>
    </div>
    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr><th>Art</th><th>Card</th><th>Anime</th><th>Rarity</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${cards.map(c=>`<tr>
          <td>${c.imageUrl?`<img src="${c.imageUrl}" class="img-thumb"/>`:"—"}</td>
          <td><div style="font-weight:600">${c.name}</div><div class="mono-sm">${c.cardId}</div></td>
          <td class="text-muted">${c.anime}${c.seriesId ? `<div class="text-dim text-sm">${c.seriesId}</div>` : ""}</td>
          <td><span class="badge ${rarityBadge[c.rarity]}">${c.rarity}</span></td>
          <td><span class="badge ${roleBadge[c.role]||"badge-gray"}">${c.role}</span></td>
          <td><span class="${c.isAvailable?"tag-available":"tag-unavailable"}">${c.isAvailable?"● Available":"○ Unavailable"}</span></td>
          <td style="display:flex;gap:5px">
            <a href="/cards/${c.cardId}/detail" class="btn btn-ghost btn-sm">Detail</a>
            <a href="/cards/${c.cardId}/edit" class="btn btn-gray btn-sm">Edit</a>
            ${req.user?.role === "admin" ? `<a href="/cards/${c.cardId}/delete" class="btn btn-red btn-sm" onclick="return confirm('Delete card ${c.name}? This will also remove all player copies.')">Delete</a>` : ""}
          </td>
        </tr>`).join("")||`<tr><td colspan="7" class="empty-state">No cards found</td></tr>`}
        </tbody>
      </table></div>
    </div>
  `, req.user, "/cards"));
});

app.get("/cards/new", auth, editorOrAdmin, async (req, res) => {
  const banners = await Banner.find().sort({ type: 1, name: 1 });
  const seriesList = await Series.find({ isActive: true }).sort({ name: 1 });
  const seriesOptions = seriesList.map(s => `<option value="${s.seriesId}">${s.name}</option>`).join("");
  const bannerOptions = banners.map(b=>`<option value="${b.bannerId}">[${b.type==="pickup"?"Pick Up":"Regular"}] ${b.name}${b.isActive?"":" (inactive)"}</option>`).join("");
  res.send(renderPage("New Card", `
    <a href="/cards" class="back-link">← Back to Cards</a>
    <div class="form-box">
      <form method="POST" action="/cards/new" style="display:flex;flex-direction:column;gap:0">
        <div class="form-row"><div class="form-group"><label>Card ID</label><input name="cardId" placeholder="naruto_001" required/></div><div class="form-group"><label>Name</label><input name="name" placeholder="Naruto Uzumaki" required/></div></div>
        <div class="form-group"><label>Image URL</label><input name="imageUrl" placeholder="https://..."/></div>
        <div class="form-row"><div class="form-group"><label>Rarity</label><select name="rarity"><option value="common">Common</option><option value="rare">Rare</option><option value="special">Special</option><option value="exceptional">Exceptional</option></select></div><div class="form-group"><label>Role</label><select name="role"><option value="dps">DPS</option><option value="support">Support</option><option value="tank">Tank</option></select></div></div>
        <div class="form-group"><label>Add to Banner (optional)</label><select name="addToBanner"><option value="">— Don't add —</option>${bannerOptions}</select></div>
        <div class="form-group"><label>Series (optional)</label><select name="seriesId"><option value="">— No series —</option>${seriesOptions}</select></div>
        <div class="form-row3"><div class="form-group"><label>Base Damage</label><input type="number" name="baseDamage" value="100"/></div><div class="form-group"><label>Base Mana</label><input type="number" name="baseMana" value="100"/></div><div class="form-group"><label>Base HP</label><input type="number" name="baseHp" value="100"/></div></div>
        <div class="form-group"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" name="isAvailable" value="true" checked style="width:auto"/> Available for rolls</label></div>
        <div class="form-actions"><button type="submit" class="btn">Create Card</button><a href="/cards" class="btn btn-ghost">Cancel</a></div>
      </form>
    </div>
  `, req.user, "/cards"));
});

app.post("/cards/new", auth, editorOrAdmin, async (req, res) => {
  try {
    const { cardId, name, imageUrl, rarity, role, addToBanner, seriesId, baseDamage, baseMana, baseHp, isAvailable } = req.body;
    let bannerType = "regular";
    if (addToBanner) { const b = await Banner.findOne({ bannerId: addToBanner }); if (b) bannerType = b.type; }
    // Derive anime from series name if available, else use card name
    let anime = name;
    if (seriesId) { const s = await Series.findOne({ seriesId }); if (s) anime = s.name; }
    const card = await Card.create({ cardId, name, anime, imageUrl: imageUrl||null, rarity, role, bannerType, seriesId: (seriesId && seriesId !== "") ? seriesId : null, isAvailable: isAvailable==="true", baseStats: { damage:parseInt(baseDamage), mana:parseInt(baseMana), hp:parseInt(baseHp) } });
    if (addToBanner) await Banner.findOneAndUpdate({ bannerId: addToBanner }, { $addToSet: { [`pool.${rarity}`]: cardId } });
    await audit(req.user, "create", "card", cardId, `Created card "${name}" (${rarity} ${role})`, null, card.toObject());
    res.redirect("/cards");
  } catch (err) { res.send(renderPage("Error", `<div class="alert alert-red">${err.message}</div><a href="/cards/new" class="btn">Back</a>`, req.user, "/cards")); }
});

app.get("/cards/:id/edit", auth, editorOrAdmin, async (req, res) => {
  const card = await Card.findOne({ cardId: req.params.id });
  if (!card) return res.redirect("/cards");
  const seriesListEdit = await Series.find({ isActive: true }).sort({ name: 1 });
  const seriesOpts = `<option value="">— No series —</option>${seriesListEdit.map(s => `<option value="${s.seriesId}"${card.seriesId===s.seriesId?" selected":""}>${s.name}</option>`).join("")}`;
  res.send(renderPage(`Edit — ${card.name}`, `
    <a href="/cards" class="back-link">← Back to Cards</a>
    <div style="display:flex;gap:20px;align-items:flex-start">
      ${card.imageUrl?`<img src="${card.imageUrl}" style="width:140px;border-radius:var(--radius);object-fit:cover;flex-shrink:0"/>`:""}
      <div class="form-box" style="flex:1;margin-bottom:0">
        <form method="POST" action="/cards/${card.cardId}/edit" style="display:flex;flex-direction:column;gap:0">
          <div class="form-group"><label>Name</label><input name="name" value="${card.name}" required/></div>
          <div class="form-group"><label>Image URL</label><input name="imageUrl" value="${card.imageUrl||""}"/></div>
          <div class="form-row"><div class="form-group"><label>Rarity</label><select name="rarity">${["common","rare","special","exceptional"].map(r=>`<option value="${r}"${card.rarity===r?" selected":""}>${r}</option>`).join("")}</select></div><div class="form-group"><label>Role</label><select name="role">${["dps","support","tank"].map(r=>`<option value="${r}"${card.role===r?" selected":""}>${r}</option>`).join("")}</select></div></div>
          <div class="form-group"><label>Series</label><select name="seriesId">${seriesOpts}</select></div>
          <div class="form-row3"><div class="form-group"><label>Base Damage</label><input type="number" name="baseDamage" value="${card.baseStats?.damage??100}"/></div><div class="form-group"><label>Base Mana</label><input type="number" name="baseMana" value="${card.baseStats?.mana??100}"/></div><div class="form-group"><label>Base HP</label><input type="number" name="baseHp" value="${card.baseStats?.hp??100}"/></div></div>
          <div class="form-group"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" name="isAvailable" value="true" ${card.isAvailable?"checked":""} style="width:auto"/> Available for rolls</label></div>
          <div class="form-actions"><button type="submit" class="btn">Save</button><a href="/cards" class="btn btn-ghost">Cancel</a></div>
        </form>
      </div>
    </div>
  `, req.user, "/cards"));
});

app.post("/cards/:id/edit", auth, editorOrAdmin, async (req, res) => {
  const { name, imageUrl, rarity, role, seriesId, baseDamage, baseMana, baseHp, isAvailable } = req.body;
  let anime = name;
  if (seriesId) { const s = await Series.findOne({ seriesId }); if (s) anime = s.name; }
  const before = await Card.findOne({ cardId: req.params.id });
  const after = await Card.findOneAndUpdate({ cardId: req.params.id }, { name, anime, imageUrl: imageUrl||null, rarity, role, seriesId: (seriesId && seriesId !== "") ? seriesId : null, isAvailable: isAvailable==="true", baseStats: { damage:parseInt(baseDamage), mana:parseInt(baseMana), hp:parseInt(baseHp) } }, { new: true });
  await audit(req.user, "update", "card", req.params.id, `Updated card "${name}"`, before?.toObject(), after?.toObject());
  res.redirect("/cards");
});


app.get("/cards/:id/delete", auth, async (req, res) => {
  if (req.user?.role !== "admin") return res.status(403).send(renderPage("Forbidden", `<div class="alert alert-red">Admin only.</div>`, req.user));
  const card = await Card.findOne({ cardId: req.params.id });
  if (!card) return res.redirect("/cards");
  const playerCopies = await PlayerCard.countDocuments({ cardId: req.params.id });
  await Card.deleteOne({ cardId: req.params.id });
  await PlayerCard.deleteMany({ cardId: req.params.id });
  await audit(req.user, "delete", "card", req.params.id, `Deleted card "${card.name}" (${card.rarity}) — removed ${playerCopies} player copies`, card.toObject(), null);
  res.redirect("/cards");
});

app.get("/cards/:id/detail", auth, editorOrAdmin, async (req, res) => {
  const card = await Card.findOne({ cardId: req.params.id });
  if (!card) return res.redirect("/cards");
  const [totalCopies, ownerAgg] = await Promise.all([
    PlayerCard.countDocuments({ cardId: card.cardId, isBurned: false }),
    PlayerCard.aggregate([{ $match: { cardId: card.cardId, isBurned: false } },{ $group: { _id: "$userId" } },{ $count: "total" }])
  ]);
  const totalOwners = ownerAgg[0]?.total??0;
  const rarityBadge = { common:"badge-gray",rare:"badge-blue",special:"badge-purple",exceptional:"badge-yellow" };
  const roleBadge = { dps:"badge-red",support:"badge-green",tank:"badge-blue" };
  res.send(renderPage(`Card — ${card.name}`, `
    <a href="/cards" class="back-link">← Back to Cards</a>
    <div style="display:flex;gap:24px;align-items:flex-start">
      <div style="flex-shrink:0">
        ${card.imageUrl?`<img src="${card.imageUrl}" style="width:180px;border-radius:var(--radius);object-fit:cover"/>`:`<div style="width:180px;height:240px;background:var(--bg4);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;color:var(--text3)">No Image</div>`}
      </div>
      <div style="flex:1">
        <h1 style="margin-bottom:4px">${card.name}</h1>
        <div style="display:flex;gap:8px;margin-bottom:20px">
          <span class="badge ${rarityBadge[card.rarity]}">${card.rarity}</span>
          <span class="badge ${roleBadge[card.role]||"badge-gray"}">${card.role}</span>
          <span class="${card.isAvailable?"tag-available":"tag-unavailable"}">${card.isAvailable?"● Available":"○ Unavailable"}</span>
        </div>
        <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px">
          <div class="stat-card"><div class="stat-label">Copies</div><div class="stat-value">${totalCopies}</div></div>
          <div class="stat-card"><div class="stat-label">Owners</div><div class="stat-value">${totalOwners}</div></div>
          <div class="stat-card"><div class="stat-label">Base DMG</div><div class="stat-value">${card.baseStats?.damage??0}</div></div>
          <div class="stat-card"><div class="stat-label">Base HP</div><div class="stat-value">${card.baseStats?.hp??0}</div></div>
        </div>
        <div style="display:flex;gap:10px">
          <a href="/cards/${card.cardId}/edit" class="btn">Edit Card</a>
        </div>
      </div>
    </div>
  `, req.user, "/cards"));
});

// ─── RAIDS ────────────────────────────────────────────────────────────────────
app.get("/raids", auth, adminOnly, async (req, res) => {
  const raids = await Raid.find().sort({ createdAt: -1 }).limit(20);
  const statusBadge = { active:"badge-green", defeated:"badge-gray", expired:"badge-red" };
  res.send(renderPage("Raids", `
    <div class="two-col" style="align-items:flex-start">
      <div class="form-box" style="margin-bottom:0">
        <h2 style="margin-bottom:16px">Create New Raid</h2>
        <form method="POST" action="/raids/new" style="display:flex;flex-direction:column;gap:0">
          <div class="form-row"><div class="form-group"><label>Boss Name</label><input name="name" placeholder="Pain" required/></div><div class="form-group"><label>Anime</label><input name="anime" placeholder="Naruto" required/></div></div>
          <div class="form-group"><label>Image URL (optional)</label><input name="imageUrl" placeholder="https://..."/></div>
          <div class="form-row"><div class="form-group"><label>HP</label><input type="number" name="hp" value="1000000" min="1000" required/></div><div class="form-group"><label>Duration (hours)</label><input type="number" name="hours" value="48" min="1" required/></div></div>
          <div class="form-actions"><button type="submit" class="btn">Create Raid</button></div>
        </form>
      </div>
      <div class="card" style="margin-bottom:0">
        <div class="card-header"><h2>Recent Raids</h2></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Boss</th><th>Status</th><th>HP</th><th>Players</th><th>Ends</th></tr></thead>
          <tbody>${raids.map(r=>`<tr>
            <td><strong>${r.name}</strong><div class="text-dim text-sm">${r.anime}</div></td>
            <td><span class="badge ${statusBadge[r.status]||"badge-gray"}">${r.status}</span></td>
            <td>
              <div style="font-size:12px;margin-bottom:4px">${r.currentHp.toLocaleString()} / ${r.maxHp.toLocaleString()}</div>
              <div style="height:4px;background:var(--bg4);border-radius:2px;width:100px">
                <div style="height:4px;background:var(--accent);border-radius:2px;width:${Math.round((r.currentHp/r.maxHp)*100)}%"></div>
              </div>
            </td>
            <td>${r.participants.length}</td>
            <td class="text-sm text-muted">${new Date(r.endsAt).toLocaleDateString("en-GB")}</td>
          </tr>`).join("")||`<tr><td colspan="5" class="empty-state">No raids yet</td></tr>`}
          </tbody>
        </table></div>
      </div>
    </div>
  `, req.user, "/raids"));
});
app.post("/raids/new", auth, adminOnly, async (req, res) => {
  const { name, anime, imageUrl, hp, hours } = req.body;
  await Raid.updateMany({ status: "active" }, { status: "expired" });
  const raidId = `raid_${Date.now()}`;
  const endsAt = new Date(Date.now() + parseInt(hours)*60*60*1000);
  const raid = await Raid.create({ raidId, name, anime, imageUrl: imageUrl||null, maxHp:parseInt(hp), currentHp:parseInt(hp), endsAt });
  await audit(req.user, "create", "raid", raidId, `Created raid "${name}" (${parseInt(hp).toLocaleString()} HP, ${hours}h)`, null, raid.toObject());
  res.redirect("/raids");
});

// ─── PLAYERS ──────────────────────────────────────────────────────────────────
app.get("/players", auth, adminOnly, async (req, res) => {
  const search  = (req.query.q||"").trim();
  const sortBy  = req.query.sort||"date";
  const sortDir = req.query.dir==="asc"?1:-1;
  const sortMap = { cp:"combatPower", gold:"currency.gold", date:"createdAt", streak:"loginStreak", level:"accountLevel" };
  const sortField = sortMap[sortBy]||"createdAt";
  const query = search ? { username: { $regex: search, $options: "i" } } : {};
  const players = await User.find(query).sort({ [sortField]: sortDir }).limit(100);
  const sortLink = (field, label) => {
    const active = sortBy===field;
    const dir = active && req.query.dir!=="asc"?"asc":"desc";
    return `<a href="/players?q=${encodeURIComponent(search)}&sort=${field}&dir=${dir}" style="color:${active?"var(--accent3)":"var(--text3)"};text-decoration:none">${label}${active?(dir==="asc"?" ↑":" ↓"):""}</a>`;
  };
  res.send(renderPage("Players", `
    <div style="display:flex;gap:10px;margin-bottom:20px;align-items:flex-end">
      <form method="GET" action="/players" style="display:flex;gap:8px;align-items:flex-end;flex:1">
        <div style="flex:1;max-width:320px"><label class="text-sm text-dim" style="display:block;margin-bottom:4px">Search</label><input name="q" value="${search}" placeholder="Search by username..."/></div>
        <input type="hidden" name="sort" value="${sortBy}"/>
        <button type="submit" class="btn btn-gray">Search</button>
        ${search?`<a href="/players" class="btn btn-ghost">Clear</a>`:""}
      </form>
    </div>
    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Player</th>
          <th>${sortLink("gold","Nyang")}</th>
          <th>Jade</th>
          <th>Tickets (R/P)</th>
          <th>${sortLink("level","Level")}</th>
          <th>${sortLink("cp","CP")}</th>
          <th>Premium</th>
          <th>Actions</th>
        </tr></thead>
        <tbody>${players.map(p=>`<tr>
          <td><div style="font-weight:600">${p.username}</div><div class="mono-sm">${p.userId}</div></td>
          <td>${p.currency.gold.toLocaleString()}</td>
          <td>${p.currency.premiumCurrency.toLocaleString()}</td>
          <td class="text-sm">${p.currency.regularTickets} / ${p.currency.pickupTickets}</td>
          <td>Lv.${p.accountLevel}</td>
          <td>${p.combatPower.toLocaleString()}</td>
          <td>${p.isPremium?`<span class="badge badge-yellow">💎 Premium</span>`:`<span class="text-dim text-sm">—</span>`}</td>
          <td style="display:flex;gap:5px;flex-wrap:wrap">
            <a href="/players/${p.userId}/give" class="btn btn-green btn-sm">Give</a>
            <a href="/players/${p.userId}/give-card" class="btn btn-gray btn-sm">Card</a>
            <a href="/players/${p.userId}/toggle-premium" class="btn ${p.isPremium?"btn-red":"btn-ghost"} btn-sm">${p.isPremium?"Remove 💎":"Set 💎"}</a>
          </td>
        </tr>`).join("")||`<tr><td colspan="8" class="empty-state">No players found</td></tr>`}
        </tbody>
      </table></div>
    </div>
  `, req.user, "/players"));
});

app.get("/players/:id/give", auth, adminOnly, async (req, res) => {
  const player = await User.findOne({ userId: req.params.id });
  if (!player) return res.redirect("/players");
  res.send(renderPage(`Give Currency — ${player.username}`, `
    <a href="/players" class="back-link">← Back to Players</a>
    <div class="form-box">
      <h2 style="margin-bottom:16px">Give Currency to ${player.username}</h2>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
        <div class="stat-card"><div class="stat-label">Nyang</div><div class="stat-value" style="font-size:20px">${player.currency.gold.toLocaleString()}</div></div>
        <div class="stat-card"><div class="stat-label">Jade</div><div class="stat-value" style="font-size:20px">${player.currency.premiumCurrency}</div></div>
        <div class="stat-card"><div class="stat-label">Regular</div><div class="stat-value" style="font-size:20px">${player.currency.regularTickets}</div></div>
        <div class="stat-card"><div class="stat-label">Pick Up</div><div class="stat-value" style="font-size:20px">${player.currency.pickupTickets}</div></div>
      </div>
      <form method="POST" action="/players/${player.userId}/give" style="display:flex;flex-direction:column;gap:0">
        <div class="form-row">
          <div class="form-group"><label>Currency Type</label><select name="type"><option value="gold">Nyang</option><option value="premiumCurrency">Jade</option><option value="regularTickets">Regular Tickets</option><option value="pickupTickets">Pick Up Tickets</option></select></div>
          <div class="form-group"><label>Amount</label><input type="number" name="amount" value="1000" min="1" required/></div>
        </div>
        <div class="form-actions"><button type="submit" class="btn">Give</button><a href="/players" class="btn btn-ghost">Cancel</a></div>
      </form>
    </div>
  `, req.user, "/players"));
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
  const rarityBadge = { common:"badge-gray",rare:"badge-blue",special:"badge-purple",exceptional:"badge-yellow" };
  res.send(renderPage(`Give Card — ${player.username}`, `
    <a href="/players" class="back-link">← Back to Players</a>
    <div class="form-box">
      <h2 style="margin-bottom:16px">Give Card to ${player.username}</h2>
      <form method="POST" action="/players/${player.userId}/give-card" style="display:flex;flex-direction:column;gap:0">
        <div class="form-group"><label>Select Card</label>
          <select name="cardId" required>
            <option value="">— Select a card —</option>
            ${cards.map(c=>`<option value="${c.cardId}">[${c.rarity.toUpperCase()}] ${c.name} — ${c.anime}</option>`).join("")}
          </select>
        </div>
        <div class="form-actions"><button type="submit" class="btn">Give Card</button><a href="/players" class="btn btn-ghost">Cancel</a></div>
      </form>
    </div>
  `, req.user, "/players"));
});
app.post("/players/:id/give-card", auth, adminOnly, async (req, res) => {
  const { cardId } = req.body;
  const player = await User.findOne({ userId: req.params.id });
  const card = await Card.findOne({ cardId });
  if (!player || !card) return res.redirect("/players");
  const { calculateStats } = require("../services/cardStats");
  await PlayerCard.findOneAndUpdate({ userId: player.userId, cardId }, { $inc: { quantity: 1 }, $setOnInsert: { level: 1, cachedStats: calculateStats(card, 1) } }, { upsert: true, new: true });
  await User.findOneAndUpdate({ userId: player.userId }, { $inc: { "stats.totalCardsEverObtained": 1 } });
  await audit(req.user, "update", "player", player.userId, `Gave card "${card.name}" to ${player.username}`, null, null);
  res.redirect("/players");
});
app.get("/players/:id/toggle-premium", auth, adminOnly, async (req, res) => {
  const player = await User.findOne({ userId: req.params.id });
  if (!player) return res.redirect("/players");
  const newVal = !player.isPremium;
  await User.findOneAndUpdate({ userId: req.params.id }, { isPremium: newVal });
  await audit(req.user, "update", "player", req.params.id, `${newVal?"Granted":"Removed"} Premium for ${player.username}`, null, null);
  res.redirect("/players");
});

// ─── MEDIA ────────────────────────────────────────────────────────────────────
const catStorage = multer.diskStorage({
  destination: (req, file, cb) => { const CATS=["banner","card","other"]; const cat=CATS.includes(req.body?.category)?req.body.category:"other"; const dir=path.join(UPLOADS_DIR,cat); if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true}); cb(null,dir); },
  filename: (req,file,cb) => { const ext=path.extname(file.originalname).toLowerCase(); const name=path.basename(file.originalname,ext).replace(/[^a-z0-9_-]/gi,"_").toLowerCase(); cb(null,`${name}_${Date.now()}${ext}`); },
});
const upload = multer({ storage: catStorage, fileFilter: (req,file,cb) => { if([".jpg",".jpeg",".png",".gif",".webp"].includes(path.extname(file.originalname).toLowerCase()))return cb(null,true); cb(new Error("Images only")); }});

app.get("/media", auth, (req, res) => {
  const CATS = ["banner","card","other"];
  const category = CATS.includes(req.query.cat)?req.query.cat:"banner";
  const catDir = path.join(UPLOADS_DIR,category);
  if(!fs.existsSync(catDir))fs.mkdirSync(catDir,{recursive:true});
  const files = fs.readdirSync(catDir).filter(f=>/\.(jpg|jpeg|png|gif|webp)$/i.test(f));
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  res.send(renderPage("Media", `
    <div style="display:flex;gap:8px;margin-bottom:20px">
      ${CATS.map(c=>`<a href="/media?cat=${c}" class="btn ${c===category?"":"btn-ghost"}">${c.charAt(0).toUpperCase()+c.slice(1)}</a>`).join("")}
    </div>
    <div class="two-col" style="align-items:flex-start">
      <div class="form-box" style="margin-bottom:0">
        <h2 style="margin-bottom:14px">Upload Image</h2>
        <form method="POST" action="/media/upload?cat=${category}" enctype="multipart/form-data" style="display:flex;flex-direction:column;gap:0">
          <div class="form-group"><label>Category</label><select name="category">${CATS.map(c=>`<option value="${c}"${c===category?" selected":""}>${c.charAt(0).toUpperCase()+c.slice(1)}</option>`).join("")}</select></div>
          <div class="form-group"><label>Image</label><input type="file" name="image" accept="image/*" required style="padding:6px"/></div>
          <div class="form-actions"><button type="submit" class="btn">Upload</button></div>
        </form>
      </div>
      <div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px">
          ${files.length?[...files].reverse().map(f=>{
            const url=`${baseUrl}/uploads/${category}/${f}`;
            return `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">
              <img src="/uploads/${category}/${f}" style="width:100%;height:120px;object-fit:cover;display:block"/>
              <div style="padding:8px">
                <div class="mono-sm" style="margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f}</div>
                <div style="display:flex;gap:5px">
                  <input type="text" value="${url}" readonly onclick="this.select()" style="flex:1;font-size:10px;padding:3px 6px;cursor:pointer"/>
                  <button onclick="navigator.clipboard.writeText('${url}');this.textContent='✓';setTimeout(()=>this.textContent='Copy',1200)" class="btn btn-gray btn-sm">Copy</button>
                </div>
                <form method="POST" action="/media/delete?cat=${category}" style="margin-top:5px">
                  <input type="hidden" name="filename" value="${f}"/><input type="hidden" name="category" value="${category}"/>
                  <button type="submit" class="btn btn-red btn-sm" style="width:100%" onclick="return confirm('Delete?')">Delete</button>
                </form>
              </div>
            </div>`;
          }).join(""):`<div class="text-dim text-sm" style="grid-column:1/-1;padding:20px 0">No images yet.</div>`}
        </div>
      </div>
    </div>
  `, req.user, "/media"));
});
app.post("/media/upload", auth, upload.single("image"), async (req, res) => {
  const cat = ["banner","card","other"].includes(req.query.cat)?req.query.cat:"other";
  res.redirect(`/media?cat=${cat}`);
});
app.post("/media/delete", auth, (req, res) => {
  const CATS=["banner","card","other"]; const { filename, category }=req.body; const cat=CATS.includes(category)?category:"other";
  if(filename&&/^[a-z0-9_\-.]+$/i.test(filename)){const fp=path.join(UPLOADS_DIR,cat,filename);if(fs.existsSync(fp))fs.unlinkSync(fp);}
  res.redirect(`/media?cat=${cat}`);
});

// ─── TEAM ─────────────────────────────────────────────────────────────────────
app.get("/team", auth, adminOnly, async (req, res) => {
  const TeamMember = require("../models/TeamMember");
  const members = await TeamMember.find().sort({ createdAt: -1 });
  res.send(renderPage("Team", `
    <div class="two-col" style="align-items:flex-start">
      <div class="form-box" style="margin-bottom:0">
        <h2 style="margin-bottom:16px">Add Team Member</h2>
        <form method="POST" action="/team/new" style="display:flex;flex-direction:column;gap:0">
          <div class="form-group"><label>Discord User ID</label><input name="discordId" placeholder="123456789012345678" required/></div>
          <div class="form-group"><label>Display Name</label><input name="username" placeholder="Username" required/></div>
          <div class="form-group"><label>Role</label><select name="role"><option value="editor">Editor — cards + banners</option><option value="admin">Admin — full access</option></select></div>
          <div class="form-actions"><button type="submit" class="btn">Add Member</button></div>
        </form>
      </div>
      <div class="card" style="margin-bottom:0">
        <div class="card-header"><h2>Current Team</h2></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Added</th><th></th></tr></thead>
          <tbody>${members.map(m=>`<tr>
            <td><div style="font-weight:600">${m.username}</div>${m.discordId?`<div class="mono-sm">${m.discordId}</div>`:""}</td>
            <td><span class="badge ${m.role==="admin"?"badge-red":"badge-purple"}">${m.role}</span></td>
            <td><span class="badge ${m.isActive?"badge-green":"badge-gray"}">${m.isActive?"Active":"Disabled"}</span></td>
            <td class="text-sm text-muted">${new Date(m.createdAt).toLocaleDateString("en-GB")}</td>
            <td>${m.discordId!==req.user.discordId?`<a href="/team/${m._id}/toggle" class="btn ${m.isActive?"btn-red":"btn-green"} btn-sm">${m.isActive?"Disable":"Enable"}</a>`:`<span class="text-dim text-sm">You</span>`}</td>
          </tr>`).join("")||`<tr><td colspan="5" class="empty-state">No team members</td></tr>`}
          </tbody>
        </table></div>
      </div>
    </div>
  `, req.user, "/team"));
});
app.post("/team/new", auth, adminOnly, async (req, res) => {
  const TeamMember = require("../models/TeamMember");
  const { discordId, username, role } = req.body;
  const bcrypt = require("bcrypt");
  const hash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 8);
  await TeamMember.create({ username, discordId, password: hash, role, createdBy: req.user.username });
  await audit(req.user, "create", "team", username, `Added team member "${username}" (${role})`, null, null);
  res.redirect("/team");
});
app.get("/team/:id/toggle", auth, adminOnly, async (req, res) => {
  const TeamMember = require("../models/TeamMember");
  const m = await TeamMember.findById(req.params.id);
  if (m && m.discordId !== req.user.discordId) { await m.updateOne({ isActive: !m.isActive }); await audit(req.user, "update", "team", m.username, `${m.isActive?"Disabled":"Enabled"} "${m.username}"`, null, null); }
  res.redirect("/team");
});

// ─── AUDIT ────────────────────────────────────────────────────────────────────
app.get("/audit", auth, async (req, res) => {
  const filterUser = req.query.user||"";
  const filterResource = req.query.resource||"";
  const page = parseInt(req.query.page)||1;
  const limit = 30;
  const query = {};
  if (filterUser) query.performedBy = filterUser;
  if (filterResource) query.resource = filterResource;
  const [logs, total] = await Promise.all([AuditLog.find(query).sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit), AuditLog.countDocuments(query)]);
  const totalPages = Math.ceil(total/limit);
  const actionBadge = { create:"badge-green", update:"badge-blue", delete:"badge-red" };
  const resourceBadge = { banner:"badge-purple",card:"badge-yellow",raid:"badge-orange",player:"badge-blue",team:"badge-gray",event:"badge-green",message:"badge-blue" };
  res.send(renderPage("Audit Log", `
    <div style="display:flex;gap:10px;margin-bottom:20px;align-items:flex-end;flex-wrap:wrap">
      <form method="GET" action="/audit" style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
        <div><label class="text-sm text-dim" style="display:block;margin-bottom:4px">User</label><input name="user" value="${filterUser}" placeholder="Filter by user..." style="max-width:180px"/></div>
        <div><label class="text-sm text-dim" style="display:block;margin-bottom:4px">Resource</label><select name="resource"><option value="">All resources</option>${["banner","card","raid","player","team","event","message"].map(r=>`<option value="${r}"${filterResource===r?" selected":""}>${r}</option>`).join("")}</select></div>
        <button type="submit" class="btn btn-gray">Filter</button>
        ${(filterUser||filterResource)?`<a href="/audit" class="btn btn-ghost">Clear</a>`:""}
      </form>
    </div>
    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr><th>When</th><th>By</th><th>Action</th><th>Resource</th><th>Description</th><th></th></tr></thead>
        <tbody>${logs.map(l=>{
          const canRollback = !l.rolledBack&&l.before&&["card","banner"].includes(l.resource)&&l.action==="update"&&req.user.role==="admin";
          return `<tr>
            <td class="text-sm text-dim" style="white-space:nowrap">${new Date(l.createdAt).toLocaleString("en-GB")}</td>
            <td><span class="badge badge-purple">${l.performedBy}</span></td>
            <td><span class="badge ${actionBadge[l.action]||"badge-gray"}">${l.action}</span></td>
            <td><span class="badge ${resourceBadge[l.resource]||"badge-gray"}">${l.resource}</span></td>
            <td class="text-sm">${l.description}${l.rolledBack?` <span class="badge badge-red">rolled back</span>`:""}</td>
            <td>${canRollback?`<a href="/audit/${l._id}/rollback" class="btn btn-red btn-sm" onclick="return confirm('Rollback?')">Rollback</a>`:""}</td>
          </tr>`;
        }).join("")||`<tr><td colspan="6" class="empty-state">No logs</td></tr>`}
        </tbody>
      </table></div>
    </div>
    ${totalPages>1?`<div style="display:flex;gap:6px;margin-top:14px">${Array.from({length:totalPages},(_,i)=>i+1).map(p=>`<a href="/audit?page=${p}&user=${filterUser}&resource=${filterResource}" class="btn ${p===page?"":"btn-ghost"} btn-sm">${p}</a>`).join("")}</div>`:""}
  `, req.user, "/audit"));
});

app.get("/audit/:id/rollback", auth, adminOnly, async (req, res) => {
  const log = await AuditLog.findById(req.params.id);
  if (!log||log.rolledBack||!log.before) return res.redirect("/audit");
  if (log.resource==="card") { const {_id,__v,createdAt,updatedAt,...data}=log.before; await Card.findOneAndUpdate({cardId:log.resourceId},data); await audit(req.user,"update","card",log.resourceId,`Rolled back card "${log.resourceId}"`,null,log.before); }
  else if (log.resource==="banner") { const {_id,__v,createdAt,updatedAt,...data}=log.before; await Banner.findOneAndUpdate({bannerId:log.resourceId},data); await audit(req.user,"update","banner",log.resourceId,`Rolled back banner "${log.resourceId}"`,null,log.before); }
  await log.updateOne({ rolledBack: true, rolledBackBy: req.user.username, rolledBackAt: new Date() });
  res.redirect("/audit");
});

// ─── Start ────────────────────────────────────────────────────────────────────
function startDashboard(discordClient) {
  app.locals.client = discordClient;
  app.listen(PORT, () => logger.info(`Dashboard running on port ${PORT}`));
}
module.exports = { startDashboard };
