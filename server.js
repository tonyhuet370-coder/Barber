const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const dayjs = require("dayjs");
const http = require("http");
const https = require("https");
const { Server } = require("socket.io");
const db = require("./db");

require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const OWNER_EMAIL = process.env.OWNER_EMAIL || "boss@monsalon.com";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "barber2026";
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || "";
const SESSION_SECRET = process.env.SESSION_SECRET || "change-this-secret-before-production";
const ADMIN_LOGIN_PATH = process.env.ADMIN_LOGIN_PATH || "/acces-coiffeur-prive";
const ADMIN_RESET_CODE = process.env.ADMIN_RESET_CODE || "";
const ADMIN_RESET_CODE_HASH = process.env.ADMIN_RESET_CODE_HASH || "";
const AUTH_COOKIE_NAME = "barber_admin_auth";
const BREVO_API_KEY = String(process.env.BREVO_API_KEY || "").trim();

function hasRealValue(value) {
  return Boolean(value) && !String(value).includes("COLLE_TON");
}

const SMTP_EMAIL_NOTIFICATIONS_ENABLED =
  hasRealValue(process.env.SMTP_HOST) &&
  hasRealValue(process.env.SMTP_USER) &&
  hasRealValue(process.env.SMTP_PASS);

const BREVO_API_NOTIFICATIONS_ENABLED = hasRealValue(BREVO_API_KEY);
const EMAIL_NOTIFICATIONS_ENABLED = BREVO_API_NOTIFICATIONS_ENABLED || SMTP_EMAIL_NOTIFICATIONS_ENABLED;

app.use(cors());
app.use(express.json());

function parseCookies(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const index = part.indexOf("=");
      if (index === -1) return acc;
      const key = part.slice(0, index);
      const value = decodeURIComponent(part.slice(index + 1));
      acc[key] = value;
      return acc;
    }, {});
}

function hashSecret(secret, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(secret, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifySecret(secret = "", storedValue = "") {
  if (!storedValue) {
    return false;
  }

  if (!storedValue.includes(":")) {
    return secret === storedValue;
  }

  try {
    const [salt, storedKey] = storedValue.split(":");

    if (!salt || !storedKey) {
      return false;
    }

    const derivedKey = crypto.scryptSync(secret, salt, Buffer.from(storedKey, "hex").length);
    return crypto.timingSafeEqual(Buffer.from(storedKey, "hex"), derivedKey);
  } catch {
    return false;
  }
}

function getDefaultPasswordHash() {
  return ADMIN_PASSWORD_HASH || hashSecret(ADMIN_PASSWORD);
}

function ensureAdminSettings() {
  const existing = db.prepare("SELECT username, password_hash FROM admin_settings WHERE id = 1").get();

  if (!existing) {
    db.prepare(
      "INSERT INTO admin_settings (id, username, password_hash, updated_at) VALUES (1, ?, ?, ?)"
    ).run(ADMIN_USERNAME, getDefaultPasswordHash(), dayjs().format("YYYY-MM-DD HH:mm:ss"));
  }
}

function getAdminSettings() {
  ensureAdminSettings();
  return db.prepare("SELECT username, password_hash FROM admin_settings WHERE id = 1").get();
}

function verifyAdminPassword(username = "", password = "") {
  const adminSettings = getAdminSettings();
  return username === adminSettings.username && verifySecret(password, adminSettings.password_hash);
}

function getResetSecret() {
  return ADMIN_RESET_CODE_HASH || ADMIN_RESET_CODE || SESSION_SECRET;
}

function verifyAndConsumeResetCode(email = "", code = "") {
  if (verifySecret(code, getResetSecret())) {
    return true;
  }

  const record = db.prepare(
    "SELECT id, code_hash, expires_at FROM admin_reset_tokens WHERE email = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1"
  ).get(email);

  if (!record) {
    return false;
  }

  if (dayjs(record.expires_at).isBefore(dayjs())) {
    return false;
  }

  if (!verifySecret(code, record.code_hash)) {
    return false;
  }

  db.prepare("UPDATE admin_reset_tokens SET used_at = ? WHERE id = ?")
    .run(dayjs().format("YYYY-MM-DD HH:mm:ss"), record.id);

  return true;
}

async function sendAdminResetCode(email, code) {
  if (!EMAIL_NOTIFICATIONS_ENABLED) {
    throw new Error("La recuperation par email n'est pas configuree.");
  }

  await sendEmail({
    to: email,
    subject: "Code de recuperation admin",
    text:
      `Bonjour,\n\nVoici votre code de recuperation pour l'espace admin : ${code}\n\nCe code expire dans 15 minutes.\n\nSi vous n'etes pas a l'origine de cette demande, ignorez cet email.`
  });
}

function buildAdminToken() {
  const adminSettings = getAdminSettings();
  return crypto.createHmac("sha256", SESSION_SECRET).update(`${adminSettings.username}:${adminSettings.password_hash}`).digest("hex");
}

function isAuthenticated(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  return cookies[AUTH_COOKIE_NAME] === buildAdminToken();
}

function requireAdmin(req, res, next) {
  if (isAuthenticated(req)) {
    return next();
  }

  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ error: "Authentification requise." });
  }

  return res.redirect(ADMIN_LOGIN_PATH);
}

