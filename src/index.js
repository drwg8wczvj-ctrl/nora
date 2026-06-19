import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { crashed: true, error };
  }
  componentDidCatch(error, info) {
    console.error("[Nora] Uncaught render error:", error, info);
  }
  render() {
    if (this.state.crashed) {
      return (
        <div style={{
          minHeight: "100dvh", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "#0e0d1e", color: "#e2e2f0",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          padding: 32, textAlign: "center", gap: 16,
        }}>
          <img src="/logo-dark.png" alt="Nora" style={{ height: 48, opacity: .8 }} />
          <p style={{ margin: 0, fontSize: 16, opacity: .7 }}>Something went wrong. Please reload to continue.</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: "#8b5cf6", color: "#fff", border: "none",
              borderRadius: 12, padding: "12px 28px",
              fontSize: 15, fontWeight: 600, cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Reload Nora
          </button>
          {this.state.error && (
            <pre style={{ fontSize: 11, opacity: .6, maxWidth: 380, overflowX: "auto", textAlign: "left", marginTop: 8, padding: 12, background: "rgba(255,255,255,.05)", borderRadius: 8, whiteSpace: "pre-wrap" }}>
              {this.state.error.toString()}
              {"\n\n"}
              {this.state.error.stack?.split("\n").slice(0, 6).join("\n")}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

reportWebVitals();