import React from "react";

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[Nora] Uncaught render error:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="fatal-error" role="alert">
        <div className="fatal-error__brand" aria-label="Nora">
          <img src="/star-white.png" alt="" />
          <span>NORA</span>
        </div>
        <p>Something went wrong. Please reload to continue.</p>
        <button onClick={() => window.location.reload()}>Reload Nora</button>
        {import.meta.env.DEV && <pre>{this.state.error.toString()}</pre>}
      </main>
    );
  }
}
