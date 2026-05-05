import "./globals.css";
import type { Metadata } from "next";
import { ToastProvider } from "@/components/ui/toast";
import { Sidebar } from "@/components/Sidebar";
import { OnboardingBanner } from "@/components/OnboardingBanner";
import { SeedProvider } from "@/components/SeedProvider";

export const metadata: Metadata = {
  title: "CharacterAI — Build, evaluate, talk to characters",
  description:
    "A workshop for crafting AI characters with psychological depth and evaluating them with auto-pilot conversations.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground">
        <ToastProvider>
          <SeedProvider />
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex min-h-screen flex-1 flex-col">
              <OnboardingBanner />
              <div className="flex-1">{children}</div>
            </main>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
