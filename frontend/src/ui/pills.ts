// Sliding selection indicator for segmented controls. Any element with `data-pill` gets one indicator that glides
// to its selected child (aria-selected, aria-pressed, aria-current or aria-checked). The move is a CSS transform,
// so a new selection mid-glide simply re-targets from where the pill is. One observer for the whole page.
const SELECTED = '[aria-selected="true"], [aria-pressed="true"], [aria-current="step"], [aria-current="page"], [aria-checked="true"]';

function place(group: HTMLElement) {
  let pill = group.querySelector<HTMLElement>(":scope > .ui-pill");
  if (!pill) {
    pill = document.createElement("span");
    pill.className = "ui-pill";
    pill.setAttribute("aria-hidden", "true");
    group.prepend(pill);
  }
  const sel = [...group.querySelectorAll<HTMLElement>(SELECTED)].find((el) => el.parentElement === group || el.parentElement?.parentElement === group);
  if (!sel || sel.offsetWidth === 0) { pill.style.opacity = "0"; return; }
  const first = pill.dataset.placed !== "1";
  if (first) pill.style.transition = "none";
  pill.style.opacity = "1";
  pill.style.width = `${sel.offsetWidth}px`;
  pill.style.height = `${sel.offsetHeight}px`;
  pill.style.transform = `translate(${sel.offsetLeft}px, ${sel.offsetTop}px)`;
  if (first) { pill.dataset.placed = "1"; void pill.offsetWidth; pill.style.transition = ""; }
}

let installed = false;
export function installPills() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  let raf = 0;
  const all = () => { raf = 0; document.querySelectorAll<HTMLElement>("[data-pill]").forEach(place); };
  const queue = () => { if (!raf) raf = requestAnimationFrame(all); };
  new MutationObserver(queue).observe(document.body, {
    subtree: true, childList: true, attributes: true,
    attributeFilter: ["aria-selected", "aria-pressed", "aria-current", "aria-checked", "class"],
  });
  window.addEventListener("resize", queue);
  document.fonts?.ready.then(queue);
  queue();
}