app.get(["/login", "/login.html"], (_, res) => {
  return res.redirect("/");
});

app.get(ADMIN_LOGIN_PATH, (_, res) => {
  return res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.use((req, res, next) => {
  const protectedPaths =
    req.path === "/admin" ||
    req.path === "/admin.html" ||
    req.path === "/admin.js" ||
    (req.path === "/api/bookings" && req.method === "GET") ||
    (req.path.startsWith("/api/bookings/") && req.method === "PATCH") ||
    req.path.startsWith("/api/admin/logout");

  if (!protectedPaths) {
    return next();
  }

  return requireAdmin(req, res, next);
});

app.use(express.static(path.join(__dirname, "public"), {
  etag: true,
  setHeaders: (res, filePath) => {
    if (/\.(html|css|js)$/i.test(filePath)) {
      res.setHeader("Cache-Control", "no-store");
      return;
    }

    res.setHeader("Cache-Control", "public, max-age=604800");
  }
}));

function getDailySlots() {
  const slots = [];
  let hour = 9;
  let minute = 0;

  while (hour < 18 || (hour === 18 && minute === 0)) {
    const hh = String(hour).padStart(2, "0");
    const mm = String(minute).padStart(2, "0");
    slots.push(`${hh}:${mm}`);

    minute += 30;
    if (minute >= 60) {
      hour += 1;
      minute = 0;
    }
  }

  return slots;
}

function isClosedDay(dateValue) {
  const day = dayjs(dateValue).day();
  // Sunday = 0, Monday = 1
  return day === 0 || day === 1;
}

function isSameDayBooking(dateValue) {
  return dayjs(dateValue).format("YYYY-MM-DD") === dayjs().format("YYYY-MM-DD");
}

function createTransporter() {
  if (!SMTP_EMAIL_NOTIFICATIONS_ENABLED || BREVO_API_NOTIFICATIONS_ENABLED) {
    return null;
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = String(process.env.SMTP_PASS || "").replace(/\s+/g, "");
  const family = Number(process.env.SMTP_FAMILY || (String(host || "").includes("gmail.com") ? 4 : 0)) || undefined;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      dnsTimeout: 10000,
      family,
      tls: {
        servername: host
      }
    });
  }

  return null;
}

const transporter = createTransporter();

