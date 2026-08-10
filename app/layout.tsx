import type { Metadata } from "next";
import Link from "next/link";
import {
  BarChart3,
  FileText,
  Home,
  Inbox,
  LayoutDashboard,
  Map,
  Scale,
  Search,
  Settings
} from "lucide-react";

import "./globals.css";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/properties", label: "Properties", icon: Home },
  { href: "/listing-alerts", label: "Listing Alerts", icon: Inbox },
  { href: "/compare", label: "Compare", icon: Scale },
  { href: "/map", label: "Map", icon: Map },
  { href: "/profiles", label: "Search Profiles", icon: Search },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings }
];

export const metadata: Metadata = {
  title: "RE Acquisition Assistant",
  description: "Private real-estate acquisition decision support."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
            <div className="mx-auto flex max-w-screen-2xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
              <Link
                href="/profiles"
                className="flex min-w-0 items-center gap-3 font-semibold"
              >
                <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Home className="size-4" aria-hidden="true" />
                </span>
                <span className="truncate">RE Acquisition Assistant</span>
              </Link>
              <nav className="ml-auto hidden items-center gap-1 xl:flex">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const enabled =
                    item.href === "/profiles" ||
                    item.href === "/properties" ||
                    item.href === "/listing-alerts" ||
                    item.href === "/";

                  return (
                    <Link
                      key={item.href}
                      href={enabled ? item.href : "/profiles"}
                      className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      aria-disabled={!enabled}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
