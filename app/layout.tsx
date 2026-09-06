import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Nudelman/Veldran Thanksgiving 2026 · Portland, Oregon",
  description:
    "Schedule, lodging, flights and plans for the family Thanksgiving on the Oregon coast.",
  openGraph: {
    title: "Nudelman/Veldran Thanksgiving 2026",
    description: "Portland & Cannon Beach · November 21–29, 2026",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
