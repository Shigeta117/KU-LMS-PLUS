'use client';

import { ThemeProvider, useTheme } from 'next-themes';
import { Toaster } from 'sonner';

// ThemeProvider の内側でのみ useTheme が使えるため内部コンポーネントとして分離
function SonnerToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="bottom-center"
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      richColors
    />
  );
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="ku-theme"
      disableTransitionOnChange
    >
      {children}
      <SonnerToaster />
    </ThemeProvider>
  );
}
