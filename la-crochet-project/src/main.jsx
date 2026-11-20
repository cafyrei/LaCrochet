import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Router from "./Router";
import "./index.css";

// The login, cart and message providers are set up inside Router.jsx.
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Router />
  </StrictMode>,
);
