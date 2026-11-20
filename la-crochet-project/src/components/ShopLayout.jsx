import { Outlet } from "react-router";
import { useAuth } from "../context/AuthContext";
import ChatWidget from "./chat/ChatWidget";
import Footer from "./Footer";
import Navbar from "./Navbar";

// The frame around every shop page: Navbar on top, Footer at the bottom and the
// chat button in the corner. It stays on screen while pages change inside it,
// so the menu, cart badge and chat don't flash or reset between pages.
export default function ShopLayout() {
  const { requestLogin } = useAuth();

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Navbar onLoginClick={() => requestLogin()} />
      <Outlet />
      <Footer />
      <ChatWidget />
    </>
  );
}
