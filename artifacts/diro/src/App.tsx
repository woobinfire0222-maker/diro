import { useEffect } from "react";
import { Route, Switch, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SupabaseProvider } from "@/providers/SupabaseProvider";
import { useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/providers/theme-provider";
import { AppLayout } from "@/components/layout/AppLayout";
import { useGetMe } from "@/lib/db";

import LoginPage from "@/pages/Login";
import HomePage from "@/pages/Home";
import OrdersPage from "@/pages/Orders";
import ChatPage from "@/pages/Chat";
import ServersPage from "@/pages/Servers";
import CounselorDashboard from "@/pages/CounselorDashboard";
import ServerEditorPage from "@/pages/ServerEditor";
import AdminDashboard from "@/pages/AdminDashboard";
import SettingsPage from "@/pages/Settings";
import TermsPage from "@/pages/Terms";
import PrivacyPolicyPage from "@/pages/PrivacyPolicy";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function BannedScreen({ reason }: { reason?: string | null }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="max-w-md w-full text-center space-y-5">
        <div className="text-6xl">🚫</div>
        <h1 className="text-2xl font-bold text-destructive">계정이 차단되었습니다</h1>
        <p className="text-muted-foreground">
          {reason
            ? `차단 사유: ${reason}`
            : "관리자에 의해 서비스 이용이 제한되었습니다."}
        </p>
        <p className="text-sm text-muted-foreground">
          문의가 있으시면 운영자에게 연락해주세요.
        </p>
      </div>
    </div>
  );
}

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { session, loading } = useAuth();
  const { data: user, isLoading: userLoading } = useGetMe({ query: { enabled: !!session } });
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !session) {
      setLocation("/");
    }
  }, [session, loading, setLocation]);

  if (loading || (session && userLoading && !user)) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!session) return null;

  // 차단된 유저 — 로그인은 됐지만 서비스 이용 불가
  if (user?.is_banned) {
    return <BannedScreen reason={user.ban_reason} />;
  }

  return <Component {...rest} />;
}

function Routes() {
  return (
    <Switch>
      <Route path="/" component={LoginPage} />

      {/* 공개 페이지 (로그인 불필요) */}
      <Route path="/terms" component={TermsPage} />
      <Route path="/privacy" component={PrivacyPolicyPage} />

      <Route path="/home">
        <AppLayout><ProtectedRoute component={HomePage} /></AppLayout>
      </Route>

      <Route path="/orders">
        <AppLayout><ProtectedRoute component={OrdersPage} /></AppLayout>
      </Route>

      <Route path="/servers">
        <AppLayout><ProtectedRoute component={ServersPage} /></AppLayout>
      </Route>

      <Route path="/counselor">
        <AppLayout><ProtectedRoute component={CounselorDashboard} /></AppLayout>
      </Route>

      <Route path="/counselor/editor/:orderId">
        <ProtectedRoute component={ServerEditorPage} />
      </Route>

      <Route path="/admin">
        <AppLayout><ProtectedRoute component={AdminDashboard} /></AppLayout>
      </Route>

      <Route path="/chat">
        <AppLayout><ProtectedRoute component={ChatPage} /></AppLayout>
      </Route>

      <Route path="/chat/:orderId">
        <AppLayout><ProtectedRoute component={ChatPage} /></AppLayout>
      </Route>

      <Route path="/settings">
        <AppLayout><ProtectedRoute component={SettingsPage} /></AppLayout>
      </Route>

      <Route>
        <AppLayout><NotFound /></AppLayout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="diro-theme">
        <SupabaseProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Routes />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </SupabaseProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
