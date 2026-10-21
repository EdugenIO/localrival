import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Local Rival",
  description: "Your home ground for local competitive gaming.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
