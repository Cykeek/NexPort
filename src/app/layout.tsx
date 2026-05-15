import "./globals.css";
import "@/fonts/fonts.css";
import localFont from "next/font/local";

const openRunde = localFont({
  src: [
    { path: "../fonts/OpenRunde-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/OpenRunde-Medium.woff2", weight: "500", style: "normal" },
    { path: "../fonts/OpenRunde-Semibold.woff2", weight: "600", style: "normal" },
    { path: "../fonts/OpenRunde-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={openRunde.variable}>
      <body>
        {children}
      </body>
    </html>
  );
}