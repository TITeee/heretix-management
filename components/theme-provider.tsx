"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"

// next-themes injects an inline <script> to set the theme before hydration
// (avoids a flash of the wrong theme). React 19 logs a dev-only warning for
// any <script> rendered by a component, even though this one only ever runs
// server-side — harmless, but noisy. Not yet fixed upstream:
// https://github.com/pacocoursey/next-themes/issues/387
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  const originalError = console.error
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("Encountered a script tag")) return
    originalError.apply(console, args)
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      {children}
    </NextThemesProvider>
  )
}