async function sendEmail({ to, subject, text }) {
  const fromAddress = process.env.MAIL_FROM || "noreply@monsalon.com";

  if (BREVO_API_NOTIFICATIONS_ENABLED) {
    const payload = JSON.stringify({
      sender: {
        email: fromAddress
      },
      to: [{ email: to }],
      subject,
      textContent: text
    });

    const data = await new Promise((resolve, reject) => {
      const req = https.request("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "api-key": BREVO_API_KEY,
          "Content-Length": Buffer.byteLength(payload)
        }
      }, (res) => {
        let body = "";

        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          let parsed = {};

          try {
            parsed = body ? JSON.parse(body) : {};
          } catch {
            parsed = { raw: body };
          }

          if ((res.statusCode || 500) >= 400) {
            reject(new Error(parsed.message || parsed.code || "Impossible d'envoyer l'email via Brevo."));
            return;
          }

          resolve(parsed);
        });
      });

      req.on("error", reject);
      req.write(payload);
      req.end();
    });

    return {
      accepted: [to],
      rejected: [],
      messageId: data.messageId || ""
    };
  }

  if (!transporter) {
    throw new Error("SMTP non configure.");
  }

  return transporter.sendMail({
    from: fromAddress,
    to,
    subject,
    text
  });
}

async function sendTelegramNotification(booking) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) return;

  const payload = JSON.stringify({
    chat_id: chatId,
    text: `🔔 Nouveau rendez-vous!\n👤 ${booking.client_name}\n✂️ ${booking.service}\n📅 ${booking.date} à ${booking.time}\n📧 ${booking.client_email}`,
    disable_notification: false
  });

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await new Promise((resolve, reject) => {
        const req = https.request(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload)
          }
        }, (res) => {
          let body = "";

          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            body += chunk;
          });
          res.on("end", () => {
            let parsed = {};

            try {
              parsed = body ? JSON.parse(body) : {};
            } catch {
              parsed = { raw: body };
            }

            if ((res.statusCode || 500) >= 400 || parsed.ok === false) {
              reject(new Error(parsed.description || "Echec de l'envoi Telegram."));
              return;
            }

            resolve();
          });
        });

        req.setTimeout(5000, () => {
          req.destroy(new Error("Telegram timeout"));
        });

        req.on("error", reject);
        req.write(payload);
        req.end();
      });

      return;
    } catch (err) {
      if (attempt === 3) {
        throw err;
      }
    }
  }
}

async function sendBookingEmails(booking) {
  if (!EMAIL_NOTIFICATIONS_ENABLED) {
    console.log("Email notifications skipped: no email provider is configured.");
    return;
  }

  const clientResult = await sendEmail({
    to: booking.client_email,
    subject: "Confirmation de votre rendez-vous",
    text: `Bonjour ${booking.client_name},\n\nVotre rendez-vous est confirme pour le ${booking.date} a ${booking.time}.\nService: ${booking.service}.\n\nMerci et a bientot.`
  });
  const ownerResult = await sendEmail({
    to: OWNER_EMAIL,
    subject: "Nouveau rendez-vous client",
    text: `Nouveau rendez-vous:\nClient: ${booking.client_name}\nEmail: ${booking.client_email}\nService: ${booking.service}\nDate: ${booking.date}\nHeure: ${booking.time}`
  });

  console.log("Client email accepted:", clientResult.accepted || []);
  console.log("Client email rejected:", clientResult.rejected || []);
  console.log("Owner email accepted:", ownerResult.accepted || []);
  console.log("Owner email rejected:", ownerResult.rejected || []);

  if (clientResult.message) {
    console.log("Client email preview:", clientResult.message.toString());
  }

  if (ownerResult.message) {
    console.log("Owner email preview:", ownerResult.message.toString());
  }
}

function queueBookingNotifications(booking) {
  setImmediate(async () => {
    const tasks = [
      sendTelegramNotification(booking).catch((tgErr) => {
        console.error("Telegram error:", tgErr);
      }),
      sendBookingEmails(booking).catch((mailErr) => {
        console.error("Email error:", mailErr);
      })
    ];

    await Promise.allSettled(tasks);
  });
}

