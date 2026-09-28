// Admin dashboard. Shared data, storage and business-content helpers live in shared.js.
let brand = loadBrand();
let view = "calendar";

const SAMPLE_NAMES = ["Amira Khan", "Tom Hughes", "Priya Patel", "Jack Wilson", "Sophie Clarke", "Daniel Okafor", "Emma Brown", "Liam Murphy"];
const STAFF_SAMPLE_NAMES = ["Priya Shah", "Callum Reid", "Nadia Osei", "Ben Fischer", "Louisa Chen", "Marcus Webb", "Freya Adams", "Tariq Malik"];

// Fallback swatches for services that don't have an explicit color yet.
// Shared by the calendar legend and both color editors so the preview always
// matches what's actually shown on the calendar.
const FALLBACK_COLORS = ["#dbeafe", "#fce7f3", "#d1fae5", "#fef3c7", "#e0e7ff", "#ffedd5"];
const colorForService = (s, i) => s.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length];

const colorForEmployee = (e, i) => e.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length];



$("bm-close").onclick = () => setPanelOpen(false);

// Calendar cards use whatever colour a service/employee was given — including
// custom ones picked in the quick colour editor, which could be dark. Text
// was previously hard-coded to near-black ("#111"), which goes unreadable
// against a dark swatch. This picks black or white based on the background's
// perceived brightness (the standard YIQ formula) instead. Accepts either
// one hex colour or an array (a multi-employee card averages across all its
// stripe colours, so the single text colour used over the whole card still
// contrasts reasonably against each of them).
function readableTextColor(colors) {
    const list = Array.isArray(colors) ? colors : [colors];
    let total = 0, count = 0;
    list.forEach(hex => {
        if (typeof hex !== "string" || hex[0] !== "#") return;
        const clean = hex.length === 4 ? hex.slice(1).split("").map(c => c + c).join("") : hex.slice(1, 7);
        if (clean.length !== 6) return;
        const r = parseInt(clean.slice(0, 2), 16), g = parseInt(clean.slice(2, 4), 16), b = parseInt(clean.slice(4, 6), 16);
        total += (r * 299 + g * 587 + b * 114) / 1000;
        count++;
    });
    if (!count) return "#111";
    return (total / count) >= 150 ? "#111" : "#fff";
}

// ---------- Past-week read-only guard ----------
// Anything before today is historical record: the calendar shows it but
// won't let admin add, edit or delete it. Compared at midnight so "today"
// itself stays fully editable no matter what time it is right now.
function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}
function isPastDay(d) {
    const day = new Date(d);
    day.setHours(0, 0, 0, 0);
    return day < startOfToday();
}
function isToday(d) {
    const day = new Date(d);
    day.setHours(0, 0, 0, 0);
    return day.getTime() === startOfToday().getTime();
}

// ---------- Calendar search ----------
// Free-text search over the calendar's bookings, narrowed to whichever
// fields are ticked in the "Search in" menu. Filtering doesn't remove
// bookings from the grid (that would reflow every day's layout as you
// type) — non-matches just fade out, so the grid stays stable and matches
// are easy to spot.
let searchQuery = "";
const searchFields = { name: true, service: true, staff: true, email: true, phone: true, notes: true, ref: true };

function bookingMatchesSearch(b) {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const haystack = [];
    if (searchFields.name) haystack.push(b.name);
    if (searchFields.service) haystack.push(b.service);
    if (searchFields.staff) haystack.push(...bookingStaff(b));
    if (searchFields.email) haystack.push(b.email);
    if (searchFields.phone) haystack.push(b.phone);
    if (searchFields.notes) haystack.push(b.note, b.companyNote);
    if (searchFields.ref) haystack.push(b.ref);
    return haystack.some(v => v && String(v).toLowerCase().includes(q));
}

$("cal-search").addEventListener("input", e => {
    searchQuery = e.target.value.trim();
    renderCalendar();
});
// Re-open the results dropdown on refocus (e.g. after picking a match, or
// after a click elsewhere closed it) rather than making the person retype.
$("cal-search").addEventListener("focus", () => setSearchResultsOpen(true));
$("cal-search").addEventListener("keydown", e => { if (e.key === "Escape") setSearchResultsOpen(false); });

function setSearchOptionsOpen(open) {
    $("search-options-menu").hidden = !open;
    $("search-options-btn").setAttribute("aria-expanded", String(open));
}
$("search-options-btn").onclick = () => setSearchOptionsOpen($("search-options-menu").hidden);
document.addEventListener("click", e => {
    if (!$("search-options-menu").hidden && !e.target.closest(".search-options-wrap")) setSearchOptionsOpen(false);
    if (!$("search-results").hidden && !e.target.closest(".search-bar")) setSearchResultsOpen(false);
});
document.querySelectorAll(".search-field").forEach(cb => {
    cb.onchange = () => { searchFields[cb.value] = cb.checked; renderCalendar(); };
});

// ---------- Cross-week search results ----------
// The calendar grid only ever shows one week, so dimming/highlighting alone
// can't surface a match sitting in a different week — this dropdown lists
// every match, whichever week it falls in, and jumps the calendar there.
function setSearchResultsOpen(open) {
    $("search-results").hidden = !open || !searchQuery;
}

