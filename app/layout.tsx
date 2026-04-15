import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title:       "Monitoring Penyiram Tanaman — IoT ESP32",
  description: "Dashboard monitoring kelembaban tanah dan kontrol pompa berbasis IoT",
};

export const viewport: Viewport = {
  width:        "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
