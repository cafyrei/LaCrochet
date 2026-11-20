// Light / dark mode.
// The site follows the device's setting unless the person presses the sun/moon
// button. Their choice is kept in localStorage and copied into
// <meta name="color-scheme"> (index.html also does this before the page draws,
// so there's no flash of the wrong colours). index.css follows that <meta>.

const STORAGE_KEY = "color-scheme";
const metaTag = () => document.querySelector('meta[name="color-scheme"]');
const deviceIsDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

// What the person is seeing right now: "light" or "dark".
export function currentScheme() {
  const pinned = metaTag()?.content;
  if (pinned === "light" || pinned === "dark") return pinned;
  return deviceIsDark() ? "dark" : "light";
}

function apply(pinned) {
  const meta = metaTag();
  if (meta) meta.content = pinned ?? "light dark";
  // The phone's browser bar matches the page.
  const bar = document.querySelector('meta[name="theme-color"]');
  if (bar) bar.content = currentScheme() === "dark" ? "#1c1512" : "#fbf7f2";
}

// Switch to the opposite of what's on screen.
// If that's the same as the device's own setting, forget the choice instead of
// saving it, so the site goes back to following the device.
export function toggleScheme() {
  const target = currentScheme() === "dark" ? "light" : "dark";
  const device = deviceIsDark() ? "dark" : "light";
  const pinned = target === device ? null : target;
  try {
    if (pinned) localStorage.setItem(STORAGE_KEY, pinned);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the switch still works until the page is reloaded.
  }
  apply(pinned);
  return target;
}

// Another tab changed it: follow along.
export function watchOtherTabs() {
  const onStorage = (event) => {
    if (event.key === STORAGE_KEY) apply(event.newValue);
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