// Custom scroll function for a gentler, slower glide
function slowScrollToCenter(card) {
    const container = document.querySelector(".calendar");
    if (!container || !card) return;

    const startX = container.scrollLeft;
    const startY = window.scrollY;

    const cardRect = card.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // Calculate targets to center the card horizontally in the calendar, and vertically on screen
    const targetX = startX + (cardRect.left - containerRect.left) - (containerRect.width / 2) + (cardRect.width / 2);
    const targetY = startY + cardRect.top - (window.innerHeight / 2) + (cardRect.height / 2);

    const startTime = performance.now();
    const duration = 900; // 900ms — increase for slower, decrease for faster

    function step(now) {
        const time = Math.min(1, (now - startTime) / duration);
        // Cubic ease-in-out curve for a very soft start and gentle finish
        const ease = time < 0.5 ? 4 * time * time * time : 1 - Math.pow(-2 * time + 2, 3) / 2;

        container.scrollLeft = startX + (targetX - startX) * ease;
        window.scrollTo(0, startY + (targetY - startY) * ease);

        if (time < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}


function jumpToMatch(booking) {
    const target = parseDateKey(booking.date);
    const diffDays = Math.round((target - startOfToday()) / 86400000);
    weekOffset = Math.floor(diffDays / 7) * 7;
    setDaysOffset(weekOffset);
    render();
    const day = days.find(d => dateKey(d) === booking.date);
    if (day) openBookingModal(booking, day, booking.time);
    setSearchResultsOpen(false);



    setTimeout(() => {
        const card = document.querySelector(`.cal-booking-grid[data-ref="${booking.ref}"]`);
        if (card) {
            slowScrollToCenter(card);
        }
    }, 300);
}

function renderSearchResults() {
    const box = $("search-results");
    if (!searchQuery) { box.hidden = true; box.replaceChildren(); return; }

    const matches = bookingsFor(brand)
        .filter(bookingMatchesSearch)
        .sort((a, b) => a.date === b.date ? a.time - b.time : a.date.localeCompare(b.date));

    if (!matches.length) {
        box.replaceChildren(Object.assign(document.createElement("p"), {
            className: "search-results-empty", textContent: `No bookings match "${searchQuery}".`
        }));
    } else {
        box.replaceChildren(...matches.map(b => {
            const day = parseDateKey(b.date);
            const inView = days.some(d => dateKey(d) === b.date);
            const row = document.createElement("button");
            row.type = "button";
            row.className = "search-result-row";
            row.innerHTML = `
                <span class="search-result-when">${formatDay(day)}, ${formatTime(b.time)}</span>
                <span class="search-result-who">${b.name} — ${b.service}</span>
                ${inView ? '<span class="search-result-tag">this week</span>' : ""}
            `;
            row.onclick = () => jumpToMatch(b);
            return row;
        }));
    }
    box.hidden = false;
}

// ---------- Sidebar navigation ----------
function setView(next) {
    view = next;
    document.querySelectorAll(".nav-btn").forEach(b => b.setAttribute("aria-pressed", b.dataset.view === view));
    $("view-calendar").hidden = view !== "calendar";
    $("view-analytics").hidden = view !== "analytics";
    $("view-editor").hidden = view !== "editor";
    $("view-employees").hidden = view !== "employees";
    closeHoursPopover();
    // The chart measures its own pixel width to draw crisply (see
    // renderTimeChart), which is 0 while this tab is hidden — so any
    // render that happened while switched away gets thrown out here.
    if (view === "analytics") renderAnalytics();
}
document.querySelectorAll(".nav-btn").forEach(b => b.onclick = () => setView(b.dataset.view));

function setBrand(key) {
    brand = key;
    saveBrand(key);
    // The quick color editor (if open) refers to the previous brand's service
    // list by index. Close it so a stale save can't apply colors to the wrong
    // brand's services.
    $("quick-color-menu").hidden = true;
    closeHoursPopover();
    render();
}

function render() {
    document.documentElement.dataset.brand = brand;
    setSlotsForBusiness(getBusiness(brand)); // this business's hours decide which half-hours the calendars show
    renderBrandSwitch(brand, setBrand);
    $("nav-biz-name").textContent = getBusiness(brand).name;
    renderCalendar();
    renderAnalytics();
    renderEditor();
    renderEmployees();
}


// ---------- Calendar week navigation ----------
// `days` (shared.js) is an 8-day rolling window starting `weekOffset` days
// from today. Previous/Next shift that window a week at a time so past and
// future weeks are reachable instead of being stuck on the current one;
// "Back to this week" only appears once you've navigated away, and jumps
// straight back to today's window (offset 0).
let weekOffset = 0;

function shiftWeek(deltaWeeks) {
    weekOffset += deltaWeeks * 7;
    setDaysOffset(weekOffset);
    render();
}

function resetWeek() {
    weekOffset = 0;
    setDaysOffset(0);
    render();
}

function renderWeekNav() {
    const first = days[0], last = days[days.length - 1];
    const fmt = d => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    $("week-range").textContent = weekOffset === 0
        ? `${fmt(first)} – ${fmt(last)} (this week)`
        : `${fmt(first)} – ${fmt(last)}`;
    $("week-today").hidden = weekOffset === 0;
}



$("week-today").onclick = resetWeek;

$("week-range-btn").onclick = () => {
    const picker = $("week-date-picker");
    // Pre-fill the picker with the current week's starting day so it opens to the right month
    picker.value = dateKey(days[0]);
    picker.showPicker(); // Opens the native browser calendar popup
};

$("week-date-picker").addEventListener("change", (e) => {
    if (!e.target.value) return;

    const targetDate = parseDateKey(e.target.value);
    const diffDays = Math.round((targetDate - startOfToday()) / 86400000);

    // Snap to the nearest multiple of 7 to keep the rolling 8-day window aligned correctly
    weekOffset = Math.floor(diffDays / 7) * 7;
    setDaysOffset(weekOffset);
    render();
});

// ---------- Calendar: every booking laid out by day ----------
function renderCalendar() {
    const mine = bookingsFor(brand);
    $("empty").hidden = mine.length > 0;

    renderWeekNav();

    $("quick-color-menu").hidden = true;

    const biz = getBusiness(brand);
    const colorMap = {}; // Will hold the colors we map to the grid blocks
    const mode = $("color-mode") ? $("color-mode").value : "job";

    if (mode === "job") {
        // Mode: Colour by Job
        const legendItems = biz.services.map((s, i) => {
            const color = colorForService(s, i);
            colorMap[s.name] = color;
            const item = document.createElement("span");
            item.className = "legend-item";
            item.innerHTML = `<span class="legend-dot" style="background:${color}"></span>${s.name}`;
            return item;
        });

        const editBtn = document.createElement("button");
        editBtn.className = "btn edit-color-btn";
        editBtn.textContent = "Edit colours";
        editBtn.onclick = openQuickColorEditor;

        $("calendar-legend").replaceChildren(...legendItems, editBtn);
    } else {
        const emps = biz.employees || [];

        const legendItems = emps.map((e, i) => {
            const color = colorForEmployee(e, i);
            colorMap[e.name] = color;
            const item = document.createElement("span");
            item.className = "legend-item";
            item.innerHTML = `<span class="legend-dot" style="background:${color}"></span>${e.name}`;
            return item;
        });

        colorMap["(not set)"] = "#999999";
        const notSetItem = document.createElement("span");
        notSetItem.className = "legend-item";
        notSetItem.innerHTML = `<span class="legend-dot" style="background:#999999"></span>(not set)`;
        legendItems.push(notSetItem);

        const editBtn = document.createElement("button");
        editBtn.className = "btn edit-color-btn";
        editBtn.textContent = "Edit colours";
        editBtn.onclick = openQuickColorEditor;

        $("calendar-legend").replaceChildren(...legendItems, editBtn);
    }

    const grid = $("calendar-grid");
    grid.innerHTML = ""; // Clear grid

    // 1. Top-Left Blank Corner
    const corner = document.createElement("div");
    corner.className = "cal-header";
    corner.style.gridColumn = 1;
    grid.appendChild(corner);

    // 2. Day Headers (Columns 2 through 9)
    days.forEach((d, i) => {
        const head = document.createElement("div");
        head.className = "cal-header" + (isPastDay(d) ? " cal-header-past" : "") + (isToday(d) ? " cal-header-today" : "");
        head.style.gridColumn = i + 2;
        head.style.gridRow = 1;
        head.innerHTML = `
            <div class="cal-day-name">${d.toLocaleDateString("en-GB", { weekday: "short" })}</div>
            <div class="cal-day-num">${d.toLocaleDateString("en-GB", { day: "numeric" })}</div>
        `;
        grid.appendChild(head);
    });

    // 3. Time Labels & Empty Background Grid Cells
    // Measure the header row's real rendered height and expose it as a CSS
    // variable, so the week-arrow buttons (in calendar-nav-wrap) can center
    // themselves on that row exactly, however tall it ends up being,
    // instead of guessing a fixed pixel offset.
    const navWrap = grid.closest(".calendar-nav-wrap");
    if (navWrap) navWrap.style.setProperty("--cal-header-height", corner.offsetHeight + "px");

    slots.forEach((m, rowIndex) => {
        const row = rowIndex + 2; // Offset by 1 for the header
        // On the hour: solid line + a label. On the half-hour: dotted line,
        // no label — keeps the column readable without a number every 30
        // minutes.
        const onHour = m % 60 === 0;
        const lineClass = onHour ? "cal-line-hour" : "cal-line-half";

        const label = document.createElement("div");
        label.className = `cal-time ${lineClass}`;
        label.style.gridRow = row;
        label.style.gridColumn = 1;
        if (onHour) label.textContent = formatTime(m);
        else label.setAttribute("aria-label", formatTime(m)); // still announced, just not printed
        grid.appendChild(label);

        days.forEach((d, colIndex) => {
            const cell = document.createElement("div");
            cell.style.gridColumn = colIndex + 2;
            cell.style.gridRow = row;

            // Shade cells outside the business's own opening hours (whole
            // days off and the hours either side of a working day), darken
            // + lock past days, or make the cell clickable.
            if (!businessOpenAt(biz, d.getDay(), m)) {
                cell.className = "cal-closed-cell";
            } else if (isPastDay(d)) {
                cell.className = "cal-closed-cell cal-past-cell";
                cell.title = "Past dates are read-only";
            } else {
                cell.className = "cal-empty-cell";
                cell.onclick = () => openBookingModal(null, d, m); // Click empty slot to add
            }
            cell.classList.add(lineClass);
            grid.appendChild(cell);
        });
    });

    // 4. Place Bookings on the Grid — grouped per day, then laid out with
    //    layoutOverlaps() so bookings that overlap in time (including ones
    //    that start at exactly the same slot) split the day's column
    //    horizontally instead of stacking directly on top of one another
    //    and hiding each other.
    const byDay = {};
    mine.forEach(x => {
        const dayIndex = days.findIndex(d => dateKey(d) === x.date);
        const slotIndex = slots.indexOf(x.time);
        if (dayIndex === -1 || slotIndex === -1) return;
        (byDay[dayIndex] ||= []).push({ booking: x, start: slotIndex, span: Math.ceil(x.mins / 30) });
    });

    Object.entries(byDay).forEach(([dayIndexStr, dayBookings]) => {
        const dayIndex = Number(dayIndexStr);

        // One positioned "track" per day, spanning every slot row, so
        // bookings can be placed by percentage within it instead of each
        // getting the whole grid cell to itself.
        const track = document.createElement("div");
        track.className = "cal-day-track";
        track.style.gridColumn = dayIndex + 2;
        // Row 2 is the first slot row; there are slots.length of them, so
        // the last line is 2 + slots.length. Using -1 here would NOT work:
        // these rows are implicit (grid-auto-rows), and negative line
        // indices only count back from the end of the *explicit* grid
        // (just row 1, the header), so -1 would resolve to line 2 and
        // collapse the track to zero height.
        track.style.gridRow = `2 / ${2 + slots.length}`;
        grid.appendChild(track);

        layoutOverlaps(dayBookings).forEach(({ booking: x, start, span, col, cols }) => {
            let bgColor = "#eee";
            if (mode === "job") {
                bgColor = colorMap[x.service] || "#eee";
            } else {
                // A job can have more than one employee assigned. Rather
                // than only ever showing the first person's colour, split
                // the block into equal stripes — one per assigned employee
                // — so every colour on a multi-staff job is visible. A
                // single-staff (or unassigned) job still shows as one
                // solid colour.
                const names = bookingStaff(x).length ? bookingStaff(x) : ["(not set)"];
                const staffColors = names.map(n => colorMap[n] || colorMap["(not set)"]);
                bgColor = staffColors.length === 1
                    ? staffColors[0]
                    : `linear-gradient(90deg, ${staffColors.map((c, i) =>
                        `${c} ${(i / staffColors.length) * 100}%, ${c} ${((i + 1) / staffColors.length) * 100}%`
                    ).join(", ")})`;
            }
            const textColor = readableTextColor(mode === "job" ? bgColor : (bookingStaff(x).length ? bookingStaff(x).map(n => colorMap[n] || colorMap["(not set)"]) : [colorMap["(not set)"]]));

            const isPast = isPastDay(days[dayIndex]);
            const matched = bookingMatchesSearch(x);
            const card = document.createElement("div");
            card.dataset.ref = x.ref;

            card.className = ["cal-booking-grid",
                isPast ? "cal-booking-past" : "",
                searchQuery && !matched ? "cal-booking-dim" : "",
                searchQuery && matched ? "cal-booking-match" : ""
            ].filter(Boolean).join(" ");
            card.style.top = `calc(${(start / slots.length) * 100}% + 3px)`;
            card.style.height = `calc(${(span / slots.length) * 100}% - 6px)`;
            card.style.left = `calc(${(col / cols) * 100}% + 3px)`;
            card.style.width = `calc(${(1 / cols) * 100}% - 6px)`;
            card.style.background = bgColor; // Use the dynamic background color
            card.style.color = textColor;

            const staffNames = bookingStaff(x);
            card.innerHTML = `
                <div class="header-row">
                    <span class="cb-name">${x.name}</span>
                </div>
            `;
            card.style.cursor = "pointer";
            card.onclick = () => openBookingModal(x, days[dayIndex], x.time);
            track.appendChild(card);
        });
    });

    if (searchQuery) {
        const total = mine.length;
        const matches = mine.filter(bookingMatchesSearch).length;
        $("search-match-count").textContent = `${matches} of ${total} booking${total === 1 ? "" : "s"} match "${searchQuery}" across all weeks`;
    } else {
        $("search-match-count").textContent = "";
    }
    renderSearchResults();
}

// ---------- Overlap layout ----------
// Given one day's bookings as {booking, start, span} (start/span in
// half-hour slot units), groups the ones that overlap in time into
// clusters, then greedily assigns each booking a column within its
// cluster (and records the cluster's total column count) so overlapping
// bookings — including ones that start at exactly the same slot — end up
// side by side at an equal share of the day's width instead of on top of
// each other.
function layoutOverlaps(items) {
    const sorted = [...items].sort((a, b) => a.start - b.start || (a.start + a.span) - (b.start + b.span));

    const clusters = [];
    let current = [], clusterEnd = -Infinity;
    for (const item of sorted) {
        if (current.length && item.start >= clusterEnd) {
            clusters.push(current);
            current = [];
            clusterEnd = -Infinity;
        }
        current.push(item);
        clusterEnd = Math.max(clusterEnd, item.start + item.span);
    }
    if (current.length) clusters.push(current);

    const out = [];
    clusters.forEach(cluster => {
        const columnEnds = []; // the slot each column is occupied until, so far
        cluster.forEach(item => {
            let col = columnEnds.findIndex(end => end <= item.start);
            if (col === -1) { col = columnEnds.length; columnEnds.push(0); }
            columnEnds[col] = item.start + item.span;
            item.col = col;
        });
        const cols = columnEnds.length;
        cluster.forEach(item => out.push({ ...item, cols }));
    });
    return out;
}


// ---------- Quick Color Editor ----------
function openQuickColorEditor() {
    const biz = getBusiness(brand);
    const mode = $("color-mode") ? $("color-mode").value : "job";
    const menu = $("quick-color-menu");

    // Update title based on context
    const title = menu.querySelector("h3");
    if (title) title.textContent = mode === "job" ? "Edit service colours" : "Edit employee colours";

    let list = [];
    if (mode === "job") {
        list = biz.services.map((s, i) => ({ name: s.name, color: colorForService(s, i), index: i }));
    } else {
        list = (biz.employees || []).map((e, i) => ({ name: e.name, color: colorForEmployee(e, i), index: i }));
    }

    $("quick-color-list").replaceChildren(...list.map(item => {
        const row = document.createElement("div");
        row.className = "quick-color-row";

        const label = document.createElement("span");
        label.textContent = item.name;

        const input = document.createElement("input");
        input.type = "color";
        input.dataset.index = item.index;
        input.value = item.color;

        row.append(label, input);
        return row;
    }));

    // Anchor the popover under the button that opened it
    const btn = document.querySelector(".edit-color-btn");
    const anchor = $("view-calendar");
    if (btn && anchor) {
        const btnRect = btn.getBoundingClientRect();
        const anchorRect = anchor.getBoundingClientRect();
        menu.style.top = `${btnRect.bottom - anchorRect.top + 8}px`;
        menu.style.left = `${btnRect.left - anchorRect.left}px`;
    }
    menu.hidden = false;
}

$("save-quick-colors").onclick = () => {
    const biz = getBusiness(brand);
    const inputs = document.querySelectorAll("#quick-color-list input[type='color']");
    const mode = $("color-mode") ? $("color-mode").value : "job";

    if (mode === "job") {
        const services = biz.services.map(s => ({ ...s }));
        inputs.forEach(input => {
            const idx = input.dataset.index;
            services[idx].color = input.value;
        });
        saveBusiness(brand, { ...biz, services });
    } else {
        const employees = (biz.employees || []).map(e => ({ ...e }));
        inputs.forEach(input => {
            const idx = input.dataset.index;
            employees[idx].color = input.value;
        });
        saveBusiness(brand, { ...biz, employees });
    }

    $("quick-color-menu").hidden = true;
    render(); // Updates the calendar instantly
};

$("save-quick-colors").onclick = () => {
    const biz = getBusiness(brand);
    const inputs = document.querySelectorAll("#quick-color-list input[type='color']");

    // Clone the services array (and each service object) before editing it.
    // getBusiness() can hand back the same array/objects that live inside the
    // shared BUSINESSES constant (when no override has been saved yet), so
    // writing into it directly would permanently corrupt the "default" data
    // and break "Reset to default".
    const services = biz.services.map(s => ({ ...s }));
    inputs.forEach(input => {
        const idx = input.dataset.index;
        services[idx].color = input.value;
    });

    saveBusiness(brand, { ...biz, services });
    $("quick-color-menu").hidden = true;
    render(); // Updates the calendar instantly
};



// ---------- Booking Modal Logic ----------

let editArmed = false;

// ---------- Locked-field view/edit toggle ----------
// While locked, the four customer-submitted fields are shown as plain text
// (renderBmLockedView) instead of input boxes; "Unlock to edit" swaps in
// the real, list-order form fields (.bm-edit-fields, already in the DOM).
function renderBmLockedView() {
    const name = $("bm-name").value.trim();
    const serviceOpt = $("bm-service").selectedOptions[0];
    const serviceName = serviceOpt ? serviceOpt.textContent : $("bm-service").value;
    const email = $("bm-email").value.trim();
    const phone = $("bm-phone").value.trim();

    $("bm-view-name").textContent = name || "(No name given)";
    $("bm-view-service").textContent = serviceName || "";
    $("bm-view-contact").textContent = [email, phone].filter(Boolean).join("  ·  ") || "No contact details given";
}

function setBmLocked(locked) {
    if (locked) renderBmLockedView(); // read current values before hiding the real inputs
    $("bm-view").hidden = !locked;
    $("bm-edit-fields").hidden = locked;
    $("bm-unlock").hidden = !locked;
}

// Keeps the hidden bm-customer-note (read on submit) and the visible
// read-only paragraph box in sync, so callers don't have to update both.
function setCustomerNote(text) {
    $("bm-customer-note").value = text || "";
    $("bm-customer-note-text").textContent = text || "";
}

// Read-only display of a booking's answers to the business's own custom
// questions (see "Additional fields" in the Booking page editor). Blank
// answers are left out rather than shown as empty.
function renderBmCustom(custom) {
    const items = (custom || []).filter(c => c.value);
    $("bm-custom-list").replaceChildren(...items.map(c => {
        const p = document.createElement("p");
        p.style.margin = "0 0 6px";
        const strong = document.createElement("strong");
        strong.textContent = `${c.label}: `;
        p.append(strong, document.createTextNode(c.value));
        return p;
    }));
    $("bm-custom-group").hidden = items.length === 0;
}

$("bm-unlock").onclick = e => {
    if (!editArmed) {
        editArmed = true;
        e.target.textContent = "Click again to confirm";
        setTimeout(() => {
            if (editArmed) {
                editArmed = false;
                e.target.textContent = "Unlock to edit";
            }
        }, 3000);
        return;
    }
    editArmed = false;
    $("bm-name").disabled = false;
    $("bm-service").disabled = false;
    $("bm-email").disabled = false;
    $("bm-phone").disabled = false;
    setBmLocked(false);
    // Customer notes remain disabled as they are a historical record
};


let forceStaffListMode = false;
function openBookingModal(booking, day, time) {

    forceStaffListMode = false;
    // Past dates are historical record — nothing new gets added there.
    // (Calendar cells for past days don't wire up this call for empty
    // slots, but guard here too in case something else ever calls in.)
    if (!booking && isPastDay(day)) return;
    const isPast = isPastDay(day);

    const biz = getBusiness(brand);

    // Populate Service Dropdown
    const sSelect = $("bm-service");
    sSelect.innerHTML = "";
    biz.services.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.name;
        opt.textContent = s.name;
        opt.dataset.mins = s.mins;
        opt.dataset.price = s.price;
        sSelect.appendChild(opt);
    });

    $("bm-date").value = dateKey(day);
    $("bm-time").value = time;
    $("bm-datetime-display").textContent = `${formatDay(day)} at ${formatTime(time)}`;
    $("bm-past-notice").hidden = !isPast;

    if (booking) {
        $("bm-title").textContent = isPast ? "Booking Details" : "Edit Booking";
        $("bm-ref").value = booking.ref;
        $("bm-name").value = booking.name;
        $("bm-service").value = booking.service;

        $("bm-email").value = booking.email || "";
        $("bm-phone").value = booking.phone || "";
        $("bm-company-note").value = booking.companyNote || "";

        // Show customer notes only if they exist
        if (booking.note) {
            setCustomerNote(booking.note);
            $("bm-customer-note-group").hidden = false;
        } else {
            $("bm-customer-note-group").hidden = true;
        }
        renderBmCustom(booking.custom);

        $("bm-delete").hidden = isPast || false;

        // Lock core fields and show the formal read-only view
        $("bm-name").disabled = true;
        $("bm-service").disabled = true;
        $("bm-email").disabled = true;
        $("bm-phone").disabled = true;

        editArmed = false;
        $("bm-unlock").textContent = "Unlock to edit";
        setBmLocked(true);
        // Past bookings can't be unlocked at all, so hide the offer.
        $("bm-unlock").hidden = isPast;
    } else {
        $("bm-title").textContent = "New Booking";
        $("bm-ref").value = "";
        $("bm-name").value = "";
        $("bm-service").selectedIndex = 0;

        $("bm-email").value = "";
        $("bm-phone").value = "";
        setCustomerNote("");
        $("bm-company-note").value = "";
        $("bm-customer-note-group").hidden = true;
        renderBmCustom([]);

        $("bm-delete").hidden = true;

        // Leave fields unlocked for new bookings
        $("bm-name").disabled = false;
        $("bm-service").disabled = false;
        $("bm-email").disabled = false;
        $("bm-phone").disabled = false;
        setBmLocked(false);
    }

    renderBmStaffList(day, time, booking);

    // Nothing in a past booking's panel is editable: company notes, staff
    // assignment, and the Save button itself all go read-only/hidden.
    $("bm-company-note").disabled = isPast;
    $("bm-save").hidden = isPast;
    document.querySelectorAll("#bm-staff-list .bm-staff-check, #bm-staff-select").forEach(el => el.disabled = isPast);

    setPanelOpen(true);
}

