import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { fetchMe, loginUser } from "../api/auth";
import { useToast } from "./ToastContext";

const AuthContext = createContext(null);
const TOKEN_KEY = "lacrochet-token";

// Pages only a logged-in person can use. Logging out on one of them goes home.
const MEMBERS_ONLY = ["/cart", "/checkout", "/orders", "/admin"];
const isMembersOnly = (path) => MEMBERS_ONLY.some((start) => path === start || path.startsWith(`${start}/`));

// "Remember me" → localStorage (survives closing the browser).
// Otherwise → sessionStorage (forgotten when the browser closes).
function readSavedToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function forgetToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage unavailable (e.g. private mode); nothing to clear.
  }
}

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { toast } = useToast();
  // Kept in refs so logout() never changes (navigate changes on every page).
  const pathRef = useRef(pathname);
  const navigateRef = useRef(navigate);
  useEffect(() => {
    pathRef.current = pathname; // the page they're on right now
    navigateRef.current = navigate;
  });

  const [token, setToken] = useState(readSavedToken);
  const [user, setUser] = useState(null);
  // True while we check a saved login when the site first opens.
  const [isChecking, setIsChecking] = useState(() => Boolean(readSavedToken()));

  // A login popup any page can open (e.g. when a guest clicks "Add to Cart"),
  // plus something to do once they've logged in.
  // "reason" finishes the sentence "Log in or create an account …" in the popup,
  // e.g. "to add this to your cart".
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const [loginReason, setLoginReason] = useState(null);
  const afterLoginRef = useRef(null);

  const requestLogin = useCallback((afterLogin = null, reason = null) => {
    afterLoginRef.current = afterLogin;
    setLoginReason(reason);
    setLoginPromptOpen(true);
  }, []);

  const closeLoginPrompt = useCallback(() => {
    afterLoginRef.current = null; // closed without logging in: forget it
    setLoginPromptOpen(false);
  }, []);

  // reason: "expired" when the saved login ran out, otherwise they clicked Log out.
  const logout = useCallback(
    (reason) => {
      forgetToken();
      setToken(null);
      setUser(null);
      if (isMembersOnly(pathRef.current)) navigateRef.current("/", { replace: true });
      toast(
        reason === "expired"
          ? { message: "Your login expired. Please log in again.", tone: "info" }
          : { message: "You're logged out. See you soon!", tone: "info" }
      );
    },
    [toast]
  );

  // When the site opens with a saved login, ask the server who it belongs to.
  useEffect(() => {
    if (!token) {
      setIsChecking(false);
      return;
    }

    let ignore = false;
    fetchMe(token)
      .then((profile) => {
        if (!ignore) setUser(profile);
      })
      .catch((error) => {
        // Expired or invalid login: log out. (A network hiccup keeps it.)
        if (!ignore && error.status === 401) logout("expired");
      })
      .finally(() => {
        if (!ignore) setIsChecking(false);
      });

    return () => {
      ignore = true;
    };
  }, [token, logout]);

  // quiet: no welcome message or redirect (used right after creating an account).
  async function login(email, password, rememberMe = false, { quiet = false } = {}) {
    const result = await loginUser(email, password, rememberMe);

    forgetToken();
    try {
      (rememberMe ? localStorage : sessionStorage).setItem(TOKEN_KEY, result.access_token);
    } catch {
      // Storage unavailable: stay logged in until the page is refreshed.
    }

    setUser(result.user);
    setToken(result.access_token);

    // Finish what they were doing before we asked them to log in.
    const afterLogin = afterLoginRef.current;
    afterLoginRef.current = null;
    afterLogin?.();

    if (!quiet) {
      const isOwner = result.user.role === "admin";
      // The owner logging in from a shop page goes straight to the back office.
      const openBackOffice = isOwner && !afterLogin && !isMembersOnly(pathRef.current);
      // Wait a moment so the login popup has closed before the message appears.
      setTimeout(() => {
        toast(`Welcome back, ${result.user.first_name}!`);
        if (openBackOffice) navigateRef.current("/admin");
      }, 0);
    }

    return result.user;
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isChecking,
        login,
        logout,
        loginPromptOpen,
        loginReason,
        requestLogin,
        closeLoginPrompt,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }
  return context;
}
