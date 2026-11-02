import { MobileBar, Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { SecondaryNav } from './secondary-nav';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="md:pl-[92px]">
        <Topbar />
        <div className="mx-auto grid w-full max-w-[1560px] gap-4 px-4 pb-32 md:px-6 lg:grid-cols-[290px_minmax(0,1fr)] lg:gap-5 lg:pb-8">
          <SecondaryNav />
          <main className="min-w-0">{children}</main>
        </div>
      </div>
      <MobileBar />
    </div>
  );
}