// Checklist of employees for the slot's date/time and currently-selected
// service: who's already assigned (pre-checked), and — for everyone else —
// a badge saying whether they're actually free and skilled for the job, so
// admin can see at a glance who makes sense to add. Unlike the customer
// page (isServiceBookable), this never blocks a choice: admin can tick
// anyone, badge or not, as a manual override.
// A booking that already has a single employee assigned (booking.employee)
// gets a plain dropdown instead of the checkbox list below — quicker for
// swapping one person for another. A new/unassigned booking keeps the
// checkbox list, so admin can still build up a multi-person job from
// scratch.
function renderBmStaffList(day, time, booking) {
    const biz = getBusiness(brand);
    const serviceName = $("bm-service").value;
    const serviceIdx = biz.services.findIndex(s => s.name === serviceName);
    const service = biz.services[serviceIdx];
    const needed = (service && service.staff) || 1;
    $("bm-staff-need").textContent = service ? `— this job needs ${needed}` : "";

    const employees = biz.employees || [];

    // Check if it normally qualifies for a dropdown, and apply the user's toggle choice
    const canUseDropdown = !!(booking && needed === 1);
    const useDropdown = canUseDropdown && !forceStaffListMode;

    $("bm-staff-select").hidden = !useDropdown;
    $("bm-staff-list").hidden = useDropdown;
    $("bm-staff-clear").hidden = useDropdown; // Only show 'Clear' if the list is visible

    // Configure the toggle button
    const modeToggle = $("bm-staff-mode-toggle");
    modeToggle.hidden = !canUseDropdown;
    modeToggle.textContent = useDropdown ? "Switch to list" : "Switch to dropdown";
    modeToggle.onclick = () => {
        forceStaffListMode = !forceStaffListMode;
        renderBmStaffList(day, time, booking);
    };

    if ($("bm-staff-search")) $("bm-staff-search").value = "";
    bmStaffExpanded = false;
    $("bm-staff-list").style.maxHeight = "";

    if (!employees.length) {
        $("bm-staff-list").innerHTML = '<p class="muted">No employees set up yet — add some on the Employees tab.</p>';
        return;
    }

    const already = booking ? bookingStaff(booking) : [];
    const dayIndex = days.findIndex(d => dateKey(d) === dateKey(day));
    const avail = (serviceIdx > -1 && dayIndex > -1)
        ? availableEmployeesFor(brand, dayIndex, time, serviceIdx, booking ? booking.ref : undefined)
        : { working: [], free: [], skilled: [] };

    const tagFor = e => {
        const isAlready = already.includes(e.name);
        const isWorking = avail.working.some(w => w.name === e.name);
        const isFree = isAlready || avail.free.some(w => w.name === e.name);
        const isSkilled = employeeHasSkill(e, serviceName);
        if (!isWorking && !isAlready) return "not working";
        if (!isFree) return "busy elsewhere";
        if (!isSkilled) return "no skill";
        return "available";
    };

    if (useDropdown) {
        const clearOpt = document.createElement("option");
        clearOpt.value = "";
        clearOpt.textContent = "— Unassigned —";

        $("bm-staff-select").replaceChildren(clearOpt, ...employees.map(e => {
            const opt = document.createElement("option");
            opt.value = e.name;
            opt.textContent = `${e.name} — ${tagFor(e)}`;
            return opt;
        }));
        $("bm-staff-select").value = bookingStaff(booking)[0] || "";
    } else {
        $("bm-staff-list").replaceChildren(...employees.map(e => {
            const row = fromTemplate("tpl-staff-check");
            const check = row.querySelector(".bm-staff-check");
            check.value = e.name;
            check.checked = already.includes(e.name);
            check.onchange = () => renderStaffCount();
            row.querySelector(".bm-staff-name").textContent = e.name;

            const tag = row.querySelector(".bm-staff-tag");
            const status = tagFor(e);
            tag.textContent = status;
            tag.className = "bm-staff-tag " + (status === "not working" ? "off" : status === "busy elsewhere" ? "busy" : status === "no skill" ? "warn" : "ok");
            return row;
        }));
        renderStaffCount();
    }

    applyBmStaffFilter();

    function renderStaffCount() {
        const checked = document.querySelectorAll("#bm-staff-list .bm-staff-check:checked").length;
        $("bm-staff-need").textContent = service ? `— ${checked}/${needed} assigned` : "";
    }
}

// Re-check who's available whenever the service (and so the job length and
// required skill) changes, for a brand-new booking being drafted.
$("bm-service").addEventListener("change", () => {
    if (!$("bm-ref").value) renderBmStaffList(parseDateKey($("bm-date").value), parseInt($("bm-time").value, 10), null);
});

// ---------- Panel open/close + calendar aspect-ratio scaling ----------
// The panel used to be shown/hidden with the native `hidden` attribute,
// which maps to `display: none !important` (see styles.css) and completely
// skips the flex-basis/opacity transition already defined for
// #booking-modal in styles(admin).css. Toggling the `bm-collapsed` class
// instead lets that transition actually run.
function setPanelOpen(open) {
    $("booking-modal").classList.toggle("bm-collapsed", !open);
    updateCalendarScale();
}

