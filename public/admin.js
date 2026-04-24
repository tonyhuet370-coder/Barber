const rows = document.querySelector("#rows");
const alertEl = document.querySelector("#alert");
const todayCountEl = document.querySelector("#today-count");
const upcomingCountEl = document.querySelector("#upcoming-count");
const confirmedCountEl = document.querySelector("#confirmed-count");
const emptyStateEl = document.querySelector("#empty-state");
const logoutBtn = document.querySelector("#logout-btn");

function createCell(text) {
  const td = document.createElement("td");
  td.textContent = text || "-";
  return td;
}

function createStatusBadge(status) {
  const span = document.createElement("span");
  const normalized = (status || "Confirme").toLowerCase();
  span.className = `badge ${normalized}`;
  span.textContent = status || "Confirme";
  return span;
}

async function updateBookingStatus(id, status) {
  const res = await fetch(`/api/bookings/${id}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ status })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Impossible de mettre a jour le statut.");
  }
}

function renderBooking(booking, prepend = false) {
  const tr = document.createElement("tr");
  tr.appendChild(createCell(booking.date));
  tr.appendChild(createCell(booking.time));
  tr.appendChild(createCell(booking.client_name));
  tr.appendChild(createCell(booking.client_email));
  tr.appendChild(createCell(booking.service));

  const statusTd = document.createElement("td");
  statusTd.appendChild(createStatusBadge(booking.status));
  tr.appendChild(statusTd);

  const actionsTd = document.createElement("td");
  const actions = document.createElement("div");
  actions.className = "actions";


  // Bouton Confirmer
  const btnConfirme = document.createElement("button");
  btnConfirme.className = "btn-secondary";
  btnConfirme.textContent = "Confirme";
  btnConfirme.addEventListener("click", async () => {
    try {
      await updateBookingStatus(booking.id, "Confirme");
      await loadExistingBookings();
    } catch (err) {
      alertEl.hidden = false;
      alertEl.textContent = err.message;
    }
  });
  actions.appendChild(btnConfirme);

  // Bouton Annule
  const btnAnnule = document.createElement("button");
  btnAnnule.className = "btn-secondary";
  btnAnnule.textContent = "Annule";
  btnAnnule.addEventListener("click", async () => {
    try {
      await updateBookingStatus(booking.id, "Annule");
      await loadExistingBookings();
    } catch (err) {
      alertEl.hidden = false;
      alertEl.textContent = err.message;
    }
  });
  actions.appendChild(btnAnnule);

  // Bouton Termine = suppression
  const btnTermine = document.createElement("button");
  btnTermine.className = "btn-secondary";
  btnTermine.textContent = "Termine";
  btnTermine.addEventListener("click", async () => {
    if (!confirm("Supprimer ce rendez-vous définitivement ?")) return;
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur lors de la suppression.");
      }
      tr.remove();
      // Optionnel : mettre à jour le résumé
      await loadExistingBookings();
    } catch (err) {
      alertEl.hidden = false;
      alertEl.textContent = err.message;
    }
  });
  actions.appendChild(btnTermine);

  actionsTd.appendChild(actions);
  tr.appendChild(actionsTd);

  if (prepend) {
    rows.prepend(tr);
  } else {
    rows.appendChild(tr);
  }
}

function updateSummary(bookings) {
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = bookings.filter((booking) => booking.date === today).length;
  const upcomingCount = bookings.filter((booking) => booking.date >= today).length;
  const confirmedCount = bookings.filter((booking) => (booking.status || "Confirme") === "Confirme").length;

  todayCountEl.textContent = String(todayCount);
  upcomingCountEl.textContent = String(upcomingCount);
  confirmedCountEl.textContent = String(confirmedCount);
}

async function loadExistingBookings() {
  const res = await fetch("/api/bookings");

  if (res.status === 401) {
    window.location.href = "/acces-coiffeur-prive";
    return;
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Impossible de charger les rendez-vous.");
  }

  rows.innerHTML = "";
  emptyStateEl.hidden = data.bookings.length > 0;
  updateSummary(data.bookings);
  data.bookings.forEach((booking) => renderBooking(booking));
}

function showNotification(booking) {
  alertEl.hidden = false;
  alertEl.textContent = `Nouveau rendez-vous: ${booking.client_name} le ${booking.date} a ${booking.time}`;
}

logoutBtn.addEventListener("click", async () => {
  await fetch("/api/admin/logout", { method: "POST" });
  window.location.href = "/acces-coiffeur-prive";
});

async function init() {
  try {
    await loadExistingBookings();
  } catch (err) {
    alertEl.hidden = false;
    alertEl.textContent = err.message;
  }

  const socket = io();
  socket.on("new-booking", async (booking) => {
    showNotification(booking);
    await loadExistingBookings();
  });
}

init();
