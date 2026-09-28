const state = { brand: loadBrand(), service: null, day: null, time: null };

const business = () => getBusiness(state.brand);
const service = () => (state.service === null ? null : business().services[state.service]);

// ---------- Week navigation ----------
// `days` (shared.js) is an 8-day rolling window starting `weekOffset` days
// from today. Previous/Next shift it a week at a time so customers aren't
// stuck only booking within the current week. Previous is disabled once
// back at today's window — a customer can't book into the past.
let weekOffset = 0;

function shiftWeek(deltaWeeks) {
    weekOffset = Math.max(0, weekOffset + deltaWeeks * 7);
    setDaysOffset(weekOffset);
    state.day = null;
    state.time = null;
    render();
}

function renderWeekNav() {
    const first = days[0], last = days[days.length - 1];
    const fmt = d => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    $("week-range").textContent = weekOffset === 0 ? `${fmt(first)} – ${fmt(last)} (this week)` : `${fmt(first)} – ${fmt(last)}`;
    $("week-prev").disabled = weekOffset === 0;
}

// Smoothly brings the next step into view once it appears, so picking a
// service/day/time never leaves the next thing to do scrolled off screen.
// Respects reduced-motion rather than forcing an animated scroll on anyone
// who's asked their system not to.
function scrollToStep(id) {
    const el = $(id);
    if (!el) return;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    requestAnimationFrame(() => el.scrollIntoView({ behavior, block: "start" }));
}

// Each render function fills a list from its <template>.
function renderServices() {
  $("service-list").replaceChildren(...business().services.map((s, i) => {
    const btn = fromTemplate("tpl-service");
    btn.querySelector(".svc-name").textContent = s.name;
    btn.querySelector(".svc-desc").textContent = `${s.mins} min. ${s.desc}`;
    btn.querySelector(".pr").textContent = `£${s.price}`;
    btn.setAttribute("aria-pressed", i === state.service);
    btn.onclick = () => { state.service = i; render(); scrollToStep("step-time"); };
    return btn;
  }));
}

function renderDays() {
  $("day-list").replaceChildren(...days.map((d, i) => {
    const btn = fromTemplate("tpl-day");
    btn.querySelector(".day-name").textContent = d.toLocaleDateString("en-GB", { weekday: "short" });
    btn.querySelector(".day-num").textContent = d.getDate();
    btn.disabled = !businessOpenOnDay(business(), d.getDay()); // closed on days the business marks off
    btn.setAttribute("aria-pressed", i === state.day);
    btn.onclick = () => { state.day = i; state.time = null; render(); scrollToStep("slot-list"); };
    return btn;
  }));
}

function renderSlots() {
  $("slot-list").replaceChildren(...slots.map(m => {
    const btn = fromTemplate("tpl-slot");
    btn.textContent = formatTime(m);
    // A slot has to fall inside the store's own hours for the selected day,
    // and — once a service is chosen — have enough free, skilled staff to
    // cover it (see isServiceBookable in shared.js) rather than the older
    // single-booking-per-slot check.
    const inHours = state.day === null || businessOpenAt(business(), days[state.day].getDay(), m);
    const staffed = state.day === null || state.service === null || isServiceBookable(state.brand, state.day, m, state.service);
    btn.disabled = !inHours || !staffed;
    btn.setAttribute("aria-pressed", m === state.time);
    btn.onclick = () => { state.time = m; render(); scrollToStep("step-details"); };
    return btn;
  }));
}

function renderCustomFields() {
  $("custom-field-list").replaceChildren(...(business().customFields || []).map(f => {
    const el = fromTemplate(f.type === "textarea" ? "tpl-custom-textarea" : "tpl-custom-text");
    el.querySelector(".cf-label").textContent = f.label;
    el.querySelector(".cf-opt").hidden = f.required;
    const input = el.querySelector(".cf-input");
    input.id = `cf-${f.id}`;
    return el;
  }));
}