// The calendar's columns get narrower whenever the side panel opens (it
// steals flex space from `.calendar`), but grid-auto-rows used to stay a
// fixed 44px, so cells got squished sideways instead of shrinking
// uniformly. This sets the real --cal-row-height custom property that
// grid-auto-rows reads (styles(admin).css) so the rows genuinely get
// shorter in proportion — as opposed to visually scaling the finished grid
// with a CSS transform, which stretched the text inside every cell instead
// of just shrinking the rows. Because --cal-row-height is registered with
// @property as a <length>, CSS can interpolate it smoothly on its own over
// the same 0.35s as the panel's flex-basis transition, so the two animate
// in sync without any per-frame JS.
function updateCalendarScale() {
    const layout = document.querySelector(".calendar-layout");
    const calendar = document.querySelector(".calendar");
    const modal = $("booking-modal");
    if (!layout || !calendar || !modal) return;

    const ROW_HEIGHT = 50; // px — the calendar's base row height, matching styles(admin).css

    const isOpen = !modal.classList.contains("bm-collapsed");
    // Below this width the layout stacks the panel under the calendar
    // instead of beside it (see the 850px breakpoint in styles(admin).css),
    // so the calendar's width — and therefore its row height — isn't
    // affected by the panel there.
    const stacked = window.innerWidth <= 850;
    if (!isOpen || stacked) {
        calendar.style.setProperty("--cal-row-height", `${ROW_HEIGHT}px`);
        return;
    }

    // Panel width (350px) and the gap next to it (20px) are fixed in
    // styles(admin).css. Using those constants instead of measuring
    // mid-transition widths keeps the target ratio stable for the whole
    // animation rather than just at its start or end.
    const PANEL_WIDTH = 350, GAP = 20;
    const fullWidth = layout.getBoundingClientRect().width; // constant whether the panel is open or not
    const narrowWidth = Math.max(fullWidth - PANEL_WIDTH - GAP, 0);
    const ratio = fullWidth > 0 ? narrowWidth / fullWidth : 1;
    calendar.style.setProperty("--cal-row-height", `${ROW_HEIGHT * ratio}px`);
}

window.addEventListener("resize", updateCalendarScale);

// Closes the booking panel on an outside click or Escape — there's no
// explicit Cancel button any more, so this is the only way to dismiss it
// without saving or deleting. Never closes on a click that itself opens a
// (possibly different) booking, since those elements' own onclick already
// ran and reopened the panel by the time this listener sees the bubbled
// click.
document.addEventListener("click", e => {
    const modal = $("booking-modal");
    if (modal.classList.contains("bm-collapsed")) return;
    if (modal.contains(e.target) || e.target.closest(".cal-empty-cell, .cal-closed-cell, .cal-booking-grid")) return;
    setPanelOpen(false);
});
document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !$("booking-modal").classList.contains("bm-collapsed")) setPanelOpen(false);
});

$("bm-delete").onclick = () => {
    const ref = $("bm-ref").value;
    const date = $("bm-date").value;
    if (date && isPastDay(parseDateKey(date))) return; // read-only, shouldn't be reachable via UI
    if (ref) {
        if (!confirm("Are you sure you want to delete this booking?")) return;
        removeBooking(ref);
        render();
    }
    setPanelOpen(false);
};

$("bm-form").onsubmit = (e) => {
    e.preventDefault();
    const date = $("bm-date").value;
    if (date && isPastDay(parseDateKey(date))) return; // read-only, shouldn't be reachable via UI
    const ref = $("bm-ref").value;
    const name = $("bm-name").value.trim();
    const serviceName = $("bm-service").value;
    const employeeNames = $("bm-staff-select").hidden
        ? [...document.querySelectorAll("#bm-staff-list .bm-staff-check:checked")].map(c => c.value)
        : ($("bm-staff-select").value ? [$("bm-staff-select").value] : []);
    const email = $("bm-email").value.trim();
    const phone = $("bm-phone").value.trim();
    const note = $("bm-customer-note").value.trim(); // Readonly, but pass it back to keep it
    const companyNote = $("bm-company-note").value.trim();
    const time = parseInt($("bm-time").value, 10);

    const selectedServiceOpt = $("bm-service").selectedOptions[0];
    const mins = parseInt(selectedServiceOpt.dataset.mins, 10);
    const price = parseInt(selectedServiceOpt.dataset.price, 10);

    // If editing, remove the old one first
    if (ref) removeBooking(ref);

    addBooking({
        ref: ref || makeRef(),
        brand, service: serviceName, price, mins,
        date, time, name, employees: employeeNames, employee: employeeNames[0] || "",
        email, phone, note, companyNote,
        created: ref ? bookingsFor(brand).find(b => b.ref === ref)?.created || Date.now() : Date.now()
    });
    setPanelOpen(false);
    render();
};

function addSamples() {
    const biz = getBusiness(brand);
    const services = biz.services;
    let added = 0, tries = 0;

    while (added < SAMPLE_NAMES.length && tries++ < 300) {
        const di = Math.floor(Math.random() * days.length);
        const m = slots[Math.floor(Math.random() * slots.length)];

        // Skip hours the business is closed, or slots that are already booked
        if (!businessOpenAt(biz, days[di].getDay(), m) || isBooked(brand, di, m)) continue;

        // Cycle through services evenly to ensure all legend colors are displayed
        const serviceIndex = added % services.length;
        const s = services[serviceIndex];
        const name = SAMPLE_NAMES[added++];

        // Staff sample bookings the same way a real customer booking gets
        // staffed — same load-balanced pick as autoAssignStaffFor — so
        // "Add sample bookings" leaves a realistic, already-assigned
        // calendar instead of a pile of unassigned jobs waiting on a
        // separate "Auto-assign staff" click.
        const employees = biz.employees && biz.employees.length ? autoAssignStaffFor(brand, di, m, serviceIndex) : [];

        addBooking({
            ref: makeRef(), brand, service: s.name, price: s.price, mins: s.mins,
            date: dateKey(days[di]), time: m, name, employees, employee: employees[0] || "",
            email: `${name.split(" ")[0].toLowerCase()}@example.com`, phone: "", note: "", created: Date.now()
        });
    }
    render();
}

