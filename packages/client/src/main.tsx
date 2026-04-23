import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root not found");
createRoot(container).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
