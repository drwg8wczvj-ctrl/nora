export function AppLoadingScreen() {
  return (
    <main className="app-loading" aria-label="Loading Nora" aria-busy="true">
      <img className="app-loading-mark" src="/star-white.png" alt="" />
      <span className="app-loading-label">NORA</span>
    </main>
  );
}
