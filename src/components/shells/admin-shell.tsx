"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "../../app/layout.module.css";
import {
  LayoutDashboard,
  Users,
  Wallet,
  Landmark,
  Vote,
  Coins,
  BarChart3,
  Search,
  Bell,
  Sun,
  Moon,
  Menu,
  X,
  LogOut,
  Building2,
  HelpCircle,
  Settings2,
} from "lucide-react";
import { SignOutButton } from "@/components/auth/sign-out-button";

interface AppShellProps {
  children: React.ReactNode;
  userEmail?: string;
}

export default function AdminShell({
  children,
  userEmail,
}: AppShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [searchQuery, setSearchQuery] = useState("");
  const [notificationCount, setNotificationCount] = useState(3);
  const userName = userEmail ?? "Administrator";
  const initials = userName
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((value) => value[0]?.toUpperCase())
    .join("") || "IC";

  // Initialize theme from localStorage or system preference
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "dark" | "light" | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute("data-theme", savedTheme);
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const initialTheme = prefersDark ? "dark" : "light";
      setTheme(initialTheme);
      document.documentElement.setAttribute("data-theme", initialTheme);
    }
  }, []);

  const toggleTheme = (newTheme: "dark" | "light") => {
    setTheme(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
  };

  const navItems = [
    { name: "Dashboard", path: "/admin", icon: LayoutDashboard },
    { name: "Members Directory", path: "/admin/members", icon: Users },
    { name: "Share Capital", path: "/admin/shares", icon: Coins },
    { name: "Savings Management", path: "/admin/finance", icon: Wallet },
    { name: "Loan Processing", path: "/admin/loans", icon: Landmark },
    { name: "Reports & Exports", path: "/admin/reports", icon: BarChart3 },
    { name: "Governance & Voting", path: "/admin/governance", icon: Vote },
    { name: "System Settings", path: "/admin/settings", icon: Settings2 },
  ];

  return (
    <div className={styles.wrapper}>
      {/* Sidebar navigation */}
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.logoContainer}>
          <div className={styles.logoIcon}>
            <Building2 size={20} />
          </div>
          <div>
            <h1 className={styles.logoText}>Ifemelumma</h1>
            <span className={styles.logoSub}>Cooperative Society</span>
          </div>
        </div>

        <nav className={styles.navSection}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.path === "/admin"
                ? pathname === item.path
                : pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`${styles.navLink} ${isActive ? styles.activeNavLink : ""}`}
              >
                <Icon size={18} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.userSummary}>
            <div className={styles.avatar}>{initials}</div>
            <div className={styles.userInfo}>
              <span className={styles.userName}>{userName}</span>
              <span className={styles.userRole}>Administrative access</span>
            </div>
          </div>
          <SignOutButton
            className={styles.navLink}
            icon={<LogOut size={16} />}
            label="Sign out"
          />
        </div>
      </aside>

      {/* Main Container */}
      <div className={styles.mainContainer}>
        {/* Top Header */}
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <button className={styles.menuBtn} onClick={() => setSidebarOpen(!sidebarOpen)}>
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            
            <div className={styles.searchBar}>
              <Search size={16} className={styles.searchIcon} style={{ color: "var(--text-muted)" }} />
              <input
                type="text"
                placeholder="Search members, loans, approvals..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.searchInput}
              />
            </div>
          </div>

          <div className={styles.headerRight}>
            <div className={styles.themeSelector}>
              <button
                className={`${styles.themeOption} ${theme === "light" ? styles.themeOptionActive : ""}`}
                onClick={() => toggleTheme("light")}
                title="Switch to light mode"
              >
                <Sun size={15} />
              </button>
              <button
                className={`${styles.themeOption} ${theme === "dark" ? styles.themeOptionActive : ""}`}
                onClick={() => toggleTheme("dark")}
                title="Switch to dark mode"
              >
                <Moon size={15} />
              </button>
            </div>

            <button 
              className={styles.iconBtn} 
              onClick={() => setNotificationCount(0)}
              title="Notifications"
            >
              <Bell size={18} />
              {notificationCount > 0 && <span className={styles.badgeDot} />}
            </button>

            <button className={styles.iconBtn} title="System Help Center">
              <HelpCircle size={18} />
            </button>
          </div>
        </header>

        {/* Dynamic page content */}
        <main className={styles.pageBody}>
          {children}
        </main>
      </div>
    </div>
  );
}
