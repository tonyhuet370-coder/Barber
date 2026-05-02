const dateInput = document.querySelector("#date");
const slotsContainer = document.querySelector("#slots");
const form = document.querySelector("#booking-form");
const messageEl = document.querySelector("#message");
const timeInput = document.querySelector("#time");
const submitButton = form.querySelector("button[type='submit']");
const bookingTicket = document.querySelector("#booking-ticket");
const downloadBookingLink = document.querySelector("#download-booking");
const ticketTitle = document.querySelector("#ticket-title");
const ticketName = document.querySelector("#ticket-name");
const ticketService = document.querySelector("#ticket-service");
const ticketDate = document.querySelector("#ticket-date");
const ticketTime = document.querySelector("#ticket-time");

let selectedSlot = "";
let availabilityController = null;
let isSubmitting = false;
let latestConfirmedBooking = null;
let isDownloadingBooking = false;

function setMessage(text, type = "") {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`.trim();
}

function clearBookingDownload() {
  downloadBookingLink.hidden = true;
  downloadBookingLink.disabled = false;
  downloadBookingLink.dataset.loading = "false";
  downloadBookingLink.textContent = "Telecharger mon rendez-vous en PDF";
  latestConfirmedBooking = null;
}

function clearBookingTicket() {
  bookingTicket.hidden = true;
  ticketTitle.textContent = "Votre rendez-vous est enregistre";
  ticketName.textContent = "-";
  ticketService.textContent = "-";
  ticketDate.textContent = "-";
  ticketTime.textContent = "-";
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

function showBookingDownload(booking) {
  clearBookingDownload();
  latestConfirmedBooking = booking;
  downloadBookingLink.hidden = false;
}

function setDownloadLoadingState(isLoading) {
  isDownloadingBooking = isLoading;
  downloadBookingLink.disabled = isLoading;
  downloadBookingLink.dataset.loading = isLoading ? "true" : "false";
  downloadBookingLink.textContent = isLoading
    ? "Preparation du PDF..."
    : "Telecharger mon rendez-vous en PDF";
}

function isIosDevice() {
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent);
}

function isSafariBrowser() {
  const userAgent = window.navigator.userAgent;
  return /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|Chrome/i.test(userAgent);
}

async function downloadBookingPdf(booking) {
  const jsPdfNamespace = window.jspdf;

  if (!jsPdfNamespace || !jsPdfNamespace.jsPDF) {
    setMessage("Le module PDF n'est pas disponible pour le moment.", "error");
    return;
  }

  const { jsPDF } = jsPdfNamespace;
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const formattedDate = formatBookingDate(booking.date);
  const relativeLabel = getRelativeBookingLabel(booking.date);

  pdf.setFillColor(247, 240, 230);
  pdf.roundedRect(15, 18, 180, 92, 6, 6, "F");
  pdf.setTextColor(120, 88, 50);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text("Confirmation de rendez-vous", 20, 30);

  pdf.setTextColor(30, 25, 20);
  pdf.setFontSize(18);
  pdf.text("Barber Shop", 20, 40);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text(`Votre rendez-vous est confirme ${relativeLabel}.`, 20, 50);
  pdf.text(`Nom : ${booking.client_name}`, 20, 64);
  pdf.text(`Service : ${booking.service}`, 20, 74);
  pdf.text(`Date : ${formattedDate}`, 20, 84);
  pdf.text(`Heure : ${booking.time}`, 20, 94);

  pdf.setFontSize(10);
  pdf.setTextColor(90, 90, 90);
  pdf.text("Merci de vous presenter quelques minutes avant votre horaire.", 20, 105);

  const fileName = `rendez-vous-${booking.date}-${booking.time.replace(":", "-")}.pdf`;

  if (isIosDevice() || isSafariBrowser()) {
    const pdfBlob = pdf.output("blob");

    if (typeof window.navigator.share === "function") {
      try {
        const pdfFile = new File([pdfBlob], fileName, { type: "application/pdf" });

        if (!window.navigator.canShare || window.navigator.canShare({ files: [pdfFile] })) {
          await window.navigator.share({
            title: "Rendez-vous Barber Shop",
            text: "Voici votre confirmation de rendez-vous.",
            files: [pdfFile]
          });
          setMessage("Le PDF a ete ouvert dans le menu de partage. Sur iPhone, choisis Enregistrer dans Fichiers.", "ok");
          return;
        }
      } catch (err) {
        if (err && err.name !== "AbortError") {
          console.error("Share error:", err);
        }
      }
    }

    const pdfUrl = URL.createObjectURL(pdfBlob);
    window.open(pdfUrl, "_blank", "noopener,noreferrer");
    setMessage("Le PDF s'ouvre dans un nouvel onglet. Sur iPhone, utilise Partager puis Enregistrer dans Fichiers.", "ok");
    window.setTimeout(() => {
      URL.revokeObjectURL(pdfUrl);
    }, 60000);
    return;
  }

  pdf.save(fileName);
}

function showBookingTicket(booking) {
  ticketTitle.textContent = buildBookingMessage(booking);
  ticketName.textContent = booking.client_name || "-";
  ticketService.textContent = booking.service || "-";
  ticketDate.textContent = formatBookingDate(booking.date);
  ticketTime.textContent = booking.time || "-";
  bookingTicket.hidden = false;
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
  clearBookingTicket();
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
    showBookingTicket(confirmedBooking);
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
clearBookingTicket();

downloadBookingLink.addEventListener("click", async () => {
  if (!latestConfirmedBooking || isDownloadingBooking) {
    return;
  }

  setDownloadLoadingState(true);

  downloadBookingPdf(latestConfirmedBooking)
    .finally(() => {
      window.setTimeout(() => {
        setDownloadLoadingState(false);
      }, 600);
    });
});
