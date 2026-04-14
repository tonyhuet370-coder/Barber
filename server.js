const path = require("path");
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const dayjs = require("dayjs");
const http = require("http");
const { Server } = require("socket.io");
const db = require("./db");

require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const OWNER_EMAIL = process.env.OWNER_EMAIL || "boss@monsalon.com";

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

function createTransporter() {
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

  // Fallback for local dev: no real email, messages are printed in server logs.
  return nodemailer.createTransport({ jsonTransport: true });
}

const transporter = createTransporter();

async function sendBookingEmails(booking) {
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

  db.all(
    "SELECT time FROM bookings WHERE date = ?",
    [date],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: "Erreur serveur" });
      }

      const booked = new Set(rows.map((r) => r.time));
      const result = allSlots.map((time) => ({
        time,
        available: !booked.has(time)
      }));

      return res.json({ date, slots: result });
    }
  );
});

app.get("/api/bookings", (_, res) => {
  db.all(
    "SELECT id, client_name, client_email, service, date, time, created_at FROM bookings ORDER BY date ASC, time ASC",
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: "Erreur serveur" });
      }

      return res.json({ bookings: rows });
    }
  );
});

app.post("/api/bookings", (req, res) => {
  const { name, email, service, date, time } = req.body;

  if (!name || !email || !service || !date || !time) {
    return res.status(400).json({ error: "Tous les champs sont obligatoires." });
  }

  const normalizedDate = dayjs(date, "YYYY-MM-DD", true);
  if (!normalizedDate.isValid()) {
    return res.status(400).json({ error: "Date invalide." });
  }

  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  if (!validTime) {
    return res.status(400).json({ error: "Heure invalide." });
  }

  const createdAt = dayjs().format("YYYY-MM-DD HH:mm:ss");

  db.run(
    `INSERT INTO bookings (client_name, client_email, service, date, time, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [name.trim(), email.trim().toLowerCase(), service.trim(), normalizedDate.format("YYYY-MM-DD"), time, createdAt],
    async function onInsert(err) {
      if (err) {
        if (err.message.includes("UNIQUE constraint failed")) {
          return res.status(409).json({ error: "Ce creneau est deja reserve." });
        }
        return res.status(500).json({ error: "Erreur serveur" });
      }

      const booking = {
        id: this.lastID,
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

      io.emit("new-booking", booking);

      return res.status(201).json({
        message: "Rendez-vous enregistre avec succes.",
        booking
      });
    }
  );
});

app.get("/admin", (_, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

io.on("connection", () => {
  console.log("Admin dashboard connected");
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
