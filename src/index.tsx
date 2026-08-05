import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import "./i18n";
import App from "./App";
import { AppErrorBoundary } from "./app/AppErrorBoundary";
import "./app/appShell.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root application element");

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
