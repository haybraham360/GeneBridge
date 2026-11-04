import Sidebar from "@/components/dashboard/Sidebar";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
        <div className="flex h-screen overflow-hidden">
            <Sidebar />
            {children}
        </div>
  );
}
