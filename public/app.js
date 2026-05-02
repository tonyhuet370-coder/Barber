const dateInput = document.querySelector("#date");
const slotsContainer = document.querySelector("#slots");
const form = document.querySelector("#booking-form");
const messageEl = document.querySelector("#message");
const timeInput = document.querySelector("#time");
const submitButton = form.querySelector("button[type='submit']");

let selectedSlot = "";
let availabilityController = null;
let isSubmitting = false;

function setMessage(text, type = "") {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`.trim();
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

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Impossible de reserver ce creneau.");
    }

    setMessage("Rendez-vous confirme.", "ok");
    form.reset();
    slotsContainer.innerHTML = "";
    selectedSlot = "";
    updateSubmitState();
  } catch (err) {
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
