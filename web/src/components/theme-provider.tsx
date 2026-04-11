"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Thin wrapper around next-themes `ThemeProvider`. Mounted in the root layout
 * so the whole app can consume `useTheme()` and so the `class="dark"` toggle
 * cascades to every `.dark` selector in `globals.css` + the generated
 * `tokens.css`.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