function exportCsv() {
    const customFields = getBusiness(brand).customFields || [];
    const cols = ["ref", "date", "time", "name", "email", "phone", "service", "price", "note"];
    const headers = [...cols, ...customFields.map(f => f.label || "Custom field")];
    const quote = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = bookingsFor(brand).map(x => {
        const base = cols.map(c => quote(c === "time" ? formatTime(x.time) : x[c]));
        const custom = customFields.map(f => quote((x.custom || []).find(c => c.id === f.id)?.value || ""));
        return [...base, ...custom].join(",");
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv" }));
    link.download = `${brand}-bookings.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

let clearArmed = false; // the first click arms it, the second deletes
$("clear").onclick = e => {
    if (!clearArmed) {
        clearArmed = true;
        e.target.textContent = "Click again to confirm";
        setTimeout(() => { clearArmed = false; e.target.textContent = "Clear bookings"; }, 3000);
        return;
    }
    clearArmed = false;
    e.target.textContent = "Clear bookings";
    clearBookings(brand);
    render();
};
$("add-samples").onclick = addSamples;
$("export-csv").onclick = exportCsv;

// ---------- Analytics ----------
// The visible range is entirely in the admin's hands via the From/To date
// inputs, rather than a fixed list of presets — pick any window, past or
// upcoming. Both the range and the chart type are page-level UI state, not
// per-business data, so they live here rather than in a business record —
// they carry over as you switch brands, same as `view` above.
let analyticsStart = null; // Date, midnight-aligned; null until initAnalyticsRange runs once
let analyticsEnd = null;   // Date, midnight-aligned
let chartType = "line";    // "line" or "bar"

// Every count/date helper below works in whole calendar days, so callers
// always pass midnight-aligned Date objects.
const oneDay = 24 * 60 * 60 * 1000;

// Defaults the range to today through 6 days ahead — this week, looking
// forward — the first time the Analytics tab is opened. After that,
// whatever the admin has picked in the date inputs sticks, including
// across brand switches.
function initAnalyticsRange() {
    if (analyticsStart && analyticsEnd) return;
    analyticsStart = startOfToday();
    analyticsEnd = new Date(analyticsStart);
    analyticsEnd.setDate(analyticsEnd.getDate() + 6);
}

// A short range is plotted day by day; a longer one is grouped into weeks
// or months instead, so the chart never has to squeeze hundreds of points
// onto one axis.
const granularityFor = spanDays => spanDays <= 31 ? "day" : spanDays <= 180 ? "week" : "month";

function bucketKeyFor(date, granularity) {
    if (granularity === "month") return `${date.getFullYear()}-${date.getMonth()}`;
    const d = new Date(date);
    if (granularity === "week") d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to that week's Monday
    return dateKey(d);
}

// One entry per bucket from `start` to `end` inclusive, in order, each
// with the key bucketKeyFor would give any date that falls inside it.
function generateBuckets(start, end, granularity) {
    const list = [];
    let d = new Date(start);
    if (granularity === "week") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    if (granularity === "month") d = new Date(d.getFullYear(), d.getMonth(), 1);
    while (d <= end) {
        list.push({
            key: bucketKeyFor(d, granularity),
            label: granularity === "month"
                ? d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" })
                : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
        });
        if (granularity === "month") d.setMonth(d.getMonth() + 1);
        else d.setDate(d.getDate() + (granularity === "week" ? 7 : 1));
    }
    return list;
}

function renderAnalytics() {
    initAnalyticsRange();
    // Keep the inputs showing whatever range is active, including the
    // very first render's default, without fighting an admin who's
    // mid-edit on one of them.
    if (document.activeElement !== $("range-start")) $("range-start").value = dateKey(analyticsStart);
    if (document.activeElement !== $("range-end")) $("range-end").value = dateKey(analyticsEnd);

    const all = bookingsFor(brand);
    const start = analyticsStart, end = analyticsEnd;
    const mine = all.filter(x => { const d = parseDateKey(x.date); return d >= start && d <= end; });
    const spanDays = Math.round((end - start) / oneDay) + 1;

    const counts = {}, revenue = {};
    mine.forEach(x => { counts[x.service] = (counts[x.service] || 0) + 1; revenue[x.service] = (revenue[x.service] || 0) + x.price; });
    const top = Object.entries(counts).sort((a, c) => c[1] - a[1])[0];
    const totalRevenue = mine.reduce((t, x) => t + x.price, 0);

    $("stat-count").textContent = mine.length;
    $("stat-revenue").textContent = `£${totalRevenue}`;
    $("stat-avg").textContent = (mine.length / spanDays).toFixed(1);
    $("stat-avg-revenue").textContent = `£${(totalRevenue / spanDays).toFixed(2)}`;
    $("stat-top").textContent = top ? top[0] : "-";

    const granularity = granularityFor(spanDays);
    const buckets = generateBuckets(start, end, granularity);
    const bucketCounts = new Map();
    mine.forEach(x => {
        const key = bucketKeyFor(parseDateKey(x.date), granularity);
        bucketCounts.set(key, (bucketCounts.get(key) || 0) + 1);
    });
    renderTimeChart(buckets.map(b => ({ ...b, count: bucketCounts.get(b.key) || 0 })));

    const services = Object.entries(counts)
        .map(([name, count]) => ({ name, count, revenue: revenue[name] || 0 }))
        .sort((a, c) => c.count - a.count);
    renderServiceBreakdown(services);

    // Which time-of-day slots bring in the most money, so a business can
    // see where its money-makers actually fall on the clock rather than
    // just which service they were for.
    const hourStats = {};
    mine.forEach(x => {
        const label = formatTime(x.time);
        if (!hourStats[label]) hourStats[label] = { count: 0, revenue: 0, time: x.time };
        hourStats[label].count++;
        hourStats[label].revenue += x.price;
    });
    const hours = Object.values(hourStats)
        .map(h => ({ name: formatTime(h.time), count: h.count, revenue: h.revenue }))
        .sort((a, c) => c.revenue - a.revenue)
        .slice(0, 8);
    renderBreakdownRows("hour-breakdown", hours);

    // Booking volume by day of week, in calendar order (Sun–Sat, matching
    // DAY_KEYS/getDay() everywhere else) rather than sorted, so the shape
    // of the week reads left to right.
    let weekdayStats = [];
    if (mine.length) {
        weekdayStats = DAY_KEYS.map(k => ({ name: DAY_LABELS[k], count: 0, revenue: 0 }));
        mine.forEach(x => {
            const idx = parseDateKey(x.date).getDay();
            weekdayStats[idx].count++;
            weekdayStats[idx].revenue += x.price;
        });
    }
    renderBreakdownRows("weekday-breakdown", weekdayStats);

    // Which employees have done the most jobs and brought in the most
    // money. A booking with several staff on it counts as a job (and its
    // full price) for each of them, same as a shift log would credit
    // everyone who worked it, not just whoever's listed first.
    const empStats = {};
    mine.forEach(x => bookingStaff(x).forEach(name => {
        if (!empStats[name]) empStats[name] = { name, count: 0, revenue: 0 };
        empStats[name].count++;
        empStats[name].revenue += x.price;
    }));
    const employeeRows = Object.values(empStats).sort((a, c) => c.revenue - a.revenue);
    const bizForEmp = getBusiness(brand);
    renderBreakdownRows("employee-breakdown", employeeRows, null,
        (bizForEmp.employees || []).length ? "No staffed bookings in this range." : "No employees set up yet — add some on the Employees tab.");
}

// Bookings over time: a hand-drawn SVG rather than a charting library, so
// it stays dependency-free like the rest of this dashboard. The viewBox is
// sized to the wrapper's actual pixel width (measured fresh each render)
// instead of a fixed box scaled with preserveAspectRatio, so lines, dots
// and bars stay crisp and circular instead of stretching with the box.
function renderTimeChart(series) {
    const wrap = $("time-chart");
    const W = Math.max(280, wrap.clientWidth || wrap.getBoundingClientRect().width || 760);
    const H = 300;
    const padL = 38, padR = 14, padT = 16, padB = 28;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const n = series.length;
    const stepX = n > 1 ? plotW / (n - 1) : 0;
    const slotW = plotW / Math.max(1, n);

    const max = Math.max(1, ...series.map(s => s.count));
    const ySteps = 4;
    const niceMax = Math.max(ySteps, Math.ceil(max / ySteps) * ySteps);

    let svg = "";
    for (let i = 0; i <= ySteps; i++) {
        const v = Math.round((niceMax / ySteps) * i);
        const y = padT + plotH - (v / niceMax) * plotH;
        svg += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" class="chart-grid-line" />`;
        svg += `<text x="${padL - 8}" y="${(y + 4).toFixed(1)}" class="chart-axis-label" text-anchor="end">${v}</text>`;
    }

    // Line charts plot points at evenly spaced positions spanning the full
    // plot width edge-to-edge (first point flush left, last flush right).
    // Bars need their own equal-width slot instead — centering a bar on a
    // line-point position pushed it off-center and let the first/last bars
    // hang past the plot edges. Axis labels use the same xOf as whichever
    // chart type is showing, so they stay lined up with it either way.
    const xOf = chartType === "bar"
        ? i => padL + i * slotW + slotW / 2
        : i => padL + (n > 1 ? i * stepX : plotW / 2);
    const labelEvery = Math.max(1, Math.ceil(n / 8));
    series.forEach((s, i) => {
        if (i % labelEvery !== 0 && i !== n - 1) return;
        svg += `<text x="${xOf(i).toFixed(1)}" y="${H - 8}" class="chart-axis-label" text-anchor="middle">${s.label}</text>`;
    });

    if (chartType === "bar") {
        const barW = Math.max(4, slotW * 0.55);
        series.forEach((s, i) => {
            const barH = (s.count / niceMax) * plotH;
            const x = xOf(i) - barW / 2;
            const y = padT + plotH - barH;
            svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1, barH).toFixed(1)}" rx="4" class="chart-bar"><title>${s.label}: ${s.count}</title></rect>`;
        });
    } else {
        const points = series.map((s, i) => [xOf(i), padT + plotH - (s.count / niceMax) * plotH]);
        const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
        const areaPath = points.length
            ? `${linePath} L${points[points.length - 1][0].toFixed(1)},${(padT + plotH).toFixed(1)} L${points[0][0].toFixed(1)},${(padT + plotH).toFixed(1)} Z`
            : "";
        svg += `<path d="${areaPath}" class="chart-area" />`;
        svg += `<path d="${linePath}" class="chart-line" />`;
        points.forEach((p, i) => {
            svg += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" class="chart-dot"><title>${series[i].label}: ${series[i].count}</title></circle>`;
        });
    }

    wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="Bookings over time">${svg}</svg>`;
}

// Shared row renderer for any name/count/revenue breakdown: services,
// times of day, or days of week. `colorFor`, when given, colors each bar
// (services use their own set colour); everything else gets the brand
// colour, which reads fine as a single-hue list.
function renderBreakdownRows(containerId, items, colorFor, emptyText) {
    const maxCount = Math.max(1, ...items.map(s => s.count));
    $(containerId).replaceChildren(...(items.length ? items.map(s => {
        const row = document.createElement("div");
        row.className = "sb-row";
        row.innerHTML = `
            <span class="sb-name">${s.name}</span>
            <div class="sb-bar-track"><div class="sb-bar-fill" style="width:${(s.count / maxCount) * 100}%; background:${colorFor ? colorFor(s.name) : "var(--brand)"}"></div></div>
            <span class="sb-count">${s.count}</span>
            <span class="sb-revenue">£${s.revenue}</span>
        `;
        return row;
    }) : [Object.assign(document.createElement("p"), { className: "muted", textContent: emptyText || "No bookings in this range." })]));
}

function renderServiceBreakdown(services) {
    const biz = getBusiness(brand);
    const colorFor = name => {
        const i = biz.services.findIndex(s => s.name === name);
        return i > -1 ? colorForService(biz.services[i], i) : "var(--brand)";
    };
    renderBreakdownRows("service-breakdown", services, colorFor);
}

$("range-start").onchange = e => {
    if (!e.target.value) return;
    analyticsStart = parseDateKey(e.target.value);
    if (analyticsEnd < analyticsStart) analyticsEnd = analyticsStart;
    renderAnalytics();
};
$("range-end").onchange = e => {
    if (!e.target.value) return;
    analyticsEnd = parseDateKey(e.target.value);
    if (analyticsStart > analyticsEnd) analyticsStart = analyticsEnd;
    renderAnalytics();
};

// Sets analyticsStart/End from a named quick-pick rather than the From/To
// inputs directly. "All time" spans every booking on the books for this
// brand — past and future — falling back to the default this-week-ahead
// window when there aren't any yet. "This/last week" run from today to the
// same weekday next week (or that weekday last week up to today) rather
// than a fixed Monday–Sunday block, so "this week" on a Wednesday means
// this Wednesday to next Wednesday.
function applyRangePreset(preset) {
    const today = startOfToday();
    let start, end;
    switch (preset) {
        case "all": {
            const mine = bookingsFor(brand);
            if (mine.length) {
                const dates = mine.map(b => parseDateKey(b.date));
                start = dates.reduce((min, d) => d < min ? d : min, dates[0]);
                end = dates.reduce((max, d) => d > max ? d : max, dates[0]);
                if (end < today) end = today;
            } else {
                start = today;
                end = new Date(today);
                end.setDate(end.getDate() + 6);
            }
            break;
        }
        case "thisWeek":
            start = today;
            end = new Date(today); end.setDate(end.getDate() + 7);
            break;
        case "lastWeek":
            start = new Date(today); start.setDate(start.getDate() - 7);
            end = today;
            break;
        case "thisMonth":
            start = new Date(today.getFullYear(), today.getMonth(), 1);
            end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            break;
        case "lastMonth":
            start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            end = new Date(today.getFullYear(), today.getMonth(), 0);
            break;
        case "thisYear":
            start = new Date(today.getFullYear(), 0, 1);
            end = new Date(today.getFullYear(), 11, 31);
            break;
        case "lastYear":
            start = new Date(today.getFullYear() - 1, 0, 1);
            end = new Date(today.getFullYear() - 1, 11, 31);
            break;
        default:
            return;
    }
    analyticsStart = start;
    analyticsEnd = end;
    renderAnalytics();
}

function setRangePresetOpen(open) {
    $("range-preset-menu").hidden = !open;
    $("range-preset-btn").setAttribute("aria-expanded", String(open));
}
$("range-preset-btn").onclick = () => setRangePresetOpen($("range-preset-menu").hidden);
document.querySelectorAll(".range-preset-option").forEach(btn => {
    btn.onclick = () => { applyRangePreset(btn.dataset.preset); setRangePresetOpen(false); };
});
document.addEventListener("click", e => {
    if (!$("range-preset-menu").hidden && !e.target.closest(".preset-wrap")) setRangePresetOpen(false);
});

document.querySelectorAll(".chart-type-btn[data-chart-type]").forEach(btn => {
    btn.onclick = () => {
        chartType = btn.dataset.chartType;
        document.querySelectorAll(".chart-type-btn[data-chart-type]").forEach(b => b.setAttribute("aria-pressed", b === btn));
        renderAnalytics();
    };
});

// "Top times by revenue" vs "Employees by revenue" toggle in the insights
// panel — swaps which breakdown list shows underneath, same style as the
// chart's line/bar toggle above.
document.querySelectorAll(".chart-type-btn[data-insights-tab]").forEach(btn => {
    btn.onclick = () => {
        const showEmployees = btn.dataset.insightsTab === "employees";
        document.querySelectorAll(".chart-type-btn[data-insights-tab]").forEach(b => b.setAttribute("aria-pressed", b === btn));
        $("insights-title").textContent = showEmployees ? "Employees by revenue" : "Top times by revenue";
        $("hour-breakdown").hidden = showEmployees;
        $("employee-breakdown").hidden = !showEmployees;
    };
});

// The chart measures its own pixel width to draw crisply (see
// renderTimeChart), so it needs a fresh render whenever that width can have
// changed — here, just the window resizing while the tab is visible.
window.addEventListener("resize", () => { if (view === "analytics") renderAnalytics(); });


// ---------- Booking page editor ----------
let draftServices = [];
let draftHours = {};
let draftCustomFields = [];

function hexToRgb(hex) {
    const rgb = parseInt(hex.replace("#", ""), 16);
    return [rgb >> 16, (rgb >> 8) & 255, rgb & 255];
}

function colorDistance(hex1, hex2) {
    const [r1, g1, b1] = hexToRgb(hex1);
    const [r2, g2, b2] = hexToRgb(hex2);
    return Math.sqrt((r2 - r1) ** 2 + (g2 - g1) ** 2 + (b2 - b1) ** 2);
}

function generateDistinctColor(existingColors) {
    let newColor, attempts = 0, isDistinct = false;
    while (!isDistinct && attempts < 50) {
        newColor = "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0");
        // Check if the new color is too close to any existing ones (threshold of 60)
        isDistinct = !existingColors.some(c =>
            c && /^#[0-9A-Fa-f]{6}$/.test(c) && colorDistance(newColor, c) < 60
        );
        attempts++;
    }
    return newColor;
}


function renderEditor() {
    const biz = getBusiness(brand);
    $("e-name").value = biz.name;
    $("e-tagline").value = biz.tagline;
    $("e-address").value = biz.address;
    draftServices = biz.services.map((s, i) => ({
        ...s,
        // Preview the color already shown on the calendar for existing
        // services, so the editor doesn't show a different color than what
        // customers currently see (and doesn't re-randomize on every open).
        color: colorForService(s, i),
        staff: s.staff || 1
    }));
    draftHours = Object.fromEntries(DAY_KEYS.map(k => [k, { ...biz.hours[k] }]));
    draftCustomFields = biz.customFields.map(f => ({ ...f }));

    renderServiceRows();
    renderHoursRows();
    CONTACT_FIELDS.forEach(k => {
        const cf = biz.customerFields[k];
        $(`e-${k}-enabled`).checked = cf.enabled;
        $(`e-${k}-required`).checked = cf.required;
        $(`e-${k}-required`).disabled = !cf.enabled;
    });
    renderCustomFieldRows();
    $("e-auto-assign").checked = biz.autoAssignStaff;
    $("editor-msg").textContent = "";
    $("editor-msg").classList.remove("err");
}

// Opening hours: one row per day (reusing the same working/start/end row
// the Employees tab uses for a person's weekly schedule — the shape is
// identical, just for the business itself rather than a member of staff).
function renderHoursRows() {
    $("hours-editor-list").replaceChildren(...DAY_KEYS.map(k => {
        const row = fromTemplate("tpl-schedule-day");
        const day = draftHours[k];
        row.querySelector(".sched-day-label").textContent = DAY_LABELS[k];
        row.querySelector(".sched-off").textContent = "Closed";
        const working = row.querySelector(".sched-working"), start = row.querySelector(".sched-start"), end = row.querySelector(".sched-end");

        working.checked = day.working;
        start.value = day.start;
        end.value = day.end;
        copyBtn = row.querySelector(".sched-copy-btn");
        row.classList.toggle("is-off", !day.working);

        working.onchange = ev => {
            draftHours[k].working = ev.target.checked;
            row.classList.toggle("is-off", !ev.target.checked);
        };
        start.oninput = ev => { draftHours[k].start = ev.target.value; };
        end.oninput = ev => { draftHours[k].end = ev.target.value; };

        copyBtn.onclick = () => {
            const s = start.value, e = end.value;
            DAY_KEYS.forEach(otherKey => {
                if (draftHours[otherKey].working) {
                    draftHours[otherKey].start = s;
                    draftHours[otherKey].end = e;
                }
            });
            renderHoursRows();
        };

        return row;
    }));
}

// ---------- Opening hours popover ----------
// Same anchored-floating-panel pattern as the Employees tab's
// #emp-panel-popover: toggling it never resizes or repositions the
// Business details card it's opened from.
function closeHoursPopover() {
    const pop = $("hours-popover");
    if (pop.hidden) return;
    pop.hidden = true;
    $("hours-toggle").setAttribute("aria-expanded", "false");
}

function openHoursPopover() {
    const pop = $("hours-popover");
    const btn = $("hours-toggle");
    pop.hidden = false;
    btn.setAttribute("aria-expanded", "true");

    const anchor = $("view-editor");
    const btnRect = btn.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    let left = btnRect.left - anchorRect.left;
    pop.style.top = `${btnRect.bottom - anchorRect.top + 8}px`;
    pop.style.left = `${left}px`;

    // Nudge back onto the screen if it would run past the right edge.
    requestAnimationFrame(() => {
        const popRect = pop.getBoundingClientRect();
        const overflowRight = popRect.right - window.innerWidth;
        if (overflowRight > 0) left = Math.max(8, left - overflowRight - 8);
        pop.style.left = `${left}px`;
    });
}

$("hours-toggle").onclick = () => {
    $("hours-popover").hidden ? openHoursPopover() : closeHoursPopover();
};
$("hours-popover-close").onclick = () => closeHoursPopover();

document.addEventListener("click", e => {
    const pop = $("hours-popover");
    if (pop.hidden) return;
    if (pop.contains(e.target) || e.target.closest("#hours-toggle")) return;
    closeHoursPopover();
});
document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeHoursPopover();
});
window.addEventListener("resize", closeHoursPopover);

function renderServiceRows() {
    $("service-editor-list").replaceChildren(...draftServices.map((s, i) => {
        const row = fromTemplate("tpl-service-row");


        row.querySelector(".sr-name").value = s.name;
        row.querySelector(".sr-mins").value = s.mins;
        row.querySelector(".sr-price").value = s.price;
        row.querySelector(".sr-desc").value = s.desc;
        row.querySelector(".sr-staff").value = s.staff || 1;
        row.querySelector(".sr-color").value = s.color; // Load color

        row.querySelector(".sr-name").oninput = e => { draftServices[i].name = e.target.value; };
        row.querySelector(".sr-mins").oninput = e => { draftServices[i].mins = +e.target.value || 0; };
        row.querySelector(".sr-price").oninput = e => { draftServices[i].price = +e.target.value || 0; };
        row.querySelector(".sr-desc").oninput = e => { draftServices[i].desc = e.target.value; };
        row.querySelector(".sr-staff").oninput = e => { draftServices[i].staff = Math.max(1, +e.target.value || 1); };
        row.querySelector(".sr-color").oninput = e => { draftServices[i].color = e.target.value; }; // Save color to draft
        row.querySelector(".sr-remove").onclick = () => { draftServices.splice(i, 1); renderServiceRows(); };
        return row;
    }));
}

// Ticking a field's "Required" box only makes sense once it's being asked
// for at all — unticking "Ask for it" clears and disables "Required" too.
CONTACT_FIELDS.forEach(k => {
    $(`e-${k}-enabled`).onchange = e => {
        const req = $(`e-${k}-required`);
        req.disabled = !e.target.checked;
        if (!e.target.checked) req.checked = false;
    };
});

$("add-service").onclick = () => {
    const existingColors = draftServices.map(s => s.color);
    // A brand-new service has no established color anywhere yet, so it's
    // fine (and nicer) to give it a genuinely distinct random color here.
    draftServices.push({ name: "New service", mins: 30, price: 20, desc: "", staff: 1, color: generateDistinctColor(existingColors) });
    renderServiceRows();
};

// Custom fields: businesses' own extra questions on the booking form,
// beyond the four built-in contact fields. Same draft-array-until-save
// pattern as draftServices above.
function renderCustomFieldRows() {
    $("custom-field-editor-list").replaceChildren(...draftCustomFields.map((f, i) => {
        const row = fromTemplate("tpl-custom-field-row");
        row.querySelector(".cfr-label").value = f.label;
        row.querySelector(".cfr-type").value = f.type || "text";
        row.querySelector(".cfr-required").checked = !!f.required;

        row.querySelector(".cfr-label").oninput = e => { draftCustomFields[i].label = e.target.value; };
        row.querySelector(".cfr-type").onchange = e => { draftCustomFields[i].type = e.target.value; };
        row.querySelector(".cfr-required").onchange = e => { draftCustomFields[i].required = e.target.checked; };
        row.querySelector(".cfr-remove").onclick = () => { draftCustomFields.splice(i, 1); renderCustomFieldRows(); };
        return row;
    }));
}

$("add-custom-field").onclick = () => {
    draftCustomFields.push({ id: makeFieldId(), label: "", type: "text", required: false });
    renderCustomFieldRows();
};

$("editor-form").addEventListener("submit", e => {
    e.preventDefault();
    const name = $("e-name").value.trim();
    const msg = $("editor-msg");
    const error =
        !name ? "Enter a business name." :
            draftServices.length === 0 ? "Add at least one service." :
                draftServices.some(s => !s.name.trim()) ? "Every service needs a name." :
                    DAY_KEYS.every(k => !draftHours[k].working) ? "At least one day needs to be open." :
                        CONTACT_FIELDS.every(k => !$(`e-${k}-enabled`).checked) ? "Ask for at least one customer detail." :
                            draftCustomFields.some(f => !f.label.trim()) ? "Every additional field needs a label." : "";
    if (error) { msg.textContent = error; msg.classList.add("err"); return; }

    const biz = getBusiness(brand);
    saveBusiness(brand, {
        ...biz, // keep anything this form doesn't touch (employees, colors, ...)
        name, tagline: $("e-tagline").value.trim(), address: $("e-address").value.trim(),
        services: draftServices.map(s => ({
            name: s.name.trim(),
            mins: s.mins || 30,
            price: s.price || 0,
            desc: s.desc.trim(),
            staff: Math.max(1, s.staff || 1),
            color: s.color || "#dbeafe" // Save the color
        })),
        hours: draftHours,
        customerFields: Object.fromEntries(CONTACT_FIELDS.map(k => [k, {
            enabled: $(`e-${k}-enabled`).checked,
            required: $(`e-${k}-enabled`).checked && $(`e-${k}-required`).checked
        }])),
        customFields: draftCustomFields.map(f => ({
            id: f.id, label: f.label.trim(), type: f.type === "textarea" ? "textarea" : "text", required: !!f.required
        })),
        autoAssignStaff: $("e-auto-assign").checked
    });
    // Service list/order may have changed (added/removed/reordered) — close
    // the quick color editor so it can't save a now-stale index mapping.
    $("quick-color-menu").hidden = true;

    // Refresh everything — Calendar and Analytics read business/service data
    // straight from storage, so without this they'd keep showing stale
    // colors/services until something else (like a brand switch) happened
    // to trigger a render.
    render();
    msg.classList.remove("err");
    msg.textContent = "Saved. The booking page now shows these changes.";
});

$("reset-editor").onclick = () => {
    resetBusiness(brand);
    render(); // same reason as Save above: refresh Calendar/Analytics too, not just this tab
    $("editor-msg").textContent = "Reset to the default details.";
};

// Close the quick color popover when clicking anywhere outside it (but not
// on the button that opens it — that click already toggles it open above).
document.addEventListener("click", e => {
    const menu = $("quick-color-menu");
    if (menu.hidden) return;
    const btn = document.querySelector(".edit-color-btn");
    if (menu.contains(e.target) || (btn && btn.contains(e.target))) return;
    menu.hidden = true;
});

// ---------- Employees Editor ----------
// Each draft employee is { name, skills: [serviceName, ...], schedule: { mon: {working,start,end}, ... } }.
let draftEmployees = [];


function renderEmployees() {
    const biz = getBusiness(brand);
    draftEmployees = (biz.employees || []).map(e => ({
        name: e.name,
        skills: [...e.skills],
        schedule: Object.fromEntries(DAY_KEYS.map(k => [k, { ...e.schedule[k] }])),
        color: e.color // Preserve custom color
    }));
    employeesExpanded = false; // fresh brand/data — start collapsed again
    renderEmployeeRows();
    $("employee-msg").textContent = "";
    $("employee-msg").classList.remove("err");
}

const EMP_TAB_LABELS = { skills: "Skills", schedule: "Schedule", timetable: "Timetable" };

// ---------- Skills/Schedule/Timetable popover ----------
// One shared floating panel (see #emp-panel-popover in index-admin.html),
// reused for whichever employee's tab was clicked. Opening it moves that
// employee's already-built .emp-skills/.emp-schedule/.emp-timetable
// element into the popover body; closing it moves the same element back
// to its home card. Nothing about the card itself ever changes size, so
// no card in the list or grid ever reflows.
function closeEmployeePanelPopover() {
    const pop = $("emp-panel-popover");
    if (pop.hidden) return;
    if (pop._panelEl && pop._homeCard) {
        pop._panelEl.hidden = true;
        pop._homeCard.appendChild(pop._panelEl);
    }
    if (pop._onClose) pop._onClose();
    pop.hidden = true;
    pop._panelEl = null;
    pop._homeCard = null;
    pop._onClose = null;
}

function openEmployeePanelPopover({ panelEl, homeCard, anchorBtn, title, kind, onClose }) {
    closeEmployeePanelPopover(); // only one open at a time, whichever employee it belongs to
    const pop = $("emp-panel-popover");
    pop.dataset.kind = kind;
    $("emp-panel-popover-title").textContent = title;
    panelEl.hidden = false;
    $("emp-panel-popover-body").replaceChildren(panelEl);
    pop._panelEl = panelEl;
    pop._homeCard = homeCard;
    pop._onClose = onClose;
    pop.hidden = false;

    // Anchor under the clicked tab, positioned relative to #view-employees
    // (see position:relative on it in styles-admin.css).
    const anchor = $("view-employees");
    const btnRect = anchorBtn.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    let left = btnRect.left - anchorRect.left;
    pop.style.top = `${btnRect.bottom - anchorRect.top + 8}px`;
    pop.style.left = `${left}px`;

    // Nudge back onto the screen if the popover would run past the right
    // edge (the timetable one especially, since it's the widest).
    requestAnimationFrame(() => {
        const popRect = pop.getBoundingClientRect();
        const overflowRight = popRect.right - window.innerWidth;
        if (overflowRight > 0) left = Math.max(8, left - overflowRight - 8);
        pop.style.left = `${left}px`;
    });
}

$("emp-panel-popover-close").onclick = () => closeEmployeePanelPopover();

// Closes the popover on an outside click, Escape, or a brand/view switch —
// never on a click inside it or on the tab button that opens/closes it
// (that button's own onclick already handles the toggle).
document.addEventListener("click", e => {
    const pop = $("emp-panel-popover");
    if (pop.hidden) return;
    if (pop.contains(e.target) || e.target.closest(".emp-tab")) return;
    closeEmployeePanelPopover();
});
document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeEmployeePanelPopover();
});
window.addEventListener("resize", closeEmployeePanelPopover);

function renderEmployeeRows() {
    const biz = getBusiness(brand);
    closeEmployeePanelPopover(); // the list is being rebuilt, so nothing can stay open
    $("employee-editor-list").replaceChildren(...draftEmployees.map((e, i) => {
        const card = fromTemplate("tpl-employee-card");

        const nameInput = card.querySelector(".emp-name");
        const avatar = card.querySelector(".emp-avatar");
        const meta = card.querySelector(".emp-meta");
        const colorInput = card.querySelector(".emp-color");

        // Avatar + meta line react live to the name/skills/schedule edits
        // below, so they're refreshed from one place rather than redrawing
        // the whole card on every keystroke.
        const refreshHead = () => {
            const name = draftEmployees[i].name || "";
            avatar.textContent = name.trim().charAt(0).toUpperCase() || "?";
            const avatarColor = colorForEmployee(draftEmployees[i], i);
            avatar.style.background = avatarColor;
            avatar.style.color = readableTextColor(avatarColor);
            const skillCount = draftEmployees[i].skills.length;
            const dayCount = DAY_KEYS.filter(k => draftEmployees[i].schedule[k].working).length;
            meta.textContent = `${skillCount} skill${skillCount === 1 ? "" : "s"} · ${dayCount} day${dayCount === 1 ? "" : "s"}`;
        };

        nameInput.value = e.name || "";
        nameInput.oninput = ev => { draftEmployees[i].name = ev.target.value; refreshHead(); applyEmployeeSearch(); };

        colorInput.value = colorForEmployee(e, i);
        colorInput.oninput = ev => { draftEmployees[i].color = ev.target.value; refreshHead(); };

        // Bin icon next to the colour swatch — removes this employee from
        // the draft outright, after a confirmation, then rebuilds the list
        // (positions/indices of every other card shift, so a full redraw
        // is simpler and safer than patching this one card out).
        const deleteBtn = card.querySelector(".emp-delete");
        deleteBtn.onclick = () => {
            const label = (draftEmployees[i].name || "").trim();
            const ok = confirm(label ? `Delete ${label}? This can't be undone.` : "Delete this employee? This can't be undone.");
            if (!ok) return;
            draftEmployees.splice(i, 1);
            renderEmployeeRows();
        };

        // Skills, Weekly schedule and Timetable open in the shared floating
        // popover above (see openEmployeePanelPopover), not inline in the
        // card — opening one never resizes or repositions this card or any
        // other, in either list or grid view.
        const skillsBox = card.querySelector(".emp-skills");
        const scheduleBox = card.querySelector(".emp-schedule");
        const timetableBox = card.querySelector(".emp-timetable");
        const panels = { skills: skillsBox, schedule: scheduleBox, timetable: timetableBox };
        const tabs = card.querySelectorAll(".emp-tab");

        const openPanel = (key, tab) => {
            // The timetable is only built the first time it's opened, so a
            // dozen employees doesn't build a dozen calendars up front.
            if (key === "timetable" && !timetableBox.dataset.built) {
                renderEmployeeTimetable(timetableBox, draftEmployees[i]);
                timetableBox.dataset.built = "1";
            }
            tabs.forEach(t => t.setAttribute("aria-pressed", String(t === tab)));
            card.classList.add("panel-open");
            const empName = draftEmployees[i].name.trim() || "Employee";
            openEmployeePanelPopover({
                panelEl: panels[key],
                homeCard: card,
                anchorBtn: tab,
                title: `${empName} — ${EMP_TAB_LABELS[key]}`,
                kind: key,
                onClose: () => {
                    tabs.forEach(t => t.setAttribute("aria-pressed", "false"));
                    card.classList.remove("panel-open");
                }
            });
        };
        tabs.forEach(tab => {
            tab.onclick = () => {
                const key = tab.dataset.panel;
                if (tab.getAttribute("aria-pressed") === "true") closeEmployeePanelPopover();
                else openPanel(key, tab);
            };
        });

        // One toggle chip per service currently on the booking page.
        if (biz.services.length) {
            skillsBox.replaceChildren(...biz.services.map(s => {
                const chip = fromTemplate("tpl-skill-chip");
                chip.textContent = s.name;
                chip.setAttribute("aria-pressed", e.skills.includes(s.name));
                chip.onclick = () => {
                    const skills = draftEmployees[i].skills;
                    const idx = skills.indexOf(s.name);
                    if (idx > -1) skills.splice(idx, 1); else skills.push(s.name);
                    chip.setAttribute("aria-pressed", skills.includes(s.name));
                    refreshHead();
                };
                return chip;
            }));
        } else {
            skillsBox.replaceChildren(Object.assign(document.createElement("p"), { className: "muted", textContent: "Add a service on the Booking page tab first." }));
        }

        // Weekly schedule: one row per day, a working toggle plus start/end.
        const buildScheduleUI = () => {
            // Header with the "Reset to business hours" shortcut
            const header = document.createElement("div");
            header.style.flexBasis = "100%";
            header.innerHTML = `<button type="button" class="link reset-sched-btn" style="font-size: 13px; margin-bottom: 8px;">Reset to business hours</button>`;
            header.querySelector(".reset-sched-btn").onclick = () => {
                const biz = getBusiness(brand);
                draftEmployees[i].schedule = Object.fromEntries(DAY_KEYS.map(k => [k, { ...biz.hours[k] }]));
                refreshHead();
                buildScheduleUI();
            };

            const daysUI = DAY_KEYS.map(k => {
                const row = fromTemplate("tpl-schedule-day");
                const day = draftEmployees[i].schedule[k];
                row.querySelector(".sched-day-label").textContent = DAY_LABELS[k];

                const working = row.querySelector(".sched-working"),
                    start = row.querySelector(".sched-start"),
                    end = row.querySelector(".sched-end"),
                    copyBtn = row.querySelector(".sched-copy-btn");

                working.checked = day.working;
                start.value = day.start;
                end.value = day.end;
                row.classList.toggle("is-off", !day.working);

                working.onchange = ev => {
                    draftEmployees[i].schedule[k].working = ev.target.checked;
                    row.classList.toggle("is-off", !ev.target.checked);
                    refreshHead();
                };
                start.oninput = ev => { draftEmployees[i].schedule[k].start = ev.target.value; };
                end.oninput = ev => { draftEmployees[i].schedule[k].end = ev.target.value; };

                // Cascades the times to all working days, then triggers a local redraw
                copyBtn.onclick = () => {
                    const s = start.value, e = end.value;
                    DAY_KEYS.forEach(otherKey => {
                        if (draftEmployees[i].schedule[otherKey].working) {
                            draftEmployees[i].schedule[otherKey].start = s;
                            draftEmployees[i].schedule[otherKey].end = e;
                        }
                    });
                    buildScheduleUI();
                };

                return row;
            });

            scheduleBox.replaceChildren(header, ...daysUI);
        };
        buildScheduleUI();

        refreshHead();
        return card;
    }));
    applyEmployeeSearch();
}

