import type { ReactNode } from 'react';
import Header from './Header';
import Footer from './Footer';
import BottomNav from './BottomNav';

export default function Layout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="min-h-screen flex flex-col bg-bg text-fg">
      <Header />
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 sm:px-6 pt-4 pb-32" id="main">
        {children}
      </main>
      <Footer />
      <BottomNav />
    </div>
  );
}
