const dateInput = document.querySelector("#date");
const slotsContainer = document.querySelector("#slots");
const form = document.querySelector("#booking-form");
const messageEl = document.querySelector("#message");
const timeInput = document.querySelector("#time");

let selectedSlot = "";

function setMessage(text, type = "") {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`.trim();
}

function createSlotButton(slot) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "slot";
  btn.textContent = slot.time;
  btn.disabled = !slot.available;

  if (!slot.available) {
    btn.title = "Deja reserve";
    return btn;
  }

  btn.addEventListener("click", () => {
    selectedSlot = slot.time;
    timeInput.value = slot.time;

    document.querySelectorAll(".slot").forEach((el) => el.classList.remove("active"));
    btn.classList.add("active");
  });

  return btn;
}

async function loadAvailability(date) {
  selectedSlot = "";
  timeInput.value = "";
  slotsContainer.innerHTML = "";
  setMessage("");

  if (!date) {
    return;
  }

  try {
    const res = await fetch(`/api/availability?date=${encodeURIComponent(date)}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Erreur lors du chargement des creneaux.");
    }

    data.slots.forEach((slot) => {
      slotsContainer.appendChild(createSlotButton(slot));
    });
  } catch (err) {
    setMessage(err.message, "error");
  }
}

dateInput.addEventListener("change", (event) => {
  loadAvailability(event.target.value);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("");

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
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Impossible de reserver ce creneau.");
    }

    setMessage("Rendez-vous confirme. Un email de confirmation a ete envoye.", "ok");
    form.reset();
    slotsContainer.innerHTML = "";
    selectedSlot = "";
  } catch (err) {
    setMessage(err.message, "error");
  }
});

// Do not allow booking in the past.
const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, "0");
const dd = String(today.getDate()).padStart(2, "0");
dateInput.min = `${yyyy}-${mm}-${dd}`;
