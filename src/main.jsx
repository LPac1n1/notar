import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./styles/index.css";

import App from "./App.jsx";
import { AuthProvider } from "./contexts/AuthContext";
import { installGlobalErrorHandlers, logError } from "./services/logger";

installGlobalErrorHandlers();

// Register the service worker so the app shell survives offline reloads.
// Only in production builds — dev mode runs through Vite's HMR, which
// would fight with the cached responses.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => {
        // SW failures are non-fatal — the app still works without it.
        logError("main.serviceWorker", err);
      });
  });
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
