// ---------- Employees: skills + weekly schedule ----------
// Sunday-first to match Date#getDay() (0 = Sunday ... 6 = Saturday), so a
// weekday index straight off a JS Date can be used to key into a schedule
// object with no extra translation.
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_LABELS = { sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat" };

// A brand-new employee defaults to a normal Mon-Sat, 9-5 week (closed
// Sunday, matching the business itself being closed Sundays).
const defaultSchedule = () => Object.fromEntries(DAY_KEYS.map(k => [k, { working: k !== "sun", start: "09:00", end: "17:00" }]));

const timeToMins = t => { const [h, m] = (t || "0:0").split(":").map(Number); return h * 60 + m; };

// Employees saved before skills/schedules existed only had a single
// `specialty` string and one start/end pair for every day. Reshape those
// into the new arrays/schedule the first time they're read, so nothing
// saved earlier breaks.
function migrateEmployee(e) {
    if (e.skills && e.schedule) return e; // already in the new shape
    const skills = e.skills || (e.specialty ? [e.specialty] : []);
    const schedule = e.schedule || Object.fromEntries(DAY_KEYS.map(k => [k, {
        working: k !== "sun",
        start: e.start || "09:00",
        end: e.end || "17:00"
    }]));
    return { name: e.name, skills, schedule };
}

// Is this employee rostered on and able to cover a job of `mins` minutes
// starting at slot `time` (minutes after midnight) on `weekday` (0-6, Sun
// first)? The whole job — not just its start — has to fit inside the shift.
function employeeWorking(emp, weekday, time, mins) {
    const day = emp.schedule && emp.schedule[DAY_KEYS[weekday]];
    if (!day || !day.working) return false;
    return time >= timeToMins(day.start) && time + mins <= timeToMins(day.end);
}

const employeeHasSkill = (emp, serviceName) => (emp.skills || []).includes(serviceName);

// Is the business itself open for a slot starting at `time` (minutes after
// midnight) on `weekday` (0-6, Sunday first)? Mirrors employeeWorking's
// shape and logic, but for the business's own opening hours rather than a
// person's shift — a slot only shows to customers when both agree.
function businessOpenAt(biz, weekday, time) {
    const day = biz.hours && biz.hours[DAY_KEYS[weekday]];
    return !!(day && day.working && time >= timeToMins(day.start) && time < timeToMins(day.end));
}
const businessOpenOnDay = (biz, weekday) => !!(biz.hours && biz.hours[DAY_KEYS[weekday]] && biz.hours[DAY_KEYS[weekday]].working);

// Every employee (by name) assigned to a booking, however that booking
// stores it — `employees: [...]` going forward, or the older single
// `employee` string.
const bookingStaff = b => b.employees && b.employees.length ? b.employees : (b.employee ? [b.employee] : []);

const rangesOverlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

// Names of employees already tied up (in any booking, any service) for
// this brand during [startMin, endMin) on this date. `excludeRef` leaves
// out the booking currently being edited, so it doesn't block itself.
function busyEmployeeNames(brand, date, startMin, endMin, excludeRef) {
    const names = new Set();
    bookingsFor(brand).forEach(b => {
        if (b.ref === excludeRef || b.date !== date) return;
        if (rangesOverlap(startMin, endMin, b.time, b.time + b.mins)) bookingStaff(b).forEach(n => names.add(n));
    });
    return names;
}

// Everyone rostered on for this slot, split into who's actually free right
// now and, of those, who can do this particular job.
function availableEmployeesFor(brand, dayIndex, time, serviceIndex, excludeRef) {
    const biz = getBusiness(brand);
    const service = biz.services[serviceIndex];
    const weekday = days[dayIndex].getDay();
    const date = dateKey(days[dayIndex]);
    const busy = busyEmployeeNames(brand, date, time, time + service.mins, excludeRef);
    const working = (biz.employees || []).filter(e => employeeWorking(e, weekday, time, service.mins));
    const free = working.filter(e => !busy.has(e.name));
    const skilled = free.filter(e => employeeHasSkill(e, service.name));
    return { working, free, skilled };
}

// Picks staff for a booking as it's being created (rather than backfilling
// existing ones — see isServiceBookable's sibling, the admin dashboard's
// "Auto-assign staff" button). Used when a business has auto-assign turned
// on: takes the free, skilled employees isServiceBookable already confirmed
// exist, up to how many the service needs.
function autoAssignStaffFor(brand, dayIndex, time, serviceIndex) {
    const biz = getBusiness(brand);
    const service = biz.services[serviceIndex];
    if (!service || !biz.employees || !biz.employees.length) return [];
    const needed = service.staff || 1;
    const { skilled } = availableEmployeesFor(brand, dayIndex, time, serviceIndex);
    // Offer the job to whoever currently has the fewest bookings first, so
    // work spreads across the roster instead of always landing on the
    // first free, skilled name in the list.
    const counts = employeeJobCounts(brand);
    const ordered = skilled.slice().sort((a, b) => (counts[a.name] || 0) - (counts[b.name] || 0));
    return ordered.slice(0, needed).map(e => e.name);
}

// Can this service be booked in this slot? True whenever there are enough
// free, skilled employees to cover it. (Earlier this also required one
// rostered employee to be left over afterwards, which meant a slot could
// show as unavailable even though someone free and skilled was standing
// right there — that extra "keep a spare" rule has been dropped.)
function isServiceBookable(brand, dayIndex, time, serviceIndex) {
    const biz = getBusiness(brand);
    const service = biz.services[serviceIndex];
    if (!service) return false;
    if (!biz.employees || !biz.employees.length) return !isBooked(brand, dayIndex, time); // no roster set up: fall back to the old one-booking-per-slot demo behaviour
    const needed = service.staff || 1;
    const { skilled } = availableEmployeesFor(brand, dayIndex, time, serviceIndex);
    return skilled.length >= needed;
}

// How many bookings each employee (by name) is already staffed on for this
// brand, across every date — used to spread auto-assigned work evenly
// rather than always reaching for the same first-listed free person.
function employeeJobCounts(brand) {
    const counts = {};
    bookingsFor(brand).forEach(b => bookingStaff(b).forEach(name => { counts[name] = (counts[name] || 0) + 1; }));
    return counts;
}

// Demo data: one entry per business type. The admin "Booking page" tab can override
// name, tagline, address and services per brand — see getBusiness() below.
const BUSINESSES = {
  barber: {
    label: "Barber", name: "Northside Barbers", address: "14 Call Lane, Leeds",
    tagline: "Cuts, shaves and beard work in Leeds city centre. Book online in under a minute.",
    services: [
      { name: "Classic cut", mins: 30, price: 25, desc: "Scissors and clippers, finished with a hot towel." },
      { name: "Cut and beard trim", mins: 45, price: 35, desc: "Full cut plus a shaped beard." },
      { name: "Hot towel shave", mins: 30, price: 28, desc: "Traditional straight-razor shave." },
      { name: "Kids cut (under 12)", mins: 20, price: 16, desc: "Quick, calm and no fuss." }
    ]
  },
  physio: {
    label: "Physio clinic", name: "Bloom Physiotherapy", address: "3 Park Row, Leeds",
    tagline: "Sports injuries, back pain and rehab. Pick a time that suits you.",
    services: [
      { name: "Initial assessment", mins: 60, price: 65, desc: "Full assessment and a treatment plan." },
      { name: "Follow-up session", mins: 30, price: 40, desc: "Hands-on treatment and exercise progress." },
      { name: "Sports massage", mins: 45, price: 45, desc: "Deep tissue work for recovery." },
      { name: "Online consultation", mins: 30, price: 35, desc: "Video call from home." }
    ]
  },
  groom: {
    label: "Dog groomer", name: "Paws & Co Grooming", address: "27 Kirkgate, Leeds",
    tagline: "Gentle grooming for dogs of every size. Book your pup in today.",
    services: [
      { name: "Bath and brush", mins: 60, price: 30, desc: "Wash, blow-dry and a full brush out." },
      { name: "Full groom", mins: 90, price: 55, desc: "Bath, cut, nails and ears." },
      { name: "Puppy intro groom", mins: 45, price: 25, desc: "A short, calm first visit." },
      { name: "Nail trim", mins: 15, price: 10, desc: "Walk-ins welcome, booking is quicker." }
    ]
  }
};

// The 8-day window of dates the calendar shows. `days` starts `offset` days
// from today — offset 0 (the default) is "today and the week after". The
// admin calendar's week-nav buttons call setDaysOffset() to shift this
// window a week at a time; the customer booking page never calls it, so it
// always sees today onward.
const computeDays = offset => Array.from({ length: 8 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + offset + i); return d; });
let days = computeDays(0);
const setDaysOffset = offset => { days = computeDays(offset); return days; };

