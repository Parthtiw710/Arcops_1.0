"use client";

import React, { useState } from "react";
import { Book, Cpu, Database, HardDrive, KeyRound, Menu, Server, ShieldCheck, Sunset, Trees, Zap, Terminal, ChevronDown, LayoutDashboard, Table, Network, LogOut } from "lucide-react";
import { SqlDrawer } from "@/components/sql-drawer";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface MenuItem {
  title: string;
  url: string;
  description?: string;
  icon?: React.ReactNode;
  items?: MenuItem[];
}

interface NavbarProps {
  className?: string;
  logo?: {
    url: string;
    src: string;
    alt: string;
    title: string;
    className?: string;
  };
  menu?: MenuItem[];
  auth?: {
    login: {
      title: string;
      url: string;
    };
  };
}

const Navbar = ({
  logo = {
    url: "/",
    src: "/favicon.ico",
    alt: "ArcOps Logo",
    title: "ArcOps",
  },
  menu = [
    {
      title: "Dashboard",
      url: "/dashboard",
    },
    {
      title: "Products",
      url: "#",
      items: [
        {
          title: "ArcAuth",
          description: "Unified identity, OTP, OAuth & API Key engine",
          icon: <ShieldCheck className="size-5 shrink-0" />,
          url: "/arcauth",
        },
        {
          title: "DBMux",
          description: "High-performance database proxy & connection pooling",
          icon: <Database className="size-5 shrink-0" />,
          url: "/dbmux",
        },
        {
          title: "BuckStream",
          description: "S3-compatible object storage & asset pipeline",
          icon: <HardDrive className="size-5 shrink-0" />,
          url: "/buckstream",
        },
        {
          title: "Frontedge",
          description: "GitHub repo → Cloudflare Pages edge deployment engine",
          icon: <Zap className="size-5 shrink-0" />,
          url: "/frontedge",
        },
      ],
    },
    {
      title: "Resources",
      url: "#",
      items: [
        {
          title: "Self-Host BuckStream",
          description: "SKILLS.md deployment manifest for BuckStream S3 pipeline",
          icon: <Server className="size-5 shrink-0" />,
          url: "https://github.com/parthtiw710/buckstream/blob/main/SKILLS.md",
        },
        {
          title: "Self-Host DBMux",
          description: "skills.md deployment manifest for DBMux connection proxy",
          icon: <Cpu className="size-5 shrink-0" />,
          url: "https://github.com/parthtiw710/dbmux/blob/main/skills.md",
        },
      ],
    },
    {
      title: "Consoles",
      url: "#",
      items: [
        {
          title: "Frontedge Console",
          description: "Deploy GitHub frontend repositories to Cloudflare Pages edge network",
          icon: <Zap className="size-5 shrink-0" />,
          url: "/frontedge-console",
        },
        {
          title: "Tables",
          description: "Browse database tables, columns, and row counts",
          icon: <Database className="size-5 shrink-0" />,
          url: "/tables",
        },
        {
          title: "Schema Visualizer",
          description: "Interactive ER diagram with foreign key relationships",
          icon: <Server className="size-5 shrink-0" />,
          url: "/schema-visualizer",
        },
        {
          title: "SQL Query Editor",
          description: "Execute custom SQL queries against live PostgreSQL via DBMux",
          icon: <Terminal className="size-5 shrink-0" />,
          url: "#sql-editor",
        },
      ],
    },
  ],
  auth = {
    login: { title: "Login", url: "/login" },
  },
  className,
}: NavbarProps) => {
  const [isSqlDrawerOpen, setIsSqlDrawerOpen] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(() => {
    try {
      const saved = localStorage.getItem("arcauth_user") || localStorage.getItem("authx_user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  React.useEffect(() => {
    // Process OAuth redirect params (?token=...&user=...)
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get("token");
    const userParam = params.get("user");

    if (tokenParam && userParam) {
      try {
        localStorage.setItem("arcauth_token", tokenParam);
        localStorage.setItem("authx_token", tokenParam);
        localStorage.setItem("arcauth_user", userParam);
        localStorage.setItem("authx_user", userParam);
        setCurrentUser(JSON.parse(userParam));
        window.dispatchEvent(new Event("arcauth_login_success"));
        window.dispatchEvent(new Event("authx_login_success"));
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (err) {
        console.error("Failed to parse OAuth user param", err);
      }
    }

    const handleAuthChange = () => {
      try {
        const saved = localStorage.getItem("arcauth_user") || localStorage.getItem("authx_user");
        setCurrentUser(saved ? JSON.parse(saved) : null);
      } catch {
        setCurrentUser(null);
      }
    };

    const handleOpenDrawer = () => setIsSqlDrawerOpen(true);

    window.addEventListener("arcauth_login_success", handleAuthChange);
    window.addEventListener("authx_login_success", handleAuthChange);
    window.addEventListener("arcauth_logout", handleAuthChange);
    window.addEventListener("authx_logout", handleAuthChange);
    window.addEventListener("open_sql_drawer", handleOpenDrawer);
    window.addEventListener("storage", handleAuthChange);
    return () => {
      window.removeEventListener("arcauth_login_success", handleAuthChange);
      window.removeEventListener("authx_login_success", handleAuthChange);
      window.removeEventListener("arcauth_logout", handleAuthChange);
      window.removeEventListener("authx_logout", handleAuthChange);
      window.removeEventListener("open_sql_drawer", handleOpenDrawer);
      window.removeEventListener("storage", handleAuthChange);
    };
  }, []);

  const [isVisible, setIsVisible] = useState(true);
  const [isNavHovered, setIsNavHovered] = useState(false);

  React.useEffect(() => {
    let lastY = window.scrollY;

    const handleScroll = () => {
      const currentY = window.scrollY;
      if (currentY < 20) {
        setIsVisible(true);
      } else if (currentY > lastY && currentY > 80) {
        if (!isNavHovered && !isProfileDropdownOpen) {
          setIsVisible(false);
        }
      } else if (currentY < lastY) {
        setIsVisible(true);
      }
      lastY = currentY;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isNavHovered || isProfileDropdownOpen) {
        setIsVisible(true);
        return;
      }
      const topThreshold = window.innerHeight * 0.35; // Exactly 35vh
      if (e.clientY <= topThreshold) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [isNavHovered, isProfileDropdownOpen]);

  const navRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("arcauth_token");
    localStorage.removeItem("authx_token");
    localStorage.removeItem("arcauth_user");
    localStorage.removeItem("authx_user");
    setCurrentUser(null);
    window.dispatchEvent(new Event("arcauth_login_success"));
    window.dispatchEvent(new Event("authx_login_success"));
  };

  return (
    <header
      ref={navRef}
      onMouseEnter={() => {
        setIsNavHovered(true);
        setIsVisible(true);
      }}
      onMouseLeave={() => {
        setIsNavHovered(false);
        setIsProfileDropdownOpen(false);
      }}
      className={cn(
        "fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[95vw] max-w-7xl px-5 py-2.5 rounded-2xl border border-neutral-800/80 bg-neutral-950/80 backdrop-blur-md shadow-2xl transition-all duration-300 ease-in-out",
        isVisible || isNavHovered || isProfileDropdownOpen ? "translate-y-0 opacity-100 pointer-events-auto" : "-translate-y-[160%] opacity-0 pointer-events-none",
        className
      )}
    >
      <div className="w-full mx-auto">
        {/* Desktop Menu */}
        <nav className="hidden items-center justify-between lg:flex">
          <div className="flex items-center gap-8">
            {/* Logo */}
            <a href={logo.url} className="flex items-center gap-2.5">
              <img
                src={logo.src}
                className="max-h-9 w-auto"
                alt={logo.alt}
              />
              <span className="text-2xl font-black tracking-tight font-['Outfit'] text-foreground">
                {logo.title}
              </span>
            </a>
            <div className="flex items-center gap-1">
              <NavigationMenu>
                <NavigationMenuList>
                  {menu.map((item) => renderMenuItem(item))}
                </NavigationMenuList>
              </NavigationMenu>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {currentUser ? (
              <div className="relative">
                {/* Profile Avatar Only Button */}
                <button
                  type="button"
                  onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                  className={cn(
                    "relative size-8 rounded-full border border-purple-500/40 hover:border-purple-400 p-0.5 shadow-md transition-all cursor-pointer group overflow-hidden focus:outline-none",
                    isProfileDropdownOpen && "ring-2 ring-purple-500/50 border-purple-400"
                  )}
                  title={currentUser.full_name || currentUser.email || "Account Menu"}
                >
                  <img
                    src={currentUser.avatar_url || currentUser.image || "/profile.png"}
                    alt={currentUser.full_name || "Profile"}
                    className="w-full h-full rounded-full object-cover group-hover:scale-110 transition-transform"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/profile.png";
                    }}
                  />
                </button>

                {/* Profile Dropdown Popover */}
                {isProfileDropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-neutral-800 bg-[#121215]/95 p-2 shadow-2xl backdrop-blur-xl z-50 text-xs animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-3 py-2 border-b border-neutral-800/80 mb-1">
                      <p className="font-bold text-white truncate">{currentUser.full_name || "User Account"}</p>
                      <p className="text-[11px] font-mono text-neutral-400 truncate">{currentUser.email || "Authenticated"}</p>
                    </div>

                    <div className="space-y-0.5">
                      <a
                        href="/dashboard"
                        onClick={() => setIsProfileDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition-all font-medium"
                      >
                        <LayoutDashboard className="size-4 text-purple-400" />
                        Dashboard
                      </a>
                      <a
                        href="/tables"
                        onClick={() => setIsProfileDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition-all font-medium"
                      >
                        <Table className="size-4 text-purple-400" />
                        Tables Browser
                      </a>
                      <a
                        href="/schema"
                        onClick={() => setIsProfileDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition-all font-medium"
                      >
                        <Network className="size-4 text-purple-400" />
                        Schema ERD
                      </a>
                      <a
                        href="/storage"
                        onClick={() => setIsProfileDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition-all font-medium"
                      >
                        <HardDrive className="size-4 text-purple-400" />
                        BuckStream S3
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          setIsProfileDropdownOpen(false);
                          window.dispatchEvent(new Event("open_sql_drawer"));
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition-all font-medium text-left cursor-pointer"
                      >
                        <Terminal className="size-4 text-purple-400" />
                        SQL Query Editor
                      </button>
                    </div>

                    <div className="border-t border-neutral-800/80 mt-1 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsProfileDropdownOpen(false);
                          handleLogout();
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all font-medium text-left cursor-pointer"
                      >
                        <LogOut className="size-4 text-red-400" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Button
                variant="outline"
                size="default"
                className="px-6 text-base font-bold border-[#7950ee] text-purple-300 hover:bg-[#7950ee]/15 hover:text-white transition-all shadow-sm"
                render={<a href={auth.login.url} />}
                nativeButton={false}
              >
                {auth.login.title}
              </Button>
            )}

            {/* Global SQL Editor Terminal Button */}
            <button
              onClick={() => {
                const token = localStorage.getItem("arcauth_token") || localStorage.getItem("authx_token");
                if (!token) {
                  window.location.href = "/login";
                } else {
                  window.dispatchEvent(new Event("open_sql_drawer"));
                }
              }}
              title="Open SQL Query Editor"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#7950ee]/60 bg-[#7950ee]/10 text-purple-300 hover:bg-[#7950ee]/20 hover:text-white hover:border-[#7950ee] transition-all cursor-pointer shadow-sm text-xs font-mono font-bold shrink-0"
            >
              <Terminal className="size-3.5 text-purple-400" />
              <span>SQL Editor</span>
            </button>
          </div>
        </nav>

        {/* Mobile Menu */}
        <div className="block lg:hidden">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <a href={logo.url} className="flex items-center gap-2">
              <img
                src={logo.src}
                className="max-h-8 w-auto"
                alt={logo.alt}
              />
              <span className="text-lg font-semibold tracking-tighter">
                {logo.title}
              </span>
            </a>
            <Sheet>
              <SheetTrigger render={<Button variant="outline" size="icon" />}><Menu className="size-4" /></SheetTrigger>
              <SheetContent className="overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>
                    <a href={logo.url} className="flex items-center gap-2">
                      <img
                        src={logo.src}
                        className="max-h-8 w-auto"
                        alt={logo.alt}
                      />
                      <span className="text-lg font-semibold tracking-tighter">
                        {logo.title}
                      </span>
                    </a>
                  </SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-6 p-4">
                  <Accordion
                    className="flex w-full flex-col gap-4"
                  >
                    {menu.map((item) => renderMobileMenuItem(item))}
                  </Accordion>

                  <div className="flex flex-col gap-3">
                    <Button variant="outline" className="border-[#7950ee] text-purple-300 hover:bg-[#7950ee]/15" render={<a href={auth.login.url} />} nativeButton={false}>{auth.login.title}</Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
};

const renderMenuItem = (item: MenuItem) => {
  if (item.items) {
    return (
      <NavigationMenuItem key={item.title}>
        <NavigationMenuTrigger>{item.title}</NavigationMenuTrigger>
        <NavigationMenuContent className="bg-popover text-popover-foreground">
          {item.items.map((subItem) => (
            <NavigationMenuLink key={subItem.title} className="w-80" render={<SubMenuLink item={subItem} />}></NavigationMenuLink>
          ))}
        </NavigationMenuContent>
      </NavigationMenuItem>
    );
  }

  return (
    <NavigationMenuItem key={item.title}>
      <NavigationMenuLink
        href={item.url}
        className="group inline-flex h-11 w-max items-center justify-center rounded-md bg-transparent px-5 py-2 text-base font-semibold transition-colors hover:bg-muted hover:text-accent-foreground"
      >
        {item.title}
      </NavigationMenuLink>
    </NavigationMenuItem>
  );
};

const renderMobileMenuItem = (item: MenuItem) => {
  if (item.items) {
    return (
      <AccordionItem key={item.title} value={item.title} className="border-b-0">
        <AccordionTrigger className="text-md py-0 font-semibold hover:no-underline">
          {item.title}
        </AccordionTrigger>
        <AccordionContent className="mt-2">
          {item.items.map((subItem) => (
            <SubMenuLink key={subItem.title} item={subItem} />
          ))}
        </AccordionContent>
      </AccordionItem>
    );
  }

  return (
    <a key={item.title} href={item.url} className="text-md font-semibold">
      {item.title}
    </a>
  );
};

const SubMenuLink = ({ item }: { item: MenuItem }) => {
  return (
    <a
      className="flex min-w-80 flex-row gap-4 rounded-lg p-3 leading-none no-underline transition-colors outline-none select-none hover:bg-muted hover:text-accent-foreground cursor-pointer"
      href={item.url}
      onClick={(e) => {
        if (item.url === "#sql-editor") {
          e.preventDefault();
          window.dispatchEvent(new Event("open_sql_drawer"));
        }
      }}
      target={item.url.startsWith("http") ? "_blank" : undefined}
      rel={item.url.startsWith("http") ? "noopener noreferrer" : undefined}
    >
      <div className="text-purple-400 mt-0.5">{item.icon}</div>
      <div>
        <div className="text-base font-bold text-zinc-100">{item.title}</div>
        {item.description && (
          <p className="text-xs leading-normal text-zinc-400 mt-1">
            {item.description}
          </p>
        )}
      </div>
    </a>
  );
};

export { Navbar };
