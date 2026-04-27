import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { ShopProvider } from "./shop/ShopProvider";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import "./styles/index.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root not found");
createRoot(container).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <ShopProvider>
          <App />
        </ShopProvider>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
