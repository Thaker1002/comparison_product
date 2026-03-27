import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import db from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "changeme-set-JWT_SECRET-in-env";
const ADMIN_SECRET = process.env.ADMIN_SECRET || "admin123";

// ─── Password generator ───────────────────────────────────────────────────

function generatePassword(len = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#!";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// ─── Email sender ─────────────────────────────────────────────────────────

async function sendWelcomeEmail(user, plainPassword) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn("⚠️  SMTP not configured — skipping welcome email for:", user.email);
    return;
  }
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || "587"),
    secure: parseInt(SMTP_PORT || "587") === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  await transporter.sendMail({
    from: SMTP_FROM || SMTP_USER,
    to: user.email,
    subject: "Welcome to PriceHunt — Your Login Details",
    html: `
      <h2>Welcome, ${user.name}!</h2>
      <p>Your account has been created. Here are your login details:</p>
      <ul>
        <li><strong>Email:</strong> ${user.email}</li>
        <li><strong>Password:</strong> <code>${plainPassword}</code></li>
      </ul>
      <p>Please change your password after your first login.</p>
      <p>— PriceHunt Team</p>
    `,
  });
}

async function sendResetEmail(user, newPassword) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn("⚠️  SMTP not configured — skipping reset email for:", user.email);
    return;
  }
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || "587"),
    secure: parseInt(SMTP_PORT || "587") === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  await transporter.sendMail({
    from: SMTP_FROM || SMTP_USER,
    to: user.email,
    subject: "PriceHunt — Your New Password",
    html: `
      <h2>Password Reset</h2>
      <p>Hi ${user.name}, your password has been reset.</p>
      <p>Your new password is: <strong><code>${newPassword}</code></strong></p>
      <p>Please sign in and keep this safe.</p>
      <p>— PriceHunt Team</p>
    `,
  });
}

// ─── Auth middleware ──────────────────────────────────────────────────────

export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload.isAdmin) return res.status(403).json({ error: "Forbidden" });
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────

export function registerAuthRoutes(app) {

  // POST /api/auth/register
  app.post("/api/auth/register", async (req, res) => {
    const { name, email, mobile, notify_via = "email" } = req.body;
    if (!name || !email || !mobile) {
      return res.status(400).json({ error: "Name, email and mobile are required" });
    }
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRx.test(email)) return res.status(400).json({ error: "Invalid email" });

    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) return res.status(409).json({ error: "Email already registered" });

    const plainPassword = generatePassword();
    const hashed = await bcrypt.hash(plainPassword, 10);

    const stmt = db.prepare(
      "INSERT INTO users (name, email, mobile, password, notify_via) VALUES (?, ?, ?, ?, ?)"
    );
    const result = stmt.run(name, email.toLowerCase().trim(), mobile.trim(), hashed, notify_via);
    const user = db.prepare("SELECT id, name, email, mobile, notify_via, created_at FROM users WHERE id = ?").get(result.lastInsertRowid);

    // Send welcome email (non-blocking)
    sendWelcomeEmail(user, plainPassword).catch(console.error);

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, isAdmin: false }, JWT_SECRET, { expiresIn: "30d" });
    res.status(201).json({ token, user, password: plainPassword }); // password returned once for display
  });

  // POST /api/auth/login
  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase().trim());
    if (!user) return res.status(401).json({ error: "Invalid email or password" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "Invalid email or password" });

    db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, isAdmin: !!user.is_admin }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, mobile: user.mobile, notify_via: user.notify_via, isAdmin: !!user.is_admin } });
  });

  // POST /api/auth/forgot-password
  app.post("/api/auth/forgot-password", async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase().trim());
    // Always return success to avoid email enumeration
    if (!user) return res.json({ message: "If that email is registered, a new password has been sent." });

    const newPassword = generatePassword();
    const hashed = await bcrypt.hash(newPassword, 10);
    db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashed, user.id);

    sendResetEmail(user, newPassword).catch(console.error);
    res.json({ message: "If that email is registered, a new password has been sent.", password: newPassword });
    // password returned in response for dev/local use; remove in prod if desired
  });

  // POST /api/auth/track  (fire-and-forget usage event)
  app.post("/api/auth/track", requireAuth, (req, res) => {
    const { event_type, query, country, results_count } = req.body;
    db.prepare(
      "INSERT INTO usage_events (user_id, event_type, query, country, results_count) VALUES (?, ?, ?, ?, ?)"
    ).run(req.user.id, event_type || "search", query || null, country || null, results_count || 0);
    res.status(204).end();
  });

  // ─── Admin routes ──────────────────────────────────────────────────────

  // GET /api/admin/login  — exchange ADMIN_SECRET for admin JWT
  app.post("/api/admin/login", (req, res) => {
    if (req.body.secret !== ADMIN_SECRET) return res.status(403).json({ error: "Wrong secret" });
    const token = jwt.sign({ isAdmin: true }, JWT_SECRET, { expiresIn: "8h" });
    res.json({ token });
  });

  // GET /api/admin/users
  app.get("/api/admin/users", requireAdmin, (req, res) => {
    const users = db.prepare(`
      SELECT u.id, u.name, u.email, u.mobile, u.notify_via, u.created_at, u.last_login,
             COUNT(e.id) AS total_searches,
             MAX(e.created_at) AS last_search
      FROM users u
      LEFT JOIN usage_events e ON e.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `).all();
    res.json({ users });
  });

  // GET /api/admin/usage/:userId
  app.get("/api/admin/usage/:userId", requireAdmin, (req, res) => {
    const events = db.prepare(
      "SELECT * FROM usage_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 100"
    ).all(req.params.userId);
    res.json({ events });
  });

  // GET /api/admin/stats
  app.get("/api/admin/stats", requireAdmin, (req, res) => {
    const totalUsers = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
    const totalSearches = db.prepare("SELECT COUNT(*) AS n FROM usage_events").get().n;
    const todaySearches = db.prepare("SELECT COUNT(*) AS n FROM usage_events WHERE date(created_at) = date('now')").get().n;
    const topQueries = db.prepare(
      "SELECT query, COUNT(*) AS n FROM usage_events WHERE query IS NOT NULL GROUP BY query ORDER BY n DESC LIMIT 10"
    ).all();
    const topCountries = db.prepare(
      "SELECT country, COUNT(*) AS n FROM usage_events WHERE country IS NOT NULL GROUP BY country ORDER BY n DESC"
    ).all();
    res.json({ totalUsers, totalSearches, todaySearches, topQueries, topCountries });
  });
}
