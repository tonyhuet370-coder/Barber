const dateInput = document.querySelector("#date");
const slotsContainer = document.querySelector("#slots");
const form = document.querySelector("#booking-form");
const messageEl = document.querySelector("#message");
const timeInput = document.querySelector("#time");
const submitButton = form.querySelector("button[type='submit']");
const downloadBookingLink = document.querySelector("#download-booking");

let selectedSlot = "";
let availabilityController = null;
let isSubmitting = false;
let bookingDownloadUrl = "";

function setMessage(text, type = "") {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`.trim();
}

function clearBookingDownload() {
  if (bookingDownloadUrl) {
    URL.revokeObjectURL(bookingDownloadUrl);
    bookingDownloadUrl = "";
  }

  downloadBookingLink.hidden = true;
  downloadBookingLink.removeAttribute("href");
  downloadBookingLink.removeAttribute("download");
}

function formatBookingDate(dateValue) {
  const date = new Date(`${dateValue}T12:00:00`);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function getRelativeBookingLabel(dateValue) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const selectedDate = new Date(`${dateValue}T00:00:00`);
  const diffDays = Math.round((selectedDate.getTime() - today.getTime()) / 86400000);

  if (diffDays === 1) {
    return "pour demain";
  }

  if (diffDays > 1 && diffDays <= 7) {
    return "pour cette semaine";
  }

  return "pour la date choisie";
}

function buildBookingMessage(booking) {
  const formattedDate = formatBookingDate(booking.date);
  const relativeLabel = getRelativeBookingLabel(booking.date);
  return `Rendez-vous confirme ${relativeLabel} : ${formattedDate} a ${booking.time} pour ${booking.service}.`;
}

function toIcsDate(dateValue, timeValue) {
  const [year, month, day] = dateValue.split("-");
  const [hour, minute] = timeValue.split(":");
  return `${year}${month}${day}T${hour}${minute}00`;
}

function escapeIcsText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function createBookingCalendarFile(booking) {
  const start = toIcsDate(booking.date, booking.time);
  const [hours, minutes] = booking.time.split(":").map(Number);
  const endDate = new Date(`${booking.date}T${booking.time}:00`);
  endDate.setHours(hours + 1, minutes, 0, 0);

  const end = [
    endDate.getFullYear(),
    String(endDate.getMonth() + 1).padStart(2, "0"),
    String(endDate.getDate()).padStart(2, "0")
  ].join("") +
    `T${String(endDate.getHours()).padStart(2, "0")}${String(endDate.getMinutes()).padStart(2, "0")}00`;

  const createdAt = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const summary = escapeIcsText(`Rendez-vous Barbier - ${booking.service}`);
  const description = escapeIcsText(
    `Client: ${booking.client_name}\nService: ${booking.service}\nDate: ${formatBookingDate(booking.date)}\nHeure: ${booking.time}`
  );

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Barber Shop//Appointments//FR",
    "BEGIN:VEVENT",
    `UID:booking-${booking.id || booking.date + booking.time}@barber-shop`,
    `DTSTAMP:${createdAt}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
}

function showBookingDownload(booking) {
  clearBookingDownload();

  const icsContent = createBookingCalendarFile(booking);
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  bookingDownloadUrl = URL.createObjectURL(blob);
  downloadBookingLink.href = bookingDownloadUrl;
  downloadBookingLink.download = `rendez-vous-${booking.date}-${booking.time.replace(":", "-")}.ics`;
  downloadBookingLink.hidden = false;
}

function updateSubmitState() {
  submitButton.disabled = !selectedSlot || isSubmitting;
}

function setSlotsLoading(isLoading) {
  slotsContainer.dataset.loading = isLoading ? "true" : "false";
}

function createSlotButton(slot) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "slot";
  btn.textContent = slot.time;
  btn.disabled = !slot.available;

  if (!slot.available) {
    btn.title = "Creneau indisponible";
    return btn;
  }

  btn.addEventListener("click", () => {
    selectedSlot = slot.time;
    timeInput.value = slot.time;

    document.querySelectorAll(".slot").forEach((el) => el.classList.remove("active"));
    btn.classList.add("active");
    updateSubmitState();
  });

  return btn;
}

async function loadAvailability(date) {
  if (availabilityController) {
    availabilityController.abort();
  }

  availabilityController = new AbortController();
  selectedSlot = "";
  timeInput.value = "";
  slotsContainer.innerHTML = "";
  setMessage("");
  clearBookingDownload();
  updateSubmitState();

  if (!date) {
    return;
  }

  try {
    setSlotsLoading(true);
    const res = await fetch(`/api/availability?date=${encodeURIComponent(date)}`, {
      signal: availabilityController.signal
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Erreur lors du chargement des creneaux.");
    }

    if (data.closed) {
      setMessage(data.message || "Salon ferme sur cette date.", "error");
    }

    data.slots.forEach((slot) => {
      slotsContainer.appendChild(createSlotButton(slot));
    });

    const hasAvailableSlot = data.slots.some((slot) => slot.available);
    if (!data.closed && !hasAvailableSlot) {
      setMessage("Journee complete: plus aucun creneau disponible.", "error");
    }
  } catch (err) {
    if (err.name === "AbortError") {
      return;
    }
    setMessage(err.message, "error");
  } finally {
    setSlotsLoading(false);
  }
}

dateInput.addEventListener("change", (event) => {
  loadAvailability(event.target.value);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("");

  if (isSubmitting) {
    return;
  }

  if (!selectedSlot) {
    setMessage("Selectionne un horaire disponible.", "error");
    return;
  }

  const formData = new FormData(form);
  const payload = {
    name: formData.get("name"),
    email: formData.get("email"),
    service: formData.get("service"),
    date: formData.get("date"),
    time: formData.get("time")
  };

  try {
    isSubmitting = true;
    updateSubmitState();
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    let data;

    try {
      data = await res.json();
    } catch {
      throw new Error("Le serveur a repondu de facon invalide. Reessaie dans un instant.");
    }

    if (!res.ok) {
      throw new Error(data.error || "Impossible de reserver ce creneau.");
    }

    const confirmedBooking = data.booking || {
      client_name: payload.name,
      client_email: payload.email,
      service: payload.service,
      date: payload.date,
      time: payload.time
    };

    setMessage(buildBookingMessage(confirmedBooking), "ok");
    showBookingDownload(confirmedBooking);
    form.reset();
    slotsContainer.innerHTML = "";
    selectedSlot = "";
    updateSubmitState();
  } catch (err) {
    if (err.name === "TypeError") {
      setMessage("Connexion au serveur impossible. Verifie le reseau puis reessaie.", "error");
      return;
    }

    setMessage(err.message, "error");
  } finally {
    isSubmitting = false;
    updateSubmitState();
  }
});

// Do not allow booking in the past or for today.
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const yyyy = tomorrow.getFullYear();
const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
const dd = String(tomorrow.getDate()).padStart(2, "0");
dateInput.min = `${yyyy}-${mm}-${dd}`;
updateSubmitState();
