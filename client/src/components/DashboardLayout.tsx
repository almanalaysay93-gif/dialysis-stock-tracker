import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import { preloadPage } from "@/lib/pages";
import { Activity, CalendarDays, FileText, HeartPulse, LayoutDashboard, LogOut, Package, PanelsTopLeft, PanelLeft, RotateCcw, ShoppingBag } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";

const LOGO_SRC = "/spmc-skti-logo.jpg";

function LoginScreen({ google, optionsLoading }: { google: boolean; optionsLoading: boolean }) {
  // Google sends the browser back to /?login_error=... when sign-in fails.
  const [googleError] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("login_error");
    if (!code) return null;
    if (code === "not_allowed") return "That Google account is not allowed to sign in.";
    const detail: Record<string, string> = {
      exchange: "Google rejected the request. The client secret may be wrong.",
      verify: "Google's reply could not be verified, or the email is not verified.",
      database: "The database could not be used.",
    };
    const database: Record<string, string> = {
      not_configured: "No database address is set on the server.",
      unreachable: "The server cannot find or reach the database. Its address may be wrong.",
      auth_failed: "The database rejected the server's username or password.",
      not_migrated: "The database tables have not been created yet.",
    };
    const reason = database[params.get("db") ?? ""] ?? detail[params.get("step") ?? ""];
    return `Google sign-in did not complete.${reason ? ` ${reason}` : ""} Try again.`;
  });
  useEffect(() => {
    if (googleError) window.history.replaceState(null, "", window.location.pathname);
  }, [googleError]);

  return (
    <main className="flex items-center justify-center min-h-screen p-5">
      <div className="glass-strong rounded-xl p-8 max-w-md w-full space-y-6 animate-in-rise">
        <div className="flex flex-col items-center gap-4 text-center">
          <img
            src={LOGO_SRC}
            alt="SPMC Kidney and Transplant Institute"
            width={80}
            height={80}
            className="h-20 w-20 rounded-full object-cover border-2 border-primary/20 shadow-md"
          />
          <div>
            <h1 className="text-3xl font-display font-semibold tracking-tight">
              Dialysis Stock Tracker
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              SPMC Kidney and Transplant Institute
            </p>
          </div>
        </div>
        {googleError && (
          <p role="alert" className="text-sm font-medium text-destructive text-center">
            {googleError}
          </p>
        )}
        {google ? (
          <Button asChild size="lg" className="w-full h-11">
            <a href="/api/auth/google/start">Sign in with Google</a>
          </Button>
        ) : (
          !optionsLoading && (
            <p role="alert" className="text-sm text-muted-foreground text-center">
              Sign-in is not available right now. Ask the unit administrator.
            </p>
          )
        )}
      </div>
    </main>
  );
}

export const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: Package, label: "Items", path: "/items" },
  { icon: PanelsTopLeft, label: "Stock In / Out", path: "/transactions" },
  { icon: Activity, label: "Consumption", path: "/consumption" },
  { icon: HeartPulse, label: "Sessions", path: "/sessions" },
  { icon: CalendarDays, label: "Calendar", path: "/calendar" },
  { icon: ShoppingBag, label: "Purchase Orders", path: "/purchase-orders" },
  { icon: RotateCcw, label: "Rotation (FIFO)", path: "/rotation" },
  { icon: FileText, label: "Reports", path: "/reports" },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();
  // Batch sign-in configuration with the initial session request.
  const options = trpc.auth.options.useQuery(undefined, { retry: false, staleTime: Infinity });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return <LoginScreen google={Boolean(options.data?.google)} optionsLoading={options.isLoading} />;
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0 glass-dark text-white"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-20 justify-center py-3">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-9 w-9 flex items-center justify-center hover:bg-white/10 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-5 w-5 text-white/70" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={LOGO_SRC}
                    alt="SPMC Kidney and Transplant Institute"
                    className="h-11 w-11 rounded-full object-cover border-2 border-white/25 shadow-md shrink-0"
                  />
                  <span className="font-semibold tracking-tight truncate text-[15px] leading-tight">
                    Dialysis Stock Tracker
                  </span>
                </div>
              ) : (
                <img
                  src={LOGO_SRC}
                  alt="SPMC SKTI"
                  className="h-11 w-11 rounded-full object-cover border-2 border-white/25 shadow-md shrink-0"
                />
              )}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {menuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      onMouseEnter={() => preloadPage(item.path)}
                      onFocus={() => preloadPage(item.path)}
                      onTouchStart={() => preloadPage(item.path)}
                      tooltip={item.label}
                      className={`h-12 transition-all font-normal text-[15px]`}
                    >
                      <item.icon
                        className={`h-6 w-6 ${isActive ? "text-[oklch(0.78_0.1_150)]" : "text-white/60"}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {(user?.name || user?.username)?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-white/70 truncate mt-1.5">
                      {user?.username || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-16 items-center justify-between glass-strong sticky top-0 z-40 px-3">
            <div className="flex items-center gap-2.5">
              <SidebarTrigger className="h-11 w-11 rounded-lg glass" />
              <img
                src={LOGO_SRC}
                alt="SPMC SKTI"
                className="h-10 w-10 rounded-full object-cover border-2 border-primary/20 shrink-0"
              />
              <span className="tracking-tight text-foreground text-lg font-semibold">
                {activeMenuItem?.label ?? "Menu"}
              </span>
            </div>
          </div>
        )}
        <main className="flex-1 p-5">{children}</main>
      </SidebarInset>
    </>
  );
}
