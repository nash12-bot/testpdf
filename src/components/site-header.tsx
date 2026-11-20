"use client";

import { NavigationMenuDemo } from "@/components/ui/demo";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="relative flex h-16 w-full items-center justify-center px-4 sm:px-6">
        {/* Centered Navigation Menu */}
        <NavigationMenuDemo />

        {/* Top-Right Theme Switcher Icon */}
        <div className="absolute right-4 sm:right-6 top-1/2 -translate-y-1/2 flex items-center z-10">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

export default SiteHeader;
