import { useEffect } from "react";
import { BrowserRouter, Link, Routes, Route, useLocation } from "react-router";
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { ToastProvider } from "./context/ToastContext";
import ShopLayout from "./components/ShopLayout";

import LandingPage from "./pages/LandingPage";
import CatalogPage from "./pages/CatalogPage";
import ProductPage from "./pages/ProductPage";
import Cart from "./pages/Cart";
import CheckoutPage from "./pages/CheckoutPage";
import OrderConfirmationPage from "./pages/OrderConfirmationPage";
import MyOrdersPage from "./pages/MyOrdersPage";
import AboutPage from "./pages/AboutPage";
import ContactPage from "./pages/ContactPage";
import HelpPage from "./pages/HelpPage";
import PolicyPage from "./pages/PolicyPage";
import NotFoundPage from "./pages/NotFoundPage";
import AdminLayout from "./components/admin/AdminLayout";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import AdminOrdersPage from "./pages/admin/AdminOrdersPage";
import AdminProductsPage from "./pages/admin/AdminProductsPage";
import AdminCategoriesPage from "./pages/admin/AdminCategoriesPage";
import AdminNewsletterPage from "./pages/admin/AdminNewsletterPage";
import AdminMessagesPage from "./pages/admin/AdminMessagesPage";
import LoginPrompt from "./components/auth/LoginPrompt";

// Opens every new page at the top, or at the #section the link points to.
function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const section = document.getElementById(hash.slice(1));
      if (section) {
        section.scrollIntoView();
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return null;
}

// The providers live inside the router so logging in and out can move
// people to the right page (e.g. home after logging out of My orders).
export default function Router() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <CartProvider>
            <ScrollToTop />
            <LoginPrompt />
            <AppRoutes />
          </CartProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

function AppRoutes() {
  return (
    <Routes>
      {/* The shop: one Navbar, Footer and chat button shared by every page,
          so they stay put (and keep their state) while the page changes. */}
      <Route element={<ShopLayout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/products/:productId" element={<ProductPage />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/order-confirmation" element={<OrderConfirmationPage />} />
        <Route path="/orders" element={<MyOrdersPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/terms" element={<PolicyPage type="terms" />} />
        <Route path="/privacy" element={<PolicyPage type="privacy" />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* The back office: its own layout with a side menu, owner only. */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboardPage />} />
        <Route path="orders" element={<AdminOrdersPage />} />
        <Route path="products" element={<AdminProductsPage />} />
        <Route path="categories" element={<AdminCategoriesPage />} />
        <Route path="messages" element={<AdminMessagesPage />} />
        <Route path="newsletter" element={<AdminNewsletterPage />} />
        <Route path="*" element={<AdminNotFound />} />
      </Route>
    </Routes>
  );
}

// A back-office address that doesn't exist (e.g. a mistyped link).
function AdminNotFound() {
  return (
    <div className="card px-6 py-14 text-center">
      <h1 className="text-2xl font-semibold">This back-office page doesn't exist</h1>
      <p className="mt-2 text-muted">It may have moved, or the link has a typo.</p>
      <Link to="/admin" className="btn-primary mt-6">
        Go to the dashboard
      </Link>
    </div>
  );
}