$("add-employee").onclick = () => {
    const biz = getBusiness(brand);
    // Deep copy the business's actual opening hours so the employee defaults to the shop schedule
    const inheritedSchedule = Object.fromEntries(DAY_KEYS.map(k => [k, { ...biz.hours[k] }]));
    draftEmployees.push({ name: "", skills: [], schedule: inheritedSchedule });
    renderEmployeeRows();
};

// ---------- List / grid view ----------
// Just a class on the list container — list.css and grid.css rules above
// key off "view-list" vs "view-grid" to switch the layout.
function setEmployeeView(view) {
    closeEmployeePanelPopover(); // cards reflow between layouts, so any open popover's anchor goes stale
    $("employee-editor-list").className = `view-${view}`;
    $("employee-view-list").setAttribute("aria-pressed", view === "list");
    $("employee-view-grid").setAttribute("aria-pressed", view === "grid");
}
$("employee-view-list").onclick = () => setEmployeeView("list");
$("employee-view-grid").onclick = () => setEmployeeView("grid");

// ---------- Search ----------
// Filters the already-rendered cards rather than draftEmployees, so typing
// in the search box never touches the data being edited. Re-applied after
// every renderEmployeeRows() call, since that redraws the list.
// A search match always shows, however far down the list it is; with no
// search running, anything past the first EMP_COLLAPSE_COUNT stays hidden
// until "Show all" is clicked, so a big roster doesn't dump every card on
// screen at once.
function applyEmployeeSearch() {
    const q = $("employee-search").value.trim().toLowerCase();
    const cards = [...$("employee-editor-list").querySelectorAll(".emp-card")];
    cards.forEach(card => {
        const name = card.querySelector(".emp-name").value.toLowerCase();
        card.hidden = !(q === "" || name.includes(q));
    });
}
$("employee-search").addEventListener("input", applyEmployeeSearch);