// The half-hour rows the calendars show, derived from the current
// business's opening hours: the earliest open time to the latest close
// time across its working days, so every open day's slots land somewhere
// in the grid even when different days keep different hours. Recomputed
// whenever the business/brand changes (see setSlotsForBusiness calls in
// script.js and the admin script.js).
function computeSlotsForBusiness(biz) {
    const workingDays = DAY_KEYS.map(k => biz.hours[k]).filter(d => d.working);
    if (!workingDays.length) return [];
    const startMin = Math.min(...workingDays.map(d => timeToMins(d.start)));
    const endMin = Math.max(...workingDays.map(d => timeToMins(d.end)));
    const count = Math.max(0, Math.round((endMin - startMin) / 30));
    return Array.from({ length: count }, (_, i) => startMin + i * 30);
}
let slots = computeSlotsForBusiness({ hours: defaultSchedule() });
const setSlotsForBusiness = biz => { slots = computeSlotsForBusiness(biz); return slots; };

// ---------- Helpers ----------
const $ = id => document.getElementById(id);
const fromTemplate = id => $(id).content.firstElementChild.cloneNode(true);
const formatDay = d => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
const formatTime = m => {
  const h = Math.floor(m / 60);
  return `${h > 12 ? h - 12 : h}:${String(m % 60).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`;
};
const dateKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// The inverse of dateKey — built from the parts rather than `new Date(str)`,
// which parses a plain "YYYY-MM-DD" string as UTC and can land on the wrong
// local day.
const parseDateKey = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const makeRef = () => Math.random().toString(36).slice(2, 8).toUpperCase();

