const state = { brand: loadBrand(), service: null, day: null, time: null };

const business = () => BUSINESSES[state.brand];
const service = () => (state.service === null ? null : business().services[state.service]);

// Each render function fills a list from its <template>.
function renderServices() {
    $("service-list").replaceChildren(...business().services.map((s, i) => {
        const btn = fromTemplate("tpl-service");
        btn.querySelector(".svc-name").textContent = s.name;
        btn.querySelector(".svc-desc").textContent = `${s.mins} min. ${s.desc}`;
        btn.querySelector(".pr").textContent = `£${s.price}`;
        btn.setAttribute("aria-pressed", i === state.service);
        btn.onclick = () => { state.service = i; render(); };
        return btn;
    }));
}

function renderDays() {
    $("day-list").replaceChildren(...days.map((d, i) => {
        const btn = fromTemplate("tpl-day");
        btn.querySelector(".day-name").textContent = d.toLocaleDateString("en-GB", { weekday: "short" });
        btn.querySelector(".day-num").textContent = d.getDate();
        btn.disabled = d.getDay() === 0; // closed Sundays
        btn.setAttribute("aria-pressed", i === state.day);
        btn.onclick = () => { state.day = i; state.time = null; render(); };
        return btn;
    }));
}

function renderSlots() {
    $("slot-list").replaceChildren(...slots.map(m => {
        const btn = fromTemplate("tpl-slot");
        btn.textContent = formatTime(m);
        btn.disabled = state.day !== null && isBooked(state.brand, state.day, m);
        btn.setAttribute("aria-pressed", m === state.time);
        btn.onclick = () => { state.time = m; render(); };
        return btn;
    }));
}

function render() {
    const b = business(), s = service();
    $("biz-name").textContent = b.name;
    $("biz-tag").textContent = b.tagline;
    renderBrandSwitch(state.brand, setBrand); renderServices(); renderDays(); renderSlots();

    // Show each step only once the one before it is done.
    $("step-time").hidden = s === null;
    $("day-hint").hidden = state.day !== null;
    $("slot-list").hidden = state.day === null;
    $("step-details").hidden = state.time === null;

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
    saveBrand(key);
    showBooking();
    render();
}

$("details-form").addEventListener("submit", e => {
    e.preventDefault();
    const name = $("f-name").value.trim(), email = $("f-email").value.trim();
    const error =
        state.service === null ? "Choose a service first." :
            state.time === null ? "Pick a day and time." :
                !name ? "Enter your name." :
                    !/^\S+@\S+\.\S+$/.test(email) ? "Enter a valid email address." : "";
    $("error").textContent = error;
    if (error) return;

    const ref = makeRef(), s = service();
    addBooking({
        ref, brand: state.brand, service: s.name, price: s.price, mins: s.mins,
        date: dateKey(days[state.day]), time: state.time,
        name, email, phone: $("f-phone").value.trim(), note: $("f-note").value.trim(), created: Date.now()
    });
    render(); // blocks the slot that was just booked

    $("conf-name").textContent = name.split(" ")[0];
    $("conf-detail").textContent = `${service().name} on ${formatDay(days[state.day])} at ${formatTime(state.time)}.`;
    $("conf-ref").textContent = ref;
    $("conf-email").textContent = email;
    $("steps").hidden = true;
    $("summary").hidden = true;
    $("confirmation").hidden = false;
    window.scrollTo(0, 0);
});

$("reset").onclick = () => {
    $("details-form").reset();
    Object.assign(state, { service: null, day: null, time: null });
    showBooking();
    render();
};

setBrand(state.brand);