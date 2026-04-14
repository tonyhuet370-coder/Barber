const path = require("path");
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

function hasRealValue(value) {
  return Boolean(value) && !String(value).includes("COLLE_TON");
}

const EMAIL_NOTIFICATIONS_ENABLED =
  hasRealValue(process.env.SMTP_HOST) &&
  hasRealValue(process.env.SMTP_USER) &&
  hasRealValue(process.env.SMTP_PASS);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

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

function createTransporter() {
  if (!EMAIL_NOTIFICATIONS_ENABLED) {
    return null;
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });
  }

  return null;
}

const transporter = createTransporter();

async function sendTelegramNotification(booking) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) return;

  const text = encodeURIComponent(
    `🔔 Nouveau rendez-vous!\n👤 ${booking.client_name}\n✂️ ${booking.service}\n📅 ${booking.date} à ${booking.time}\n📧 ${booking.client_email}`
  );

  return new Promise((resolve) => {
    const url = `https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}&text=${text}`;
    https.get(url, (res) => {
      res.resume();
      res.on("end", resolve);
    }).on("error", (err) => {
      console.error("Telegram error:", err.message);
      resolve();
    });
  });
}

async function sendBookingEmails(booking) {
  if (!EMAIL_NOTIFICATIONS_ENABLED || !transporter) {
    return;
  }

  const fromAddress = process.env.MAIL_FROM || "noreply@monsalon.com";

  const clientMail = {
    from: fromAddress,
    to: booking.client_email,
    subject: "Confirmation de votre rendez-vous",
    text: `Bonjour ${booking.client_name},\n\nVotre rendez-vous est confirme pour le ${booking.date} a ${booking.time}.\nService: ${booking.service}.\n\nMerci et a bientot.`
  };

  const ownerMail = {
    from: fromAddress,
    to: OWNER_EMAIL,
    subject: "Nouveau rendez-vous client",
    text: `Nouveau rendez-vous:\nClient: ${booking.client_name}\nEmail: ${booking.client_email}\nService: ${booking.service}\nDate: ${booking.date}\nHeure: ${booking.time}`
  };

  const clientResult = await transporter.sendMail(clientMail);
  const ownerResult = await transporter.sendMail(ownerMail);

  if (clientResult.message) {
    console.log("Client email preview:", clientResult.message.toString());
  }

  if (ownerResult.message) {
    console.log("Owner email preview:", ownerResult.message.toString());
  }
}

app.get("/api/availability", (req, res) => {
  const date = req.query.date;

  if (!date || !dayjs(date, "YYYY-MM-DD", true).isValid()) {
    return res.status(400).json({ error: "Date invalide. Format attendu: YYYY-MM-DD" });
  }

  const allSlots = getDailySlots();

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

app.get("/api/bookings", (_, res) => {
  try {
    const rows = db.prepare(
      "SELECT id, client_name, client_email, service, date, time, created_at FROM bookings ORDER BY date ASC, time ASC"
    ).all();
    return res.json({ bookings: rows });
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
      created_at: createdAt
    };

    try {
      await sendBookingEmails(booking);
    } catch (mailErr) {
      console.error("Email error:", mailErr);
    }

    try {
      await sendTelegramNotification(booking);
    } catch (tgErr) {
      console.error("Telegram error:", tgErr);
    }

    io.emit("new-booking", booking);

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
  if (!EMAIL_NOTIFICATIONS_ENABLED) {
    console.log("Email notifications disabled: SMTP is not configured.");
  }
  console.log(`Server running on http://localhost:${PORT}`);
});
