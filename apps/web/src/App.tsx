//Users/alexandredube-cote/entropy/pixelart-backbone/apps/web/src/App.tsx
import { Outlet, Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { API } from "./lib/api";

export default function App() {
  const [health, setHealth] = useState<string>("(checking...)");
  const loc = useLocation();

  useEffect(() => {
    fetch(`${API}/healthz`)
      .then(r => r.ok ? r.text() : Promise.reject(`${r.status}`))
      .then(t => setHealth(t))
      .catch(e => setHealth(`error: ${e}`));
  }, []);

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-10 bg-white/70 backdrop-blur border-b">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <Link to="/" className="font-semibold tracking-tight">PixelArt Assets</Link>
          <nav className="text-sm text-slate-600 flex gap-3">
            <Link to="/">Home</Link>
            <Link to="/tilesets">Tilesets</Link>
            <Link to="/scenes">Scenes</Link>
            <Link to="/characters/new">New Character</Link>
            <Link to="/tilesets#create-tileset">New Tileset</Link>
            <Link to="/settings">Settings</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 w-full">
        {/* shows nested pages */}
        <Outlet />
      </main>

      <footer className="mt-auto mx-auto max-w-5xl px-4 py-4 text-xs text-slate-500">
        <div>API: <code>{API}</code> — /healthz → <code>{health}</code></div>
        <div>Route: <code>{loc.pathname}</code></div>
      </footer>
    </div>
  );
}
