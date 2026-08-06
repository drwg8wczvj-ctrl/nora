import React from "react";
import { render, screen } from "@testing-library/react";
import BrandStar, { BrandLockup } from "./BrandStar";

test("uses the supplied star artwork for black and white marks", () => {
  const { rerender } = render(<BrandStar tone="black" label="Nora" size={30} />);
  expect(screen.getByRole("img", { name: "Nora" })).toHaveAttribute("src", "/star-black.png");

  rerender(<BrandStar tone="white" label="Nora" />);
  expect(screen.getByRole("img", { name: "Nora" })).toHaveAttribute("src", "/star-white.png");
});

test("keeps decorative brand stars out of the accessibility tree", () => {
  render(<BrandStar tone="purple" />);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

test("colored marks use the shared artwork mask with an accessible label", () => {
  render(<BrandStar tone="gold" label="Atlas" />);
  expect(screen.getByRole("img", { name: "Atlas" })).toHaveClass("brand-star--gold");
});

test("brand lockups keep the supplied mark and wordmark together", () => {
  render(<BrandLockup label="NORA" tone="white" />);
  expect(screen.getByLabelText("NORA")).toHaveTextContent("NORA");
  expect(screen.getByRole("presentation", { hidden: true })).toHaveAttribute("src", "/star-white.png");
});
