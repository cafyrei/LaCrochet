import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { BagIcon, CloseIcon, MenuIcon, SearchIcon, UserIcon } from "./Icons";
import ThemeToggle from "./ThemeToggle";

const NAV_LINKS = [
  { label: "Home", to: "/" },
  { label: "Shop", to: "/catalog" },
  { label: "About", to: "/about" },
  { label: "Contact", to: "/contact" },
];

const navLinkClass = ({ isActive }) =>
  `rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
    isActive ? "text-berry" : "text-ink/75 hover:text-ink"
  }`;

export default function Navbar({ onLoginClick }) {
  const { user, isChecking, logout } = useAuth();
  // Logging out also empties the cart (see CartContext).
  const { cartCount } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { pathname } = useLocation();

  // The Navbar stays on screen between pages now, so close its menus on every page change.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMenuOpen(false);
    setSearchOpen(false);
  }

  return (
    <header className="sticky top-0 z-50">
      <div className="bg-card">
        <nav
          aria-label="Main"
          className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8"
        >
          <Link to="/" className="font-serif text-2xl font-semibold text-ink">
            La Crochet
          </Link>

          <ul className="ml-6 hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <li key={link.to}>
                <NavLink to={link.to} end={link.to === "/"} className={navLinkClass}>
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => setSearchOpen((open) => !open)}
              aria-expanded={searchOpen}
              aria-label="Search products"
              className="btn-quiet px-2.5"
            >
              <SearchIcon />
            </button>

            <ThemeToggle className="btn-quiet px-2.5" />

            {/* Only logged-in customers have a cart. */}
            {user && (
              <Link
                to="/cart"
                className="btn-quiet relative px-2.5"
                aria-label={`Cart, ${cartCount} ${cartCount === 1 ? "item" : "items"}`}
              >
                <BagIcon />
                {cartCount > 0 && (
                  // key: a new number replays the little "pop", so people notice the change
                  <span
                    key={cartCount}
                    className="badge-pop absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-berry px-1 text-[11px] font-bold text-on-berry"
                  >
                    {cartCount}
                  </span>
                )}
              </Link>
            )}

            {user ? (
              <AccountMenu user={user} onLogout={logout} />
            ) : isChecking ? (
              // Checking a saved login: show nothing for a moment instead of "Log in".
              <span className="w-20" aria-hidden="true" />
            ) : (
              <button type="button" onClick={onLoginClick} className="btn-primary px-5 py-2">
                Log in
              </button>
            )}

            <button
              type="button"
              className="btn-quiet px-2.5 md:hidden"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
            >
              {menuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        </nav>

        {searchOpen && <SearchBar onClose={() => setSearchOpen(false)} />}

        {menuOpen && (
          <ul id="mobile-menu" className="slide-down border-t border-line px-4 py-3 md:hidden">
            {NAV_LINKS.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end={link.to === "/"}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `block rounded-xl px-3 py-3 font-semibold ${
                      isActive ? "bg-sand text-berry" : "text-ink"
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* The crochet trim under the Navbar */}
      <div className="scallop-down" aria-hidden="true" />
    </header>
  );
}

function SearchBar({ onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(event) {
    event.preventDefault();
    const search = query.trim();
    navigate(search ? `/catalog?${new URLSearchParams({ q: search })}` : "/catalog");
    onClose();
  }

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      className="slide-down border-t border-line px-4 py-4 sm:px-6"
      onKeyDown={(event) => event.key === "Escape" && onClose()}
    >
      <div className="relative mx-auto flex max-w-2xl items-center">
        <SearchIcon className="pointer-events-none absolute left-4 h-5 w-5 text-muted" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tote bags, yarn, keychains…"
          aria-label="Search products"
          className="input rounded-full py-3 pl-12 pr-28"
        />
        <button type="submit" className="btn-primary absolute right-1.5 px-4 py-2">
          Search
        </button>
      </div>
    </form>
  );
}

function AccountMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  // Close the menu when clicking anywhere else or pressing Escape.
  useEffect(() => {
    if (!open) return;
    function handleClick(event) {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    }
    function handleKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="btn-quiet px-2.5"
      >
        <UserIcon />
        <span className="hidden sm:inline">Hi, {user.first_name}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="pop-in card absolute right-0 top-full z-50 mt-2 w-60 origin-top-right p-2 shadow-lg shadow-shade/10"
        >
          <p className="truncate px-3 py-2 text-sm text-muted">{user.email}</p>
          <Link
            to="/orders"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-sand"
          >
            My orders
          </Link>
          {user.role === "admin" && (
            <Link
              to="/admin"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-berry hover:bg-sand"
            >
              Back office
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="w-full cursor-pointer rounded-xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-sand"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