// Empties the whole roster in one go, same arm-then-confirm pattern as
// "Clear bookings" — the first click just asks you to mean it. Only
// touches the draft, so it still needs "Save employees" to stick, same as
// every other change on this tab.
let clearEmployeesArmed = false;
$("clear-employees").onclick = e => {
    if (!draftEmployees.length) return;
    if (!clearEmployeesArmed) {
        clearEmployeesArmed = true;
        e.target.textContent = "Click again to confirm";
        setTimeout(() => { clearEmployeesArmed = false; e.target.textContent = "Clear employees"; }, 3000);
        return;
    }
    clearEmployeesArmed = false;
    e.target.textContent = "Clear employees";
    draftEmployees = [];
    employeesExpanded = false;
    renderEmployeeRows();
};

$("employees-form").addEventListener("submit", ev => {
    ev.preventDefault();
    const msg = $("employee-msg");

    if (draftEmployees.some(e => !e.name.trim())) {
        msg.textContent = "Every employee needs a name.";
        msg.classList.add("err");
        return;
    }

    const biz = getBusiness(brand);
    saveBusiness(brand, {
        ...biz,
        employees: draftEmployees.map(e => ({
            name: e.name.trim(),
            skills: e.skills.slice(),
            schedule: e.schedule,
            color: e.color
        }))
    });

    msg.classList.remove("err");
    msg.textContent = "Saved. The calendar and customer page now use this roster.";
    render(); // Auto-assign and slot availability read employees straight from storage
});

// ---------- Sample employees ----------
// A handful of made-up staff with realistic variety — different skill
// combinations and different weekly patterns (full-time, a late shift, an
// early shift, part-time, one weekend off) — so the schedule/skill/capacity
// logic (auto-assign, the customer page's spare-employee rule, the
// timetable view) all have something worth looking at straight away.
function sampleSchedule(pattern) {
    const s = defaultSchedule();
    if (pattern === "late") DAY_KEYS.forEach(k => { if (s[k].working) { s[k].start = "11:00"; s[k].end = "19:00"; } });
    if (pattern === "early") DAY_KEYS.forEach(k => { if (s[k].working) { s[k].start = "08:00"; s[k].end = "15:00"; } });
    if (pattern === "parttime") ["thu", "fri", "sat"].forEach(k => { s[k].working = false; });
    if (pattern === "weekend-off") s.sat.working = false;
    return s;
}

