const rows = document.querySelector("#rows");
const alertEl = document.querySelector("#alert");

function renderBooking(booking, prepend = false) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${booking.date}</td>
    <td>${booking.time}</td>
    <td>${booking.client_name}</td>
    <td>${booking.client_email}</td>
    <td>${booking.service}</td>
  `;

  if (prepend) {
    rows.prepend(tr);
  } else {
    rows.appendChild(tr);
  }
}

async function loadExistingBookings() {
  const res = await fetch("/api/bookings");
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Impossible de charger les rendez-vous.");
  }

  rows.innerHTML = "";
  data.bookings.forEach((booking) => renderBooking(booking));
}

function showNotification(booking) {
  alertEl.hidden = false;
  alertEl.textContent = `Nouveau rendez-vous: ${booking.client_name} le ${booking.date} a ${booking.time}`;
}

async function init() {
  try {
    await loadExistingBookings();
  } catch (err) {
    alertEl.hidden = false;
    alertEl.textContent = err.message;
  }

  const socket = io();
  socket.on("new-booking", (booking) => {
    renderBooking(booking, true);
    showNotification(booking);
  });
}

init();
