import { useState } from "react";
import { useGetAdminStats, useGetAdminUsers, useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, ShoppingCart, DollarSign, Activity, ChevronDown, Check, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";

type Role = "admin" | "counselor" | "developer" | "user";

const ROLE_LABELS: Record<Role, string> = {
  admin: "관리자",
  counselor: "상담사",
  developer: "개발자",
  user: "일반 회원",
};

const ROLE_COLORS: Record<Role, string> = {
  admin: "bg-destructive/10 text-destructive border-destructive/30",
  counselor: "bg-primary/10 text-primary border-primary/30",
  developer: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  user: "bg-secondary text-secondary-foreground border-transparent",
};

export default function AdminDashboard() {
  const { data: user } = useGetMe();
  const { data: stats } = useGetAdminStats();
  const { data: users, isLoading: usersLoading, refetch } = useGetAdminUsers({ limit: 50 });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Access: bini2222 (superadmin) or any admin role
  const isSuperAdmin = user?.username === "bini2222";
  const isAdmin = user?.role === "admin" || isSuperAdmin;

  if (!isAdmin) {
    return <div className="p-8 text-center text-destructive">관리자만 접근할 수 있습니다.</div>;
  }

  const handleRoleChange = async (userId: string, newRole: Role) => {
    if (userId === user?.id && !isSuperAdmin) {
      toast({ variant: "destructive", title: "자기 자신의 역할은 변경할 수 없습니다." });
      return;
    }
    setUpdatingId(userId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: `역할이 '${ROLE_LABELS[newRole]}'(으)로 변경되었습니다.` });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["getAdminUsers"] });
    } catch (e) {
      toast({ variant: "destructive", title: "역할 변경 실패", description: String(e) });
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <span className="bg-destructive text-destructive-foreground text-xs px-2 py-1 rounded">관리자</span>
          DIRO 통합 관리 패널
        </h1>
        {isSuperAdmin && (
          <p className="text-xs text-muted-foreground mt-1">🛡️ 슈퍼 관리자 (bini2222) 권한으로 접속 중</p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 누적 매출</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₩{stats?.revenue_total?.toLocaleString() || 0}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 주문수</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_orders || 0}건</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">활성 회원</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_users || 0}명</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">진행 중 프로젝트</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(stats?.consulting_orders || 0) + (stats?.building_orders || 0)}개</div>
          </CardContent>
        </Card>
      </div>

      {/* Member Management */}
      <Card>
        <CardHeader>
          <CardTitle>멤버 관리</CardTitle>
          <p className="text-sm text-muted-foreground">
            역할을 변경하면 해당 계정의 접근 권한이 즉시 바뀝니다.
            <br />
            <span className="font-medium text-foreground">상담사</span>: 주문 상담 담당 &nbsp;|&nbsp;
            <span className="font-medium text-foreground">개발자</span>: 서버 제작 및 가격 설정 담당 &nbsp;|&nbsp;
            <span className="font-medium text-foreground">관리자</span>: 전체 관리 가능
          </p>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="relative w-full overflow-auto">
              <table className="w-full caption-bottom text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="h-12 px-4 text-left font-medium text-muted-foreground">이름</th>
                    <th className="h-12 px-4 text-left font-medium text-muted-foreground">Discord</th>
                    <th className="h-12 px-4 text-left font-medium text-muted-foreground">이메일</th>
                    <th className="h-12 px-4 text-left font-medium text-muted-foreground">현재 역할</th>
                    <th className="h-12 px-4 text-left font-medium text-muted-foreground">역할 변경</th>
                    <th className="h-12 px-4 text-left font-medium text-muted-foreground">가입일</th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {users?.map((u) => {
                    const role = u.role as Role;
                    const isSelf = u.id === user?.id;
                    const isLoading = updatingId === u.id;
                    return (
                      <tr key={u.id} className="border-b transition-colors hover:bg-muted/50">
                        <td className="p-4 font-medium">
                          <div className="flex items-center gap-2">
                            {u.display_name || u.username}
                            {u.username === "bini2222" && (
                              <span className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">슈퍼</span>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-muted-foreground font-mono text-xs">{u.username}</td>
                        <td className="p-4 text-muted-foreground">{u.email}</td>
                        <td className="p-4">
                          <Badge variant="outline" className={ROLE_COLORS[role] || ""}>
                            {ROLE_LABELS[role] || role}
                          </Badge>
                        </td>
                        <td className="p-4">
                          {/* bini2222 cannot be demoted unless you are bini2222 yourself */}
                          {u.username === "bini2222" && !isSuperAdmin ? (
                            <span className="text-xs text-muted-foreground">변경 불가</span>
                          ) : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 gap-1 text-xs"
                                  disabled={isLoading}
                                >
                                  {isLoading ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <>
                                      역할 변경
                                      <ChevronDown className="h-3 w-3" />
                                    </>
                                  )}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start">
                                {(["admin", "counselor", "developer", "user"] as Role[]).map((r) => (
                                  <DropdownMenuItem
                                    key={r}
                                    onClick={() => handleRoleChange(u.id, r)}
                                    className="gap-2"
                                  >
                                    {role === r && <Check className="h-3.5 w-3.5 text-primary" />}
                                    <span className={role === r ? "font-semibold" : ""}>
                                      {ROLE_LABELS[r]}
                                    </span>
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </td>
                        <td className="p-4 text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
