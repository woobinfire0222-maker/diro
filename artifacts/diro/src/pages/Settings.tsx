import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useGetMe, useUpdateUser } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/providers/theme-provider";
import { Switch } from "@/components/ui/switch";
import { ShieldCheck } from "lucide-react";

export default function SettingsPage() {
  const { data: user, refetch } = useGetMe();
  const updateUserMutation = useUpdateUser();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [, setLocation] = useLocation();

  const [displayName, setDisplayName] = useState("");

  // Sync state when user data loads
  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || user.username || "");
    }
  }, [user?.id]);

  const handleSaveProfile = async () => {
    if (!user) return;
    try {
      await updateUserMutation.mutateAsync({
        id: user.id,
        data: { display_name: displayName }
      });
      toast({ title: "프로필 업데이트 완료" });
      refetch();
    } catch (e) {
      toast({ variant: "destructive", title: "업데이트 실패" });
    }
  };

  // Admin mode visible to bini2222 (superadmin) or any admin role
  const isAdminEligible = user?.username === "bini2222" || user?.role === "admin";

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">설정</h1>
          <p className="text-muted-foreground">계정 및 앱 환경설정을 관리하세요.</p>
        </div>
        {isAdminEligible && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={() => setLocation("/admin")}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            관리자 모드
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Discord 프로필</CardTitle>
          <CardDescription>DIRO에서 사용될 프로필 정보입니다. 아바타는 Discord와 동기화됩니다.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-8 items-start">
          <div className="flex flex-col items-center gap-4">
            <Avatar className="h-24 w-24 ring-4 ring-background shadow-lg">
              <AvatarImage src={user?.avatar || undefined} />
              <AvatarFallback className="text-2xl">{user?.username?.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="text-center">
              <p className="font-medium">{user?.username}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              <p className="text-xs font-mono bg-muted px-2 py-1 rounded mt-2 text-muted-foreground">{user?.discord_id}</p>
            </div>
          </div>
          
          <div className="flex-1 space-y-4 w-full">
            <div className="space-y-2">
              <Label htmlFor="displayName">DIRO 표시 이름</Label>
              <div className="flex gap-2">
                <Input 
                  id="displayName" 
                  value={displayName || user?.username || ''} 
                  onChange={(e) => setDisplayName(e.target.value)}
                />
                <Button onClick={handleSaveProfile} disabled={updateUserMutation.isPending}>
                  저장
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>환경설정</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>다크 모드</Label>
              <p className="text-sm text-muted-foreground">어두운 테마를 사용합니다.</p>
            </div>
            <Switch 
              checked={theme === "dark"} 
              onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>이메일 알림</Label>
              <p className="text-sm text-muted-foreground">주문 상태 변경 시 이메일 알림을 받습니다.</p>
            </div>
            <Switch defaultChecked />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
