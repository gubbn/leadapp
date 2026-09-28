import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: {
    default: "Fixing IT Growth Desk",
    template: "%s · Fixing IT",
  },
  description: "The relationship, sales and marketing workspace for Fixing IT.",
  applicationName: "Fixing IT Growth Desk",
  openGraph: {
    type: "website",
    title: "Fixing IT Growth Desk",
    description: "Relationships. Revenue. Momentum.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Fixing IT Growth Desk" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Fixing IT Growth Desk",
    description: "Relationships. Revenue. Momentum.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
