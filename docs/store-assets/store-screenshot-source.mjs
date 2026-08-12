const slides = {
  event: {
    title: "\u05e4\u05d5\u05ea\u05d7\u05d9\u05dd \u05d0\u05d9\u05e8\u05d5\u05e2 \u05d1\u05e9\u05e0\u05d9\u05d5\u05ea",
    subtitle: "\u05d1\u05d5\u05d7\u05e8\u05d9\u05dd \u05d9\u05e6\u05d9\u05d0\u05d4 \u05e8\u05d2\u05d9\u05dc\u05d4 \u05d0\u05d5 \u05d8\u05d9\u05d5\u05dc, \u05d5\u05de\u05de\u05e9\u05d9\u05db\u05d9\u05dd \u05dc\u05e4\u05e8\u05d8\u05d9\u05dd.",
    image: "ui-event-type-current.png"
  },
  expense: {
    title: "\u05de\u05d5\u05e1\u05d9\u05e4\u05d9\u05dd \u05d4\u05d5\u05e6\u05d0\u05d4 \u05d1\u05dc\u05d9 \u05dc\u05d4\u05e1\u05ea\u05d1\u05da",
    subtitle: "\u05de\u05ea\u05d7\u05d9\u05dc\u05d9\u05dd \u05de\u05d4\u05e1\u05db\u05d5\u05dd, \u05d5\u05de\u05de\u05e9\u05d9\u05db\u05d9\u05dd \u05e6\u05e2\u05d3 \u05d0\u05d7\u05e8\u05d9 \u05e6\u05e2\u05d3.",
    image: "ui-expense-amount-current.png"
  },
  invite: {
    title: "\u05de\u05d6\u05de\u05d9\u05e0\u05d9\u05dd \u05d7\u05d1\u05e8\u05d9\u05dd \u05d1\u05dc\u05d9 \u05dc\u05d4\u05e1\u05ea\u05d1\u05da",
    subtitle: "\u05e7\u05d9\u05e9\u05d5\u05e8 \u05d0\u05d7\u05d3 \u05dc\u05e7\u05d1\u05d5\u05e6\u05d4 \u05d0\u05d5 \u05d4\u05d6\u05de\u05e0\u05d4 \u05e4\u05e8\u05d8\u05d9\u05ea \u05dc\u05d7\u05d1\u05e8.",
    image: "ui-invite-current.png"
  }
};

const selectedKey = new URLSearchParams(location.search).get("slide") || "event";
const captureOffset = new URLSearchParams(location.search).get("offset");
const selected = slides[selectedKey] || slides.event;
document.body.classList.add(`slide-${slides[selectedKey] ? selectedKey : "event"}`);
if (captureOffset !== null) {
  document.body.classList.add("capture-flat");
}
if (captureOffset === "1346" || captureOffset === "2692") {
  document.body.classList.add(`capture-offset-${captureOffset}`);
}
document.querySelector("#title").textContent = selected.title;
document.querySelector("#subtitle").textContent = selected.subtitle;
document.querySelector("#screen").src = selected.image;
