import { useEffect } from "react";
import { Route, Switch, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SupabaseProvider } from "@/providers/SupabaseProvider";
import { useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/providers/theme-provider";
import { AppLayout } from "@/components/layout/AppLayout";

import LoginPage from "@/pages/Login";
import HomePage from "@/pages/Home";
import OrdersPage from "@/pages/Orders";
import ChatPage from "@/pages/Chat";
import ServersPage from "@/pages/Servers";
import CounselorDashboard from "@/pages/CounselorDashboard";
import ServerEditorPage from "@/pages/ServerEditor";
import AdminDashboard from "@/pages/AdminDashboard";
import SettingsPage from "@/pages/Settings";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { session, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !session) {
      setLocation("/");
    }
  }, [session, loading, setLocation]);

  if (loading) {
    return <div className="h-screen w-full flex items-center justify-center bg-background"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  }

  if (!session) {
    return null; // Will redirect via useEffect
  }

  return <Component {...rest} />;
}

function Routes() {
  return (
    <Switch>
      <Route path="/" component={LoginPage} />
      
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
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
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
