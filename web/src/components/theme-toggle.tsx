"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { MoonIcon, SunIcon, MonitorIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Three-way theme toggle: system → light → dark → system (…). Cycles on each
 * click. Shows the icon for the CURRENT theme choice (not the target). Avoids
 * a hydration mismatch by rendering a stable placeholder until mounted.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-label="Theme">
        <MonitorIcon />
      </Button>
    );
  }

  const cycle = () => {
    const next = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    setTheme(next);
  };

  const Icon = theme === "system" ? MonitorIcon : theme === "dark" ? MoonIcon : SunIcon;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycle}
      aria-label={`Theme: ${theme}. Click to cycle.`}
    >
      <Icon />
    </Button>
  );
}
