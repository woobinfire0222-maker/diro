import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Home, ShoppingBag, MessageCircle, Server, Settings, Headset, Shield, LogOut, Bell, Menu, X, Check, CheckCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useGetMe, useGetNotifications, useMarkNotificationRead, useLogout, type Notification } from "@/lib/db";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금 전";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

function NotificationBell({ session }: { session: boolean }) {
  const [open, setOpen] = useState(false);
  const { data: allNotifications } = useGetNotifications(undefined, { query: { enabled: session } });
  const { data: unread } = useGetNotifications({ unread_only: true }, { query: { enabled: session } });
  const markRead = useMarkNotificationRead();

  const notifications = allNotifications ?? [];
  const unreadCount = unread?.length ?? 0;

  const handleMarkRead = (n: Notification) => {
    if (!n.is_read) markRead.mutate(n.id);
  };

  const handleMarkAll = () => {
    notifications.filter(n => !n.is_read).forEach(n => markRead.mutate(n.id));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-2 text-muted-foreground hover:bg-secondary rounded-full transition-colors">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 h-4 w-4 bg-destructive rounded-full text-[10px] text-white font-bold flex items-center justify-center leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="font-semibold text-sm">알림</span>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAll}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              모두 읽음
            </button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">
              알림이 없습니다
            </div>
          ) : (
            <div>
              {notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleMarkRead(n)}
                  className={cn(
                    "w-full text-left px-4 py-3 border-b last:border-0 transition-colors hover:bg-secondary/50",
                    !n.is_read && "bg-primary/5"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn("mt-1.5 h-2 w-2 rounded-full shrink-0", n.is_read ? "bg-transparent" : "bg-primary")} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{n.title}</p>
                      {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                      <p className="text-[11px] text-muted-foreground/70 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                    {!n.is_read && <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-1" />}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { session, signOut } = useAuth();
  const { data: user } = useGetMe({ query: { enabled: !!session } });
  const logoutMutation = useLogout();

  if (!session) {
    return <>{children}</>;
  }

  const navItems = [
    { name: "홈", icon: Home, path: "/home" },
    { name: "주문", icon: ShoppingBag, path: "/orders" },
    { name: "채팅", icon: MessageCircle, path: "/chat" },
    { name: "내 서버", icon: Server, path: "/servers" },
    { name: "설정", icon: Settings, path: "/settings" },
  ];

  if (user?.role === "admin" || user?.role === "counselor" || user?.role === "developer") {
    navItems.push({ name: "파트너", icon: Headset, path: "/counselor" });
  }
  if (user?.role === "admin") {
    navItems.push({ name: "관리자", icon: Shield, path: "/admin" });
  }

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    await signOut();
  };

  const SidebarContent = () => (
    <>
      <div className="h-16 flex items-center justify-between px-6 border-b shrink-0">
        <div className="flex items-center gap-2 text-primary font-bold text-xl tracking-tight">
          <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground">D</div>
          <span>DIRO</span>
        </div>
        <button onClick={() => setMobileOpen(false)} className="md:hidden p-1 rounded-lg text-muted-foreground hover:bg-secondary">
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.startsWith(item.path);
          return (
            <Link
              key={item.path}
              href={item.path}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group ${isActive ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20" : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground"}`}
            >
              <item.icon className={`h-5 w-5 shrink-0 ${isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"}`} />
              <span className="font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-secondary/80 transition-colors">
              <Avatar className="h-8 w-8 ring-2 ring-primary/20 shrink-0">
                <AvatarImage src={user?.avatar || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {user?.display_name?.charAt(0) || user?.username?.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium truncate">{user?.display_name || user?.username}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user?.display_name || user?.username}</p>
                <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive cursor-pointer" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>로그아웃</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden selection:bg-primary/20">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — always visible on md+, drawer on mobile */}
      <aside
        className={cn(
          "fixed md:relative inset-y-0 left-0 z-40 w-64 flex flex-col border-r bg-card/95 backdrop-blur-md transition-transform duration-300 md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {SidebarContent()}
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 md:ml-0">
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b bg-card/50 backdrop-blur-md z-10 sticky top-0">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-2 text-muted-foreground hover:bg-secondary rounded-lg transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>
            {/* Desktop logo hidden (sidebar shows it) */}
            <div className="md:hidden flex items-center gap-2 text-primary font-bold text-lg">
              <div className="h-7 w-7 bg-primary rounded-md flex items-center justify-center text-primary-foreground text-sm">D</div>
              DIRO
            </div>
          </div>

          <div className="flex items-center gap-2">
            <NotificationBell session={!!session} />

            <DropdownMenu>
              <DropdownMenuTrigger className="focus:outline-none">
                <div className="flex items-center gap-2 hover:bg-secondary p-1 pr-3 rounded-full transition-colors">
                  <Avatar className="h-8 w-8 ring-2 ring-primary/20">
                    <AvatarImage src={user?.avatar || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {user?.display_name?.charAt(0) || user?.username?.charAt(0) || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium hidden sm:block">{user?.display_name || user?.username}</span>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user?.display_name || user?.username}</p>
                    <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive cursor-pointer" onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>로그아웃</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div className="flex-1 overflow-auto bg-background">
          <div className="max-w-7xl mx-auto p-4 md:p-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
