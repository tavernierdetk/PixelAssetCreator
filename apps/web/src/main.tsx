// apps/web/src/main.tsx
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "./index.css";
import App from "./App";
import RootPage from "./pages/RootPage";
import CharacterDetailPage from "./pages/CharacterDetailPage";
import ProjectSettingsPage from "./pages/ProjectSettingsPage";

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <App />,
      children: [
        { index: true, element: <RootPage /> },
        { path: "characters/:slug", element: <CharacterDetailPage /> },
        { path: "settings", element: <ProjectSettingsPage /> },
      ],
    },
  ]
);

const qc = new QueryClient();

const container = document.getElementById("root")!;
let root: Root =
  (container as any).__root ??
  ((container as any).__root = createRoot(container));

root.render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
);

// HMR: unmount and clear marker so next eval re-mounts cleanly
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    root.unmount();
    delete (container as any).__root;
  });
}
