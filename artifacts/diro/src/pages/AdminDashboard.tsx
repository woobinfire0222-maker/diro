import { useState } from "react";
import { useGetAdminStats, useGetAdminUsers, useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, ShoppingCart, DollarSign, Activity } from "lucide-react";

export default function AdminDashboard() {
  const { data: user } = useGetMe();
  const { data: stats, isLoading: statsLoading } = useGetAdminStats();
  const { data: users, isLoading: usersLoading } = useGetAdminUsers({ limit: 10 });

  if (user?.role !== "admin") {
    return <div className="p-8 text-center text-destructive">관리자만 접근할 수 있습니다.</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <span className="bg-destructive text-destructive-foreground text-xs px-2 py-1 rounded">관리자</span>
          DIRO 통합 관리 패널
        </h1>
      </div>

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

      <Card>
        <CardHeader>
          <CardTitle>최근 가입 사용자</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative w-full overflow-auto">
            <table className="w-full caption-bottom text-sm">
              <thead className="[&_tr]:border-b">
                <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">이름</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">이메일</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">권한</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">가입일</th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {users?.map((u) => (
                  <tr key={u.id} className="border-b transition-colors hover:bg-muted/50">
                    <td className="p-4 align-middle font-medium">{u.display_name || u.username}</td>
                    <td className="p-4 align-middle">{u.email}</td>
                    <td className="p-4 align-middle">
                      <span className={`px-2 py-1 rounded text-xs ${u.role === 'admin' ? 'bg-destructive/10 text-destructive' : u.role === 'counselor' ? 'bg-primary/10 text-primary' : 'bg-secondary'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="p-4 align-middle">{new Date(u.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
