import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./styles/index.css";

import App from "./App.jsx";
import { AuthProvider } from "./contexts/AuthContext";
import { installGlobalErrorHandlers } from "./services/logger";

installGlobalErrorHandlers();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
