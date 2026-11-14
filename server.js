import "dotenv/config";
import express from "express";
import session from "express-session";
import SQLiteStoreFactory from "connect-sqlite3";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";
const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.error("SESSION_SECRET wajib diisi dengan minimal 32 karakter. Periksa file .env.");
  process.exit(1);
}

const db = new Database(path.join(dataDir, "triyono.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Percakapan baru',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('user','assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || "";
if (adminEmail && adminPassword && adminPassword.length >= 12) {
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(adminEmail);
  if (!existing) {
    const hash = bcrypt.hashSync(adminPassword, 12);
    db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,'admin')")
      .run(process.env.ADMIN_NAME || "Administrator", adminEmail, hash);
    console.log(`Akun admin awal dibuat untuk ${adminEmail}`);
  }
} else {
  console.warn("Akun admin belum dibuat. Isi ADMIN_EMAIL dan ADMIN_PASSWORD (minimal 12 karakter) di .env.");
}

const SQLiteStore = SQLiteStoreFactory(session);
app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: isProduction ? [] : null
    }
  }
}));
app.use(express.json({ limit: "40kb" }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: dataDir }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));
app.use(express.static(path.join(__dirname, "public")));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false });
const chatLimiter = rateLimit({ windowMs: 60 * 1000, limit: 12, standardHeaders: "draft-7", legacyHeaders: false });

function cleanText(value, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Silakan masuk terlebih dahulu." });
  next();
}
function requireAdmin(req, res, next) {
  const user = db.prepare("SELECT role FROM users WHERE id = ?").get(req.session.userId);
  if (!user || user.role !== "admin") return res.status(403).json({ error: "Akses khusus administrator." });
  next();
}

app.get("/api/health", (_req, res) => res.json({ ok: true, app: "TRIYONO AI" }));

app.get("/api/me", (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = db.prepare("SELECT id,name,email,role FROM users WHERE id = ?").get(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.json({ user: null });
  }
  res.json({ user });
});

app.post("/api/register", authLimiter, async (req, res) => {
  const name = cleanText(req.body.name, 60);
  const email = cleanText(req.body.email, 120).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 10) {
    return res.status(400).json({ error: "Isi nama, email valid, dan kata sandi minimal 10 karakter." });
  }
  if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) {
    return res.status(409).json({ error: "Email sudah terdaftar." });
  }
  const hash = await bcrypt.hash(password, 12);
  const result = db.prepare("INSERT INTO users (name,email,password_hash) VALUES (?,?,?)").run(name, email, hash);
  req.session.userId = Number(result.lastInsertRowid);
  res.status(201).json({ user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(req.session.userId)) });
});

app.post("/api/login", authLimiter, async (req, res) => {
  const email = cleanText(req.body.email, 120).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "Email atau kata sandi tidak cocok." });
  }
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: "Tidak dapat membuat sesi." });
    req.session.userId = user.id;
    res.json({ user: publicUser(user) });
  });
});

