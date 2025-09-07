import React from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks (must be declared BEFORE importing the component) ---

// Any motion.* becomes a pass-through <div> that renders children.
// Typed so TS doesn't complain.
vi.mock("framer-motion", () => {
  const Noop = (props: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) =>
    React.createElement("div", props, props.children);

  const handler: ProxyHandler<Record<string, unknown>> = {
    get: () => Noop,
  };

  return { __esModule: true, motion: new Proxy({}, handler) };
});

// Keep navigate harmless & observable
const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => {
  const mod: any = await orig();
  return { ...mod, useNavigate: () => navigateMock };
});

// Mock API methods used by the page
vi.mock("@/lib/api", () => ({
  validateLite: vi.fn().mockResolvedValue({ ok: true }),
  commitLite: vi.fn().mockResolvedValue({
    ok: true,
    slug: "stubby",
    file: "/abs/path.png",
  }),
}));

// --- Imports AFTER mocks ---
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils";
import IntakePage from "./IntakePage";
import { validateLite, commitLite } from "@/lib/api";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("IntakePage", () => {
  it("submits a valid definition and navigates", async () => {
    const user = userEvent.setup();
    renderWithProviders(<IntakePage />);

    screen.debug(undefined, Infinity);


    // Fill the form
    const nameInput = await screen.findByLabelText(/character name/i);
    await user.type(nameInput, "Stubby");

    await user.type(screen.getByLabelText(/desire/i), "x");
    await user.type(screen.getByLabelText(/fear/i), "y");
    await user.type(screen.getByLabelText(/flaw/i), "z");
    await user.type(screen.getByLabelText(/traits/i), "brave, witty");

    // Validate then Save
    await user.click(await screen.findByRole("button", { name: /validate/i }));
    expect(validateLite).toHaveBeenCalledTimes(1);

    await user.click(await screen.findByRole("button", { name: /save & continue/i }));
    expect(commitLite).toHaveBeenCalledTimes(1);

    // UI hint & navigation
    expect(await screen.findByText(/derived slug/i)).toBeInTheDocument();
    expect(navigateMock).toHaveBeenCalledWith("/characters/stubby");
  });
});
