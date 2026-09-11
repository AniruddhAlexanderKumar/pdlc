import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders its children as an accessible button", () => {
    render(<Button>Save changes</Button>);
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("applies variant-specific styling", () => {
    render(<Button variant="destructive">Delete</Button>);
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("bg-destructive");
  });

  it("respects the disabled prop", () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole("button", { name: "Disabled" })).toBeDisabled();
  });

  it("renders as its child element when asChild is set", () => {
    render(
      <Button asChild>
        <a href="/dashboard">Go to dashboard</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Go to dashboard" });
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe("A");
  });
});
