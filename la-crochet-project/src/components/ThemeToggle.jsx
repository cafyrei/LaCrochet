import { useEffect } from "react";
import { toggleScheme, watchOtherTabs } from "../utils/colorScheme";
import { MoonIcon, SunIcon } from "./Icons";

// The sun/moon button. Both icons are always in the page; CSS shows the right
// one (see .theme-toggle in index.css), so it's correct even before the code
// runs and when the device switches between light and dark by itself.
// withLabel: also show the words (used in the back-office menu).
export default function ThemeToggle({ className = "", withLabel = false }) {
  useEffect(() => watchOtherTabs(), []);

  function handleClick(event) {
    const root = document.documentElement;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // No animation support, or the person prefers less motion: just switch.
    if (!document.startViewTransition || reduceMotion) {
      toggleScheme();
      return;
    }

    // The new colours spread out in a circle from the button.
    const box = event.currentTarget.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    root.style.setProperty("--theme-x", `${x}px`);
    root.style.setProperty("--theme-y", `${y}px`);
    root.style.setProperty("--theme-r", `${radius}px`);
    root.dataset.themeSwitch = "";

    const transition = document.startViewTransition(() => toggleScheme());
    transition.finished.finally(() => delete root.dataset.themeSwitch);
  }

  return (
    <button type="button" onClick={handleClick} className={`theme-toggle ${className}`}>
      <span className="theme-when-light">
        <MoonIcon className="theme-icon h-5 w-5" />
        <span className={withLabel ? "" : "sr-only"}>{withLabel ? "Dark mode" : "Switch to dark mode"}</span>
      </span>
      <span className="theme-when-dark">
        <SunIcon className="theme-icon h-5 w-5" />
        <span className={withLabel ? "" : "sr-only"}>{withLabel ? "Light mode" : "Switch to light mode"}</span>
      </span>
    </button>
  );
}