// ---------- Storage: one small helper backs bookings, business edits and the chosen brand ----------
// Falls back to an in-memory value if the browser blocks storage, so the page still works.
const store = (key, fallback) => {
  let memory = fallback;
  return {
    read: () => { try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch (e) { return memory; } },
    write: v => { memory = v; try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }
  };
};

// Bookings, shared by the customer page and the dashboard.
const bookingStore = store("bookingDemo.bookings", []);
const bookingsFor = brand => bookingStore.read().filter(x => x.brand === brand);
const addBooking = booking => bookingStore.write([...bookingStore.read(), booking]);
const removeBooking = ref => bookingStore.write(bookingStore.read().filter(x => x.ref !== ref));
const clearBookings = brand => bookingStore.write(bookingStore.read().filter(x => x.brand !== brand));

// A slot is taken if it is one of the fake existing appointments or a real booking.
const isBooked = (brand, dayIndex, m) =>
  (dayIndex * 7 + (m / 30) * 3 + brand.length) % 5 === 0 ||
  bookingsFor(brand).some(x => x.date === dateKey(days[dayIndex]) && x.time === m);

// Business content: BUSINESSES above, with any admin edits layered on top per brand.
const overrideStore = store("bookingDemo.businessOverrides", {});

// The four contact details a booking form can ask for. Each one is either
// asked for at all (`enabled`) or not, and — only if it is — whether
// leaving it blank stops the booking (`required`). Address defaults off
// since most demo businesses don't need one; the rest default to a normal
// name+email booking with phone asked for but optional.
const CONTACT_FIELDS = ["name", "email", "phone", "address"];
const defaultCustomerFields = () => ({
    name: { enabled: true, required: true },
    email: { enabled: true, required: true },
    phone: { enabled: true, required: false },
    address: { enabled: false, required: false }
});

// A business saved before per-field enable/require settings existed only
// had `requiredFields` — a flat name->boolean map, with every field always
// shown. Reshape those into the new enabled+required shape the first time
// they're read, same pattern as migrateEmployee above.
function migrateCustomerFields(cf) {
    const defaults = defaultCustomerFields();
    if (!cf) return defaults;
    const isOldShape = CONTACT_FIELDS.some(k => typeof cf[k] === "boolean");
    return Object.fromEntries(CONTACT_FIELDS.map(k => isOldShape
        ? [k, { enabled: true, required: !!cf[k] }]
        : [k, { ...defaults[k], ...(cf[k] || {}) }]));
}

// Custom per-business fields beyond the four built-in contact fields above
// (name/email/phone/address). Each is { id, label, type, required } — type
// is "text" or "textarea". The id is generated once when a field is added
// and stays fixed after that: bookings store answers against it, so a
// field can later be renamed (or removed from the business) without
// orphaning what past customers answered.
const makeFieldId = () => "cf_" + Math.random().toString(36).slice(2, 9);

const getBusiness = brand => {
    const biz = { ...BUSINESSES[brand], ...overrideStore.read()[brand] };
    if (biz.employees) biz.employees = biz.employees.map(migrateEmployee);
    biz.hours = biz.hours
        ? Object.fromEntries(DAY_KEYS.map(k => [k, biz.hours[k] || defaultSchedule()[k]]))
        : defaultSchedule();
    biz.customerFields = migrateCustomerFields(biz.customerFields || biz.requiredFields);
    biz.customFields = Array.isArray(biz.customFields) ? biz.customFields : [];
    if (biz.autoAssignStaff === undefined) biz.autoAssignStaff = false;
    return biz;
};
const saveBusiness = (brand, data) => overrideStore.write({ ...overrideStore.read(), [brand]: data });
const resetBusiness = brand => { const all = overrideStore.read(); delete all[brand]; overrideStore.write(all); };

// The selected business, remembered between the customer page and the dashboard.
const brandStore = store("bookingDemo.brand", "barber");
const loadBrand = () => (BUSINESSES[brandStore.read()] ? brandStore.read() : "barber");
const saveBrand = key => brandStore.write(key);

function renderBrandSwitch(current, onPick) {
  $("brand-switch").replaceChildren(...Object.entries(BUSINESSES).map(([key, b]) => {
    const btn = fromTemplate("tpl-brand");
    btn.textContent = b.label;
    btn.setAttribute("aria-pressed", key === current);
    btn.onclick = () => onPick(key);
    return btn;
  }));
}