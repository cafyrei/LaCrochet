import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { getCounts } from "../../api/admin";
import { useAuth } from "../../context/AuthContext";
import LoginRequired from "../auth/LoginRequired";
import ThemeToggle from "../ThemeToggle";
import {
  ChatIcon,
  CloseIcon,
  FolderIcon,
  HomeIcon,
  LogoutIcon,
  MailIcon,
  MenuIcon,
  ReceiptIcon,
  StoreIcon,
  TagIcon,
} from "../Icons";

// The side menu. "count" names a number from /api/admin/counts shown as a badge.
const SECTIONS = [
  { to: "/admin", label: "Dashboard", icon: HomeIcon, end: true },
  { to: "/admin/orders", label: "Orders", icon: ReceiptIcon, count: "orders", countLabel: "to handle" },
  { to: "/admin/products", label: "Products", icon: TagIcon, count: "low_stock", countLabel: "running low" },
  { to: "/admin/categories", label: "Categories", icon: FolderIcon },
  { to: "/admin/messages", label: "Messages", icon: ChatIcon, count: "messages", countLabel: "new" },
  { to: "/admin/newsletter", label: "Newsletter", icon: MailIcon },
];

// The back office: its own frame (side menu, no shop navbar or footer).
// Only the shop owner gets past the gate.
export default function AdminLayout() {
  const { user, token, logout } = useAuth();
  const isAdmin = user?.role === "admin";
  const location = useLocation();
  const [counts, setCounts] = useState({});
  const [menuOpen, setMenuOpen] = useState(false);

  const refreshCounts = useCallback(() => {
    if (!token || !isAdmin) return;
    getCounts(token)
      .then(setCounts)
      .catch(() => {}); // the badges are a nice-to-have; never block the page
  }, [token, isAdmin]);

  // Fresh badge numbers on every page change; close the phone menu too.
  useEffect(() => {
    refreshCounts();
    setMenuOpen(false);
  }, [refreshCounts, location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event) => event.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [menuOpen]);

  if (!isAdmin) return <AdminGate loggedIn={Boolean(user)} />;

  // Logging out of the back office goes back to the shop's home page (see AuthContext).
  const handleLogout = () => logout();

  return (
    <div className="min-h-screen bg-cream lg:flex">
      {/* Phone and tablet: a top bar with a menu button */}
      <header className="night sticky top-0 z-30 flex items-center justify-between bg-ink px-4 py-3 text-cream lg:hidden">
        <Brand />
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          aria-expanded={menuOpen}
          aria-controls="admin-menu"
          className="cursor-pointer rounded-full p-2 hover:bg-white/10"
        >
          <MenuIcon />
        </button>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-40 bg-shade/50 lg:hidden" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      )}

      <aside
        id="admin-menu"
        className={`night fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-ink text-cream transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:shrink-0 lg:translate-x-0 ${
          menuOpen ? "visible translate-x-0" : "invisible -translate-x-full lg:visible"
        }`}
      >
        <div className="scallop-right absolute inset-y-0 -right-2.5 hidden lg:block" aria-hidden="true" />

        <div className="flex items-center justify-between px-6 pt-6 pb-8">
          <Brand />
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
            className="cursor-pointer rounded-full p-1.5 hover:bg-white/10 lg:hidden"
          >
            <CloseIcon />
          </button>
        </div>

        <nav aria-label="Back office" className="flex-1 space-y-1 overflow-y-auto px-3">
          {SECTIONS.map(({ to, label, icon: Icon, end, count, countLabel }) => {
            const number = count ? counts[count] ?? 0 : 0;
            return (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                    isActive ? "bg-cream text-ink" : "text-cream/80 hover:bg-white/10 hover:text-cream"
                  }`
                }
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="flex-1">{label}</span>
                {number > 0 && (
                  <span
                    className="rounded-full bg-terracotta px-2 py-0.5 text-xs font-bold text-ink tabular-nums"
                    title={`${number} ${countLabel}`}
                  >
                    {number}
                    <span className="sr-only"> {countLabel}</span>
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="space-y-1 border-t border-white/10 px-3 py-4">
          <Link
            to="/"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-cream/80 hover:bg-white/10 hover:text-cream"
          >
            <StoreIcon className="h-5 w-5" />
            View the shop
          </Link>
          <ThemeToggle
            withLabel
            className="flex w-full cursor-pointer items-center rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-cream/80 hover:bg-white/10 hover:text-cream"
          />
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-cream/80 hover:bg-white/10 hover:text-cream"
          >
            <LogoutIcon className="h-5 w-5" />
            Log out
          </button>
          <p className="truncate px-3 pt-2 text-xs text-cream/50">Signed in as {user.email}</p>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:px-12 lg:py-10">
        {/* key: each back-office page fades in when you switch sections */}
        <div key={location.pathname} className="page-enter mx-auto max-w-6xl">
          <Outlet context={{ refreshCounts }} />
        </div>
      </main>
    </div>
  );
}

function Brand() {
  return (
    <Link to="/admin" className="leading-tight">
      <span className="block font-serif text-xl font-semibold">La Crochet</span>
      <span className="block text-xs text-cream/60">Back office</span>
    </Link>
  );
}

// Shown instead of the back office to guests and customers.
function AdminGate({ loggedIn }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-4 py-12">
      <Link to="/" className="font-serif text-2xl font-semibold text-ink">
        La Crochet
      </Link>
      <div className="mt-8 w-full max-w-md">
        {loggedIn ? (
          <div className="card px-6 py-12 text-center">
            <h1 className="text-2xl font-semibold">This area is for the shop owner</h1>
            <p className="mt-2 text-muted">Your account doesn't have access to the back office.</p>
            <Link to="/" className="btn-primary mt-6">
              Back to the shop
            </Link>
          </div>
        ) : (
          <LoginRequired title="Back office" message="Log in with the shop owner's account to manage the shop." />
        )}
      </div>
    </div>
  );
}
