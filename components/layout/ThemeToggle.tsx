"use client";

import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

const themeStorageKey = "agn.theme";

export function ThemeToggle() {
  function toggleTheme() {
    const nextTheme = document.documentElement.classList.contains("dark")
      ? "light"
      : "dark";

    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    document.documentElement.style.colorScheme = nextTheme;

    try {
      window.localStorage.setItem(themeStorageKey, nextTheme);
    } catch {
      // The visual theme still changes when browser storage is unavailable.
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
      title="Toggle color theme"
      aria-label="Toggle color theme"
      onClick={toggleTheme}
    >
      <Sun className="size-3.5 dark:hidden" aria-hidden="true" />
      <Moon className="hidden size-3.5 dark:block" aria-hidden="true" />
    </Button>
  );
}