app.get("/api/availability", (req, res) => {
  const date = req.query.date;

  if (!date || !dayjs(date, "YYYY-MM-DD", true).isValid()) {
    return res.status(400).json({ error: "Date invalide. Format attendu: YYYY-MM-DD" });
  }

  const allSlots = getDailySlots();

  if (isSameDayBooking(date)) {
    return res.json({
      date,
      closed: true,
      message: "Les reservations pour aujourd'hui sont fermees. Merci de choisir un autre jour.",
      slots: allSlots.map((time) => ({ time, available: false }))
    });
  }

  if (isClosedDay(date)) {
    return res.json({
      date,
      closed: true,
      message: "Le salon est ferme le dimanche et le lundi.",
      slots: allSlots.map((time) => ({ time, available: false }))
    });
  }

  try {
    const rows = db.prepare("SELECT time FROM bookings WHERE date = ?").all(date);
    const booked = new Set(rows.map((r) => r.time));
    const result = allSlots.map((time) => ({
      time,
      available: !booked.has(time)
    }));
    return res.json({ date, slots: result });
  } catch (err) {
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (!verifyAdminPassword(String(username || "").trim(), String(password || ""))) {
    return res.status(401).json({ error: "Identifiants invalides." });
  }

  res.setHeader(
    "Set-Cookie",
    `${AUTH_COOKIE_NAME}=${buildAdminToken()}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`
  );

  return res.json({ success: true });
});

app.post("/api/admin/logout", requireAdmin, (_, res) => {
  res.setHeader(
    "Set-Cookie",
    `${AUTH_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`
  );

  return res.json({ success: true });
});

app.post("/api/admin/request-reset-code", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const ownerEmail = String(OWNER_EMAIL || "").trim().toLowerCase();

  if (!email) {
    return res.status(400).json({ error: "L'adresse email est obligatoire." });
  }

  if (!EMAIL_NOTIFICATIONS_ENABLED || !transporter) {
    return res.status(503).json({ error: "La recuperation par email n'est pas configuree pour le moment." });
  }

  const genericMessage = "Si l'adresse correspond au compte admin, un code a ete envoye par email.";

  if (email !== ownerEmail) {
    return res.json({ success: true, message: genericMessage });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const createdAt = dayjs().format("YYYY-MM-DD HH:mm:ss");
  const expiresAt = dayjs().add(15, "minute").format("YYYY-MM-DD HH:mm:ss");

  db.prepare("DELETE FROM admin_reset_tokens WHERE email = ? OR expires_at < ?")
    .run(email, createdAt);

  db.prepare(
    "INSERT INTO admin_reset_tokens (email, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?)"
  ).run(email, hashSecret(code), expiresAt, createdAt);

  try {
    await sendAdminResetCode(email, code);
    return res.json({ success: true, message: genericMessage });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Impossible d'envoyer le code par email." });
  }
});

app.post("/api/admin/reset-credentials", (req, res) => {
  const { email, resetCode, username, password } = req.body;
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const nextUsername = String(username || "").trim();
  const nextPassword = String(password || "").trim();

  if (!normalizedEmail || !resetCode || !nextUsername || !nextPassword) {
    return res.status(400).json({ error: "Tous les champs sont obligatoires." });
  }

  if (nextUsername.length < 3) {
    return res.status(400).json({ error: "L'identifiant doit contenir au moins 3 caracteres." });
  }

  if (nextPassword.length < 8) {
    return res.status(400).json({ error: "Le mot de passe doit contenir au moins 8 caracteres." });
  }

  if (!verifyAndConsumeResetCode(normalizedEmail, String(resetCode))) {
    return res.status(401).json({ error: "Code de recuperation invalide ou expire." });
  }

  db.prepare(
    "INSERT INTO admin_settings (id, username, password_hash, updated_at) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET username = excluded.username, password_hash = excluded.password_hash, updated_at = excluded.updated_at"
  ).run(nextUsername, hashSecret(nextPassword), dayjs().format("YYYY-MM-DD HH:mm:ss"));

  res.setHeader(
    "Set-Cookie",
    `${AUTH_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`
  );

  return res.json({ success: true, message: "Identifiants admin mis a jour avec succes." });
});

app.get("/api/bookings", requireAdmin, (_, res) => {
  try {
    const rows = db.prepare(
      "SELECT id, client_name, client_email, service, date, time, created_at, COALESCE(status, 'Confirme') as status FROM bookings ORDER BY date ASC, time ASC"
    ).all();
    return res.json({ bookings: rows });
  } catch (err) {
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

app.patch("/api/bookings/:id/status", requireAdmin, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const allowedStatuses = ["Confirme", "Termine", "Annule"];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: "Statut invalide." });
  }

  try {
    const result = db.prepare("UPDATE bookings SET status = ? WHERE id = ?").run(status, id);

    if (result.changes === 0) {
      return res.status(404).json({ error: "Rendez-vous introuvable." });
    }

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

app.delete("/api/bookings/:id", requireAdmin, (req, res) => {
  const { id } = req.params;

  try {
    const result = db.prepare("DELETE FROM bookings WHERE id = ?").run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: "Rendez-vous introuvable." });
    }

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

app.post("/api/bookings", async (req, res) => {
  const { name, email, service, date, time } = req.body;

  if (!name || !email || !service || !date || !time) {
    return res.status(400).json({ error: "Tous les champs sont obligatoires." });
  }

  const normalizedDate = dayjs(date, "YYYY-MM-DD", true);
  if (!normalizedDate.isValid()) {
    return res.status(400).json({ error: "Date invalide." });
  }

  if (isSameDayBooking(normalizedDate)) {
    return res.status(400).json({ error: "Les reservations pour aujourd'hui sont fermees. Merci de choisir un autre jour." });
  }

  if (isClosedDay(normalizedDate)) {
    return res.status(400).json({ error: "Le salon est ferme le dimanche et le lundi." });
  }

  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  if (!validTime) {
    return res.status(400).json({ error: "Heure invalide." });
  }

  if (!getDailySlots().includes(time)) {
    return res.status(400).json({ error: "Horaire hors plage d'ouverture (09:00 - 18:00)." });
  }

  const createdAt = dayjs().format("YYYY-MM-DD HH:mm:ss");

  try {
    const info = db.prepare(
      `INSERT INTO bookings (client_name, client_email, service, date, time, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(name.trim(), email.trim().toLowerCase(), service.trim(), normalizedDate.format("YYYY-MM-DD"), time, createdAt);

    const booking = {
      id: info.lastInsertRowid,
      client_name: name.trim(),
      client_email: email.trim().toLowerCase(),
      service: service.trim(),
      date: normalizedDate.format("YYYY-MM-DD"),
      time,
      created_at: createdAt,
      status: "Confirme"
    };

    io.emit("new-booking", booking);
    queueBookingNotifications(booking);

    return res.status(201).json({
      message: "Rendez-vous enregistre avec succes.",
      booking
    });
  } catch (err) {
    if (err.message && err.message.includes("UNIQUE constraint failed")) {
      return res.status(409).json({ error: "Ce creneau est deja reserve." });
    }
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

app.get("/admin", (_, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

io.on("connection", () => {
  console.log("Admin dashboard connected");
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  if (BREVO_API_NOTIFICATIONS_ENABLED) {
    console.log("Brevo email API enabled.");
    return;
  }

  if (!EMAIL_NOTIFICATIONS_ENABLED || !transporter) {
    console.log("Email notifications disabled: SMTP is not configured.");
    return;
  }

  transporter.verify()
    .then(() => {
      console.log("SMTP verified successfully.");
    })
    .catch((err) => {
      console.error("SMTP verify failed:", err && err.message ? err.message : err);
    });
});
