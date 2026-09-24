import { MeetingsProvider } from "@/lib/store";
import Sidebar from "@/components/Sidebar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MeetingsProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 px-6 py-8 md:px-10">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </MeetingsProvider>
  );
}
