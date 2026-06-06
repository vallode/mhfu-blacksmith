import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MHFU Blacksmith",
  description: "Monster Hunter Freedom Unite — weapons, armor, decorations, monsters",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