function render() {
  const b = business(), s = service();
  setSlotsForBusiness(b); // this business's hours decide which half-hours the grid even offers
  $("biz-name").textContent = b.name;
  $("biz-tag").textContent = b.tagline;
  renderBrandSwitch(state.brand, setBrand); renderWeekNav(); renderServices(); renderDays(); renderSlots(); renderCustomFields();

  // Show each step only once the one before it is done.
  $("step-time").hidden = s === null;
  $("day-hint").hidden = state.day !== null;
  $("slot-list").hidden = state.day === null;
  $("step-details").hidden = state.time === null;

  // Show only the contact fields this business asks for, and an
  // "(optional)" tag on whichever of those it hasn't made required.
  const cf = b.customerFields;
  CONTACT_FIELDS.forEach(k => {
    $(`field-${k}`).hidden = !cf[k].enabled;
    $(`tag-${k}`).hidden = !cf[k].enabled || cf[k].required;
  });

  // Summary panel
  $("sum-where").textContent = b.name;
  $("sum-addr").textContent = b.address;
  $("sum-service").textContent = s ? s.name : "Not chosen yet";
  $("sum-when").textContent = state.time !== null ? `${formatDay(days[state.day])}, ${formatTime(state.time)}` : "Not chosen yet";
  $("sum-total").textContent = s ? `£${s.price}` : "-";
}

function showBooking() {
  $("confirmation").hidden = true;
  $("steps").hidden = false;
  $("summary").hidden = false;
}

function setBrand(key) {
  Object.assign(state, { brand: key, service: null, day: null, time: null });
  document.documentElement.dataset.brand = key;
  weekOffset = 0;
  setDaysOffset(0);
  saveBrand(key);
  showBooking();
  render();
}

$("details-form").addEventListener("submit", e => {
  e.preventDefault();
  const cf = business().customerFields;
  const customFields = business().customFields || [];
  // Only read/keep a value for fields this business actually asks for, so a
  // field that was later turned off can't sneak a stale value into a booking.
  const name = cf.name.enabled ? $("f-name").value.trim() : "";
  const email = cf.email.enabled ? $("f-email").value.trim() : "";
  const phone = cf.phone.enabled ? $("f-phone").value.trim() : "";
  const address = cf.address.enabled ? $("f-address").value.trim() : "";
  const custom = customFields.map(f => ({ id: f.id, label: f.label, value: $(`cf-${f.id}`).value.trim() }));
  const missingCustom = custom.find((c, i) => customFields[i].required && !c.value);
  const error =
    state.service === null ? "Choose a service first." :
    state.time === null ? "Pick a day and time." :
    cf.name.required && !name ? "Enter your name." :
    cf.email.required && !email ? "Enter your email address." :
    email && !/^\S+@\S+\.\S+$/.test(email) ? "Enter a valid email address." :
    cf.phone.required && !phone ? "Enter your phone number." :
    cf.address.required && !address ? "Enter your address." :
    missingCustom ? `Fill in "${missingCustom.label}".` : "";
  $("error").textContent = error;
  if (error) return;

  const ref = makeRef(), s = service();
  // When the business has auto-assign turned on, hand this booking straight
  // to whichever free, skilled staff are available; otherwise leave it
  // unassigned for admin to sort out (see the Booking page settings).
  const employees = business().autoAssignStaff ? autoAssignStaffFor(state.brand, state.day, state.time, state.service) : [];
  addBooking({
    ref, brand: state.brand, service: s.name, price: s.price, mins: s.mins,
    date: dateKey(days[state.day]), time: state.time,
    name, email, phone, address, note: $("f-note").value.trim(), custom,
    employees, employee: employees[0] || "",
    created: Date.now()
  });
  render(); // blocks the slot that was just booked

  $("conf-name").textContent = name ? name.split(" ")[0] : "there";
  $("conf-detail").textContent = `${service().name} on ${formatDay(days[state.day])} at ${formatTime(state.time)}.`;
  $("conf-ref").textContent = ref;
  $("conf-email-line").hidden = !email;
  $("conf-email").textContent = email;
  $("steps").hidden = true;
  $("summary").hidden = true;
  $("confirmation").hidden = false;
  window.scrollTo(0, 0);
});

$("week-prev").onclick = () => shiftWeek(-1);
$("week-next").onclick = () => shiftWeek(1);

$("reset").onclick = () => {
  $("details-form").reset();
  Object.assign(state, { service: null, day: null, time: null });
  showBooking();
  render();
};

window.addEventListener("storage", render);

setBrand(state.brand);