app.post("/api/logout", requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

app.get("/api/conversations", requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT c.id,c.title,c.created_at,c.updated_at,
      (SELECT content FROM messages WHERE conversation_id=c.id ORDER BY id DESC LIMIT 1) AS last_message
    FROM conversations c WHERE c.user_id=? ORDER BY c.updated_at DESC LIMIT 50
  `).all(req.session.userId);
  res.json({ conversations: rows });
});

app.post("/api/conversations", requireAuth, (req, res) => {
  const title = cleanText(req.body.title, 80) || "Percakapan baru";
  const result = db.prepare("INSERT INTO conversations (user_id,title) VALUES (?,?)").run(req.session.userId, title);
  res.status(201).json({ id: Number(result.lastInsertRowid), title });
});

app.get("/api/conversations/:id/messages", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const owned = db.prepare("SELECT id FROM conversations WHERE id=? AND user_id=?").get(id, req.session.userId);
  if (!owned) return res.status(404).json({ error: "Percakapan tidak ditemukan." });
  const messages = db.prepare("SELECT id,role,content,created_at FROM messages WHERE conversation_id=? ORDER BY id ASC LIMIT 200").all(id);
  res.json({ messages });
});

app.delete("/api/conversations/:id", requireAuth, (req, res) => {
  const result = db.prepare("DELETE FROM conversations WHERE id=? AND user_id=?").run(Number(req.params.id), req.session.userId);
  if (!result.changes) return res.status(404).json({ error: "Percakapan tidak ditemukan." });
  res.json({ ok: true });
});

app.post("/api/chat", requireAuth, chatLimiter, async (req, res) => {
  const message = cleanText(req.body.message, 4000);
  let conversationId = Number(req.body.conversationId);
  if (!message) return res.status(400).json({ error: "Pesan tidak boleh kosong." });

  let conversation = conversationId
    ? db.prepare("SELECT id,title FROM conversations WHERE id=? AND user_id=?").get(conversationId, req.session.userId)
    : null;

  if (!conversation) {
    const title = message.slice(0, 48) || "Percakapan baru";
    const created = db.prepare("INSERT INTO conversations (user_id,title) VALUES (?,?)").run(req.session.userId, title);
    conversationId = Number(created.lastInsertRowid);
  }

  db.prepare("INSERT INTO messages (conversation_id,role,content) VALUES (?,'user',?)").run(conversationId, message);
  db.prepare("UPDATE conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?").run(conversationId);

  if (!process.env.OPENAI_API_KEY) {
    const demo = "Mode demo aktif. Untuk jawaban AI sungguhan, administrator perlu mengisi OPENAI_API_KEY di file .env pada server, lalu menjalankan ulang aplikasi.";
    db.prepare("INSERT INTO messages (conversation_id,role,content) VALUES (?,'assistant',?)").run(conversationId, demo);
    return res.json({ conversationId, reply: demo, demo: true });
  }

  try {
    const history = db.prepare("SELECT role,content FROM messages WHERE conversation_id=? ORDER BY id DESC LIMIT 14")
      .all(conversationId).reverse();
    const apiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-6-luna",
        instructions: "Kamu adalah TRIYONO AI, asisten digital yang ramah, jelas, dan aman. Jawab dalam bahasa yang digunakan pengguna. Jika pertanyaan tidak jelas, minta klarifikasi. Jangan mengaku sebagai manusia.",
        input: history.map(item => ({ role: item.role, content: item.content }))
      })
    });
    const data = await apiResponse.json();
    if (!apiResponse.ok) {
      console.error("OpenAI API error:", data?.error?.message || apiResponse.status);
      throw new Error("Layanan AI sedang bermasalah. Periksa konfigurasi API di server.");
    }
    const reply = cleanText(data.output_text, 12000) || "Maaf, AI belum menghasilkan jawaban. Silakan coba lagi.";
    db.prepare("INSERT INTO messages (conversation_id,role,content) VALUES (?,'assistant',?)").run(conversationId, reply);
    db.prepare("UPDATE conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?").run(conversationId);
    res.json({ conversationId, reply, demo: false });
  } catch (error) {
    console.error(error.message);
    res.status(502).json({ error: error.message || "Tidak dapat menghubungi layanan AI." });
  }
});

// Admin endpoints
app.get("/api/admin/overview", requireAuth, requireAdmin, (_req, res) => {
  const users = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  const conversations = db.prepare("SELECT COUNT(*) AS count FROM conversations").get().count;
  const messages = db.prepare("SELECT COUNT(*) AS count FROM messages").get().count;
  const recentUsers = db.prepare("SELECT id,name,email,role,created_at FROM users ORDER BY id DESC LIMIT 30").all();
  res.json({ stats: { users, conversations, messages }, users: recentUsers });
});

app.use("/api", (_req, res) => res.status(404).json({ error: "Endpoint tidak ditemukan." }));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`TRIYONO AI berjalan di http://localhost:${PORT}`));
