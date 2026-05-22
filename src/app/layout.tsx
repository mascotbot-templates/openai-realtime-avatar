import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "OpenAI Realtime Avatar Demo - MascotBot SDK",
  description:
    "Open-source example: OpenAI Realtime API (WebRTC) with the MascotBot lipsync SDK for real-time animated avatars",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
