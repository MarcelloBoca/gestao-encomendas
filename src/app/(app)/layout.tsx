import TabBar from "@/components/TabBar";
import { getContext } from "@/lib/session";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await getContext();
  return (
    <div className="app">
      {children}
      <TabBar />
    </div>
  );
}
