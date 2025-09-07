import { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { render } from "@testing-library/react";

export function renderWithProviders(ui: React.ReactElement, route = "/") {
  const qc = new QueryClient();
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }
  return render(ui, { wrapper: Wrapper as any });
}
