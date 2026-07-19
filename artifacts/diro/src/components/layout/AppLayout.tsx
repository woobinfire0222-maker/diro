import { Link, useLocation } from "wouter";
import { Home, ShoppingBag, MessageCircle, Server, Settings, Headset, Shield, LogOut, Bell } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useGetMe, useGetNotifications, useLogout } from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "./ui/badge";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { session, signOut } = useAuth();
  const { data: user } = useGetMe({ query: { enabled: !!session } });
  const logoutMutation = useLogout();
  const { data: notifications } = useGetNotifications({ unread_only: true }, { query: { enabled: !!session } });

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

  return (
    <div className="flex h-screen bg-background overflow-hidden selection:bg-primary/20">
      {/* Sidebar */}
      <aside className="w-20 md:w-64 flex flex-col border-r bg-card/50 backdrop-blur-md z-20">
        <div className="h-16 flex items-center justify-center md:justify-start md:px-6 border-b">
          <div className="flex items-center gap-2 text-primary font-bold text-xl tracking-tight">
            <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground">
              D
            </div>
            <span className="hidden md:block">DIRO</span>
          </div>
        </div>
        
        <nav className="flex-1 py-6 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location.startsWith(item.path);
            return (
              <Link key={item.path} href={item.path} className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group ${isActive ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20' : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground'}`}>
                <item.icon className={`h-5 w-5 ${isActive ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-foreground'}`} />
                <span className="hidden md:block font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center justify-between px-6 border-b bg-card/50 backdrop-blur-md z-10 sticky top-0">
          <div className="flex-1" />
          
          <div className="flex items-center gap-4">
            <button className="relative p-2 text-muted-foreground hover:bg-secondary rounded-full transition-colors">
              <Bell className="h-5 w-5" />
              {notifications && notifications.length > 0 && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-destructive rounded-full" />
              )}
            </button>
            
            <DropdownMenu>
              <DropdownMenuTrigger className="focus:outline-none">
                <div className="flex items-center gap-2 hover:bg-secondary p-1 pr-3 rounded-full transition-colors">
                  <Avatar className="h-8 w-8 ring-2 ring-primary/20">
                    <AvatarImage src={user?.avatar || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary">{user?.display_name?.charAt(0) || user?.username?.charAt(0) || 'U'}</AvatarFallback>
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
