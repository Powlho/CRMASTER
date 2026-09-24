import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { MeetingsProvider } from "@/lib/store";
import Sidebar from "@/components/Sidebar";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  title: "CRMASTER — Réunions",
  description: "Enregistrez vos réunions et préparez leur transcription automatique.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={jakarta.variable}>
      <body>
        <MeetingsProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 px-6 py-8 md:px-10">
              <div className="mx-auto max-w-5xl">{children}</div>
            </main>
          </div>
        </MeetingsProvider>
      </body>
    </html>
  );
}