function addSampleEmployees() {
    const biz = getBusiness(brand);
    const msg = $("employee-msg");

    if (!biz.services.length) {
        msg.classList.add("err");
        msg.textContent = "Add a service on the Booking page tab first — sample employees need something to be skilled at.";
        return;
    }

    const existingNames = new Set((biz.employees || []).map(e => e.name));
    const available = STAFF_SAMPLE_NAMES.filter(n => !existingNames.has(n));
    if (!available.length) {
        msg.classList.add("err");
        msg.textContent = "All the sample employees are already on the roster.";
        return;
    }

    // One employee per service at minimum, a couple more if there's room,
    // so every service has someone (and ideally two) who can do it.
    const patterns = ["full", "full", "late", "early", "parttime", "weekend-off"];
    const count = Math.min(available.length, Math.max(3, biz.services.length + 1));
    const names = available.slice(0, count);

    const newEmployees = names.map((name, i) => {
        // Cycle a "primary" skill through the service list so every service
        // gets covered, then add one more random skill so nobody can only
        // do a single job.
        const primary = biz.services[i % biz.services.length].name;
        const otherServices = biz.services.map(s => s.name).filter(n => n !== primary);
        const secondary = otherServices.length ? otherServices[Math.floor(Math.random() * otherServices.length)] : null;
        return {
            name,
            skills: secondary ? [primary, secondary] : [primary],
            schedule: sampleSchedule(patterns[i % patterns.length])
        };
    });

    saveBusiness(brand, { ...biz, employees: [...(biz.employees || []), ...newEmployees] });
    render();
    msg.classList.remove("err");
    msg.textContent = `Added ${newEmployees.length} sample employee${newEmployees.length === 1 ? "" : "s"}.`;
}

$("add-sample-employees").onclick = addSampleEmployees;

// A read-only, one-employee calendar: their working hours shaded in, their
// actual bookings laid on top, colored (and clickable) the same way the
// main Calendar tab does it. Reuses the same grid classes/CSS as the main
// calendar rather than duplicating that layout.
function renderEmployeeTimetable(container, emp) {
    const biz = getBusiness(brand);
    const mine = bookingsFor(brand).filter(b => bookingStaff(b).includes(emp.name));

    const grid = document.createElement("div");
    grid.className = "calendar emp-mini-grid";

    const corner = document.createElement("div");
    corner.className = "cal-header";
    corner.style.gridColumn = 1;
    grid.appendChild(corner);

    days.forEach((d, i) => {
        const head = document.createElement("div");
        head.className = "cal-header";
        head.style.gridColumn = i + 2;
        head.style.gridRow = 1;
        head.innerHTML = `
            <div class="cal-day-name">${d.toLocaleDateString("en-GB", { weekday: "short" })}</div>
            <div class="cal-day-num">${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>
        `;
        grid.appendChild(head);
    });

    slots.forEach((m, rowIndex) => {
        const row = rowIndex + 2;
        // Same treatment as the main Calendar tab: a solid line + label on
        // the hour, a dotted line and no label on the half-hour.
        const onHour = m % 60 === 0;
        const lineClass = onHour ? "cal-line-hour" : "cal-line-half";

        const label = document.createElement("div");
        label.className = `cal-time ${lineClass}`;
        label.style.gridRow = row;
        label.style.gridColumn = 1;
        if (onHour) label.textContent = formatTime(m);
        else label.setAttribute("aria-label", formatTime(m)); // still announced, just not printed
        grid.appendChild(label);

        days.forEach((d, colIndex) => {
            const cell = document.createElement("div");
            cell.style.gridColumn = colIndex + 2;
            cell.style.gridRow = row;
            // Shade every half-hour this employee isn't rostered on, the
            // same way the main calendar shades closed Sundays.
            cell.className = employeeWorking(emp, d.getDay(), m, 30) ? "cal-empty-cell" : "cal-closed-cell";
            cell.classList.add(lineClass);
            grid.appendChild(cell);
        });
    });

    const byDay = {};
    mine.forEach(x => {
        const dayIndex = days.findIndex(d => dateKey(d) === x.date);
        const slotIndex = slots.indexOf(x.time);
        if (dayIndex === -1 || slotIndex === -1) return;
        (byDay[dayIndex] ||= []).push({ booking: x, start: slotIndex, span: Math.ceil(x.mins / 30) });
    });

    Object.entries(byDay).forEach(([dayIndexStr, dayBookings]) => {
        const dayIndex = Number(dayIndexStr);
        const track = document.createElement("div");
        track.className = "cal-day-track";
        track.style.gridColumn = dayIndex + 2;
        track.style.gridRow = `2 / ${2 + slots.length}`;
        grid.appendChild(track);

        layoutOverlaps(dayBookings).forEach(({ booking: x, start, span, col, cols }) => {
            const svcIdx = biz.services.findIndex(s => s.name === x.service);
            const bgColor = svcIdx > -1 ? colorForService(biz.services[svcIdx], svcIdx) : "#eee";

            const card = document.createElement("div");
            card.className = "cal-booking-grid";
            card.style.top = `calc(${(start / slots.length) * 100}% + 3px)`;
            card.style.height = `calc(${(span / slots.length) * 100}% - 6px)`;
            card.style.left = `calc(${(col / cols) * 100}% + 3px)`;
            card.style.width = `calc(${(1 / cols) * 100}% - 6px)`;
            card.style.background = bgColor;
            card.style.color = readableTextColor(bgColor);
            card.style.cursor = "pointer";
            card.innerHTML = `
                <div class="header-row"><span class="cb-name">${x.service}</span></div>
                
            `;
            card.onclick = () => { setView("calendar"); openBookingModal(x, days[dayIndex], x.time); };
            track.appendChild(card);
        });
    });

    container.replaceChildren(grid);
    if (!mine.length) container.appendChild(Object.assign(document.createElement("p"), { className: "muted", textContent: "No bookings assigned to them yet." }));
}

// ---------- Toast notification ----------
// Fixed to the bottom of the screen (see .toast in styles.css). Width can't
// be transitioned to/from "auto", so this measures the box's natural width
// with the message already in place, snaps it back to 0, then animates both
// the slide/fade (via the .show class) and the width to that measured value
// together in the same frame — giving the "grows in width while it rises"
// motion. Hides itself the same way in reverse after `duration`.
function showToast(text, success = false, duration = 5000) {
    const toast = $("toast");
    if (!toast) return;
    const label = toast.querySelector(".toast-text");

    clearTimeout(toast._hideTimer);

    // Reset to a zero-width, untransitioned state before measuring, so a
    // toast that's still animating out doesn't get measured mid-shrink.
    toast.classList.remove("show");
    toast.classList.toggle("success", success); // green outline on success, red otherwise
    toast.style.transition = "none";
    label.textContent = text;
    toast.style.width = "max-content";
    const targetWidth = toast.getBoundingClientRect().width;
    toast.style.width = "0px";
    void toast.offsetWidth; // flush the reset above before re-enabling transitions
    toast.style.transition = "";

    requestAnimationFrame(() => {
        toast.classList.add("show");
        toast.style.width = targetWidth + "px";
    });

    toast._hideTimer = setTimeout(() => {
        toast.classList.remove("show");
        toast.style.width = "0px";
    }, duration);
}

// ---------- Auto-assign staff ----------
// Fills in missing staff on existing bookings: for each one short of the
// service's required headcount, picks rostered, skilled, still-free
// employees (checking against every booking already handled in this same
// pass, so it never double-books someone across two appointments that
// overlap). It never un-assigns anyone, and it works through bookings in
// date/time order so earlier appointments get first claim on a busy
// employee's time.
$("auto-assign").onclick = () => {
    const biz = getBusiness(brand);
    const employees = biz.employees || [];
    if (!employees.length) {
        showToast("Add some employees on the Employees tab first.");
        return;
    }

    const bookings = bookingsFor(brand).slice().sort((a, b) => a.date === b.date ? a.time - b.time : (a.date < b.date ? -1 : 1));

    const busy = {}; // employee name -> [{date, start, end}], seeded with whoever's already assigned
    employees.forEach(e => { busy[e.name] = []; });
    bookings.forEach(b => bookingStaff(b).forEach(name => { if (busy[name]) busy[name].push({ date: b.date, start: b.time, end: b.time + b.mins }); }));

    // Seeded from existing bookings, then bumped as this pass hands out
    // more work, so candidates are always offered a job in order of who
    // currently has the least on their plate — the same load-balancing
    // autoAssignStaffFor uses for a single new booking — rather than
    // whoever happens to come first in the employees list.
    const jobCounts = employeeJobCounts(brand);

    let filled = 0, stillShort = 0;
    bookings.forEach(b => {
        const service = biz.services.find(s => s.name === b.service);
        const needed = (service && service.staff) || 1;
        const assigned = bookingStaff(b).slice();
        if (assigned.length >= needed) return;

        const weekday = parseDateKey(b.date).getDay();
        const candidates = employees.filter(e =>
            !assigned.includes(e.name) &&
            employeeHasSkill(e, b.service) &&
            employeeWorking(e, weekday, b.time, b.mins) &&
            !busy[e.name].some(x => x.date === b.date && rangesOverlap(x.start, x.end, b.time, b.time + b.mins))
        ).sort((a, c) => (jobCounts[a.name] || 0) - (jobCounts[c.name] || 0));

        while (assigned.length < needed && candidates.length) {
            const pick = candidates.shift();
            assigned.push(pick.name);
            busy[pick.name].push({ date: b.date, start: b.time, end: b.time + b.mins });
            jobCounts[pick.name] = (jobCounts[pick.name] || 0) + 1;
        }

        if (assigned.length !== bookingStaff(b).length) {
            removeBooking(b.ref);
            addBooking({ ...b, employees: assigned, employee: assigned[0] || "" });
            filled++;
        }
        if (assigned.length < needed) stillShort++;
    });

    render();
    showToast(filled === 0
        ? "Nobody could be assigned — everyone eligible is already booked or nobody has the right skill."
        : `Assigned staff to ${filled} booking${filled === 1 ? "" : "s"}.` + (stillShort ? ` ${stillShort} still need more staff than are currently free.` : ""),
        filled > 0);
};




// ---------- Booking Modal Staff Logic ----------
let bmStaffExpanded = false;
const BM_STAFF_LIMIT = 4;

function applyBmStaffFilter() {
    const searchInput = $("bm-staff-search");
    if (!searchInput) return;

    const q = searchInput.value.trim().toLowerCase();

    // 1. Filter the checkbox list
    const items = [...document.querySelectorAll("#bm-staff-list .bm-staff-item")];
    let visibleCount = 0;
    items.forEach(item => {
        const name = item.querySelector(".bm-staff-name").textContent.toLowerCase();
        if (q !== "" && !name.includes(q)) {
            item.hidden = true;
        } else {
            visibleCount++;
            item.hidden = (!bmStaffExpanded && q === "" && visibleCount > BM_STAFF_LIMIT);
        }
    });

    // 2. Filter the dropdown options
    const options = [...document.querySelectorAll("#bm-staff-select option")];
    options.forEach(opt => {
        if (opt.value === "") {
            opt.hidden = false; // Always keep the "Unassigned" option visible
            return;
        }
        const name = opt.textContent.toLowerCase();
        opt.hidden = (q !== "" && !name.includes(q));
    });

    // 3. Toggle the "Show all" button (only if we are currently looking at the list view)
    const btn = $("bm-staff-expand");
    if (btn) {
        const showBtn = q === "" && items.length > BM_STAFF_LIMIT && $("bm-staff-select").hidden;
        btn.hidden = !showBtn;
        if (showBtn) btn.textContent = bmStaffExpanded ? "Show fewer" : `Show all ${items.length}`;
    }
}

$("bm-staff-search").addEventListener("input", applyBmStaffFilter);

$("bm-staff-expand").onclick = () => {
    bmStaffExpanded = !bmStaffExpanded;

    // Removes the hard height limit so the box stretches instead of scrolling
    $("bm-staff-list").style.maxHeight = bmStaffExpanded ? "none" : "";

    applyBmStaffFilter();
};

$("bm-staff-clear").onclick = () => {
    document.querySelectorAll("#bm-staff-list .bm-staff-check:checked").forEach(cb => {
        cb.checked = false;
        cb.onchange(); // trigger the internal count update
    });
};


// A booking made on the customer page in another tab shows up here without a reload.
window.addEventListener("storage", render);


if ($("color-mode")) $("color-mode").addEventListener("change", renderCalendar);
setView("calendar");
render();