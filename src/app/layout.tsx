import "./globals.css";
import "@/fonts/fonts.css";
import { Geist } from "next/font/google";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={`font-sans ${geist.variable}`}>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}