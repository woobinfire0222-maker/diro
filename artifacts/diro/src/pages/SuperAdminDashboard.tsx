import { useState } from "react";
import {
  useGetAdminStats, useGetAdminUsers, useGetMe, useBanUser, useUnbanUser,
  useGetPaymentRequests, useApprovePayment, useMarkPaymentPaid, useAdminAnnounce,
  useMaintenanceMode, useToggleMaintenanceMode, useRunSiteCheck,
} from "@/lib/db";
import type { SiteCheckResult } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Users, ShoppingCart, DollarSign, Activity,
  ChevronDown, Check, Loader2, Ban, ShieldCheck, AlertTriangle,
  Megaphone, CreditCard, CheckCircle2, ExternalLink,
  Wrench, RefreshCw, ShieldAlert,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";

type Role = "admin" | "counselor" | "developer" | "user";

const ROLE_LABELS: Record<Role, string> = {
  admin: "관리자", counselor: "상담사", developer: "개발자", user: "일반 회원",
};
const ROLE_COLORS: Record<Role, string> = {
  admin:     "bg-destructive/10 text-destructive border-destructive/30",
  counselor: "bg-primary/10 text-primary border-primary/30",
  developer: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  user:      "bg-secondary text-secondary-foreground border-transparent",
};
const PMT_STATUS_COLORS: Record<string, string> = {
  pending:           "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
  awaiting_approval: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  approved:          "bg-purple-500/10 text-purple-600 border-purple-500/30",
  paid:              "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  cancelled:         "bg-secondary text-secondary-foreground border-transparent",
};
const PMT_STATUS_LABELS: Record<string, string> = {
  pending: "대기", awaiting_approval: "승인 대기", approved: "승인됨",
  paid: "결제 완료", cancelled: "취소됨",
};

interface BanDialog    { open: boolean; userId: string; username: string }
interface ApproveDialog {
  open: boolean; paymentId: string; orderId: string;
  amount: number; serverName: string; clientName: string;
}

export default function SuperAdminDashboard() {
  const { data: user }                                       = useGetMe();
  const { data: stats }                                      = useGetAdminStats();
  const { data: users, isLoading: usersLoading, refetch }    = useGetAdminUsers({ limit: 100 });
  const { data: payments, isLoading: paymentsLoading }       = useGetPaymentRequests();
  const { data: maintenanceOn }                              = useMaintenanceMode();
  const { toast }                                            = useToast();
  const qc                                                   = useQueryClient();

  const [updatingId, setUpdatingId]             = useState<string | null>(null);
  const [banReason, setBanReason]               = useState("");
  const [tossLink, setTossLink]                 = useState("");
  const [announceTitle, setAnnounceTitle]       = useState("");
  const [announceContent, setAnnounceContent]   = useState("");
  const [checkResults, setCheckResults]         = useState<SiteCheckResult[] | null>(null);
  const [banDialog, setBanDialog]               = useState<BanDialog>({ open: false, userId: "", username: "" });
  const [approveDialog, setApproveDialog]       = useState<ApproveDialog>({
    open: false, paymentId: "", orderId: "", amount: 0, serverName: "", clientName: "",
  });

  const banMutation       = useBanUser();
  const unbanMutation     = useUnbanUser();
  const approveMutation   = useApprovePayment();
  const markPaidMutation  = useMarkPaymentPaid();
  const announceMutation  = useAdminAnnounce();
  const toggleMaintenance = useToggleMaintenanceMode();
  const siteCheck         = useRunSiteCheck();

  const isSuperAdmin = user?.username === "bini2222";
  if (!isSuperAdmin) {
    return <div className="p-8 text-center text-destructive">슈퍼관리자만 접근할 수 있습니다.</div>;
  }

  // ── handlers ─────────────────────────────────────────────────────────────────

  const handleRoleChange = async (userId: string, newRole: Role) => {
    setUpdatingId(userId);
    try {
      const { error } = await supabase.from("users").update({ role: newRole }).eq("id", userId);
      if (error) throw error;
      toast({ title: `역할이 '${ROLE_LABELS[newRole]}'(으)로 변경되었습니다.` });
      refetch();
      qc.invalidateQueries({ queryKey: ["adminUsers"] });
    } catch (e) {
      toast({ variant: "destructive", title: "역할 변경 실패", description: String(e) });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleBan = async () => {
    try {
      await banMutation.mutateAsync({ userId: banDialog.userId, reason: banReason });
      toast({ title: `@${banDialog.username} 계정을 차단했습니다.` });
      setBanDialog({ open: false, userId: "", username: "" });
    } catch (e) {
      toast({ variant: "destructive", title: "차단 실패", description: String(e) });
    }
  };

  const handleUnban = async (userId: string, username: string) => {
    try {
      await unbanMutation.mutateAsync(userId);
      toast({ title: `@${username} 차단이 해제되었습니다.` });
    } catch (e) {
      toast({ variant: "destructive", title: "차단 해제 실패", description: String(e) });
    }
  };

  const handleApprove = async () => {
    if (!tossLink.trim()) {
      toast({ variant: "destructive", title: "Toss 링크를 입력해주세요." });
      return;
    }
    try {
      await approveMutation.mutateAsync({
        paymentId: approveDialog.paymentId, orderId: approveDialog.orderId,
        amount: approveDialog.amount, tossLink: tossLink.trim(),
      });
      toast({ title: "✅ 결제가 승인되었습니다.", description: "고객 채팅에 토스 링크가 전달되었습니다." });
      setApproveDialog({ open: false, paymentId: "", orderId: "", amount: 0, serverName: "", clientName: "" });
    } catch (e) {
      toast({ variant: "destructive", title: "승인 실패", description: String(e) });
    }
  };

  const handleMarkPaid = async (paymentId: string, orderId: string) => {
    try {
      await markPaidMutation.mutateAsync({ paymentId, orderId });
      toast({ title: "✅ 결제 완료 처리되었습니다." });
    } catch (e) {
      toast({ variant: "destructive", title: "처리 실패", description: String(e) });
    }
  };

  const handleAnnounce = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!announceTitle.trim() || !announceContent.trim()) return;
    try {
      const result = await announceMutation.mutateAsync({
        title: announceTitle.trim(), content: announceContent.trim(),
      });
      toast({ title: "📢 공지 발송 완료", description: `${result.notified}명에게 알림이 전달되었습니다.` });
      setAnnounceTitle("");
      setAnnounceContent("");
    } catch (e) {
      toast({ variant: "destructive", title: "공지 발송 실패", description: String(e) });
    }
  };

  const handleMaintenanceToggle = async (enabled: boolean) => {
    try {
      await toggleMaintenance.mutateAsync(enabled);
      toast({
        title: enabled ? "🔧 점검 모드 활성화" : "✅ 점검 모드 해제",
        description: enabled
          ? "슈퍼관리자 외 모든 사용자의 접속이 제한됩니다."
          : "서비스가 정상 운영 중입니다.",
      });
    } catch (e) {
      toast({ variant: "destructive", title: "점검 모드 변경 실패", description: String(e) });
    }
  };

  const handleSiteCheck = async () => {
    setCheckResults(null);
    try {
      const result = await siteCheck.mutateAsync();
      setCheckResults(result.checks);
      if (result.allOk) {
        toast({ title: "✅ 자체 점검 이상 없음", description: "모든 시스템이 정상 동작 중입니다." });
      } else {
        const failed = result.checks.filter(c => !c.ok).map(c => c.name).join(", ");
        toast({ variant: "destructive", title: "⚠️ 점검 이상 발견", description: `이상 항목: ${failed}` });
      }
    } catch (e) {
      toast({ variant: "destructive", title: "점검 실행 실패", description: String(e) });
    }
  };

  const pendingPayments  = (payments ?? []).filter(p => p.status === "awaiting_approval");
  const approvedPayments = (payments ?? []).filter(p => p.status === "approved");

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-destructive" />
          슈퍼관리자 패널
        </h1>
        <p className="text-xs text-muted-foreground mt-1">bini2222 전용 — 일반 관리자에게는 표시되지 않습니다.</p>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 누적 매출</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₩{(stats?.revenue_total ?? 0).toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 주문수</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_orders ?? 0}건</div>
            <p className="text-xs text-muted-foreground mt-1">이번 주 {stats?.orders_this_week ?? 0}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">활성 회원</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_users ?? 0}명</div>
            <p className="text-xs text-muted-foreground mt-1">
              상담사 {stats?.total_counselors ?? 0} · 개발자 {stats?.total_developers ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">진행 중 프로젝트</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(stats?.consulting_orders ?? 0) + (stats?.building_orders ?? 0)}개
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              상담 {stats?.consulting_orders ?? 0} · 제작 {stats?.building_orders ?? 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 점검 모드 */}
      <Card className={maintenanceOn ? "border-orange-500/50 bg-orange-500/5" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className={`h-5 w-5 ${maintenanceOn ? "text-orange-500" : "text-muted-foreground"}`} />
            점검 모드
            {maintenanceOn && <Badge className="bg-orange-500 text-white">점검 중</Badge>}
          </CardTitle>
          <CardDescription>
            켜면 슈퍼관리자 외 모든 사용자에게 점검 화면이 표시됩니다. 로그인·회원가입은 가능합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-4">
            <Switch
              checked={maintenanceOn ?? false}
              onCheckedChange={handleMaintenanceToggle}
              disabled={toggleMaintenance.isPending}
              className="data-[state=checked]:bg-orange-500"
            />
            <span className={`text-sm font-medium ${maintenanceOn ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"}`}>
              {toggleMaintenance.isPending ? "변경 중…" : maintenanceOn ? "점검 중 (슈퍼관리자만 접속 가능)" : "운영 중"}
            </span>
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium">자체 점검</p>
              <Button
                variant="outline" size="sm" onClick={handleSiteCheck}
                disabled={siteCheck.isPending} className="gap-2 h-8 text-xs"
              >
                {siteCheck.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RefreshCw className="h-3.5 w-3.5" />}
                점검 실행
              </Button>
            </div>

            {checkResults && (
              <div className="space-y-2 rounded-xl border bg-card p-3">
                <p className={`text-xs font-bold mb-2 flex items-center gap-1.5 ${checkResults.every(c => c.ok) ? "text-success" : "text-destructive"}`}>
                  {checkResults.every(c => c.ok)
                    ? <><CheckCircle2 className="h-4 w-4" /> 점검 이상 없음</>
                    : <><AlertTriangle className="h-4 w-4" /> 이상 항목 발견</>}
                </p>
                {checkResults.map(r => (
                  <div key={r.name} className="flex items-start gap-2 text-sm">
                    {r.ok
                      ? <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                      : <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />}
                    <span className={r.ok ? "text-muted-foreground" : "text-destructive font-medium"}>
                      {r.name}
                    </span>
                    {!r.ok && (
                      <span className="text-xs text-muted-foreground ml-auto shrink-0 max-w-[200px] truncate" title={r.detail}>
                        {r.detail}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 전체 공지 발송 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            전체 공지 발송
          </CardTitle>
          <CardDescription>모든 사용자에게 알림과 함께 공지를 발송합니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAnnounce} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ann-title">제목</Label>
              <Input
                id="ann-title" value={announceTitle}
                onChange={e => setAnnounceTitle(e.target.value)}
                placeholder="공지 제목을 입력하세요" required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ann-content">내용</Label>
              <Textarea
                id="ann-content" value={announceContent}
                onChange={e => setAnnounceContent(e.target.value)}
                placeholder="공지 내용을 입력하세요" rows={4} required
              />
            </div>
            <Button
              type="submit" className="gap-2"
              disabled={announceMutation.isPending || !announceTitle.trim() || !announceContent.trim()}
            >
              {announceMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Megaphone className="h-4 w-4" />}
              전체 발송
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* 결제 승인 관리 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            결제 승인 관리
            {pendingPayments.length > 0 && (
              <Badge className="bg-primary text-primary-foreground">{pendingPayments.length}건 대기</Badge>
            )}
          </CardTitle>
          <CardDescription>
            개발자가 확정한 가격을 승인하면 고객 채팅에 토스 결제 링크가 자동 전달됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {paymentsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : pendingPayments.length === 0 && approvedPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">대기 중인 결제 요청이 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {[...pendingPayments, ...approvedPayments].map(p => (
                <div key={p.id} className="flex items-center justify-between p-4 rounded-xl border bg-card gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold truncate">{p.server_name}</span>
                      <Badge variant="outline" className={PMT_STATUS_COLORS[p.status] || ""}>
                        {PMT_STATUS_LABELS[p.status] || p.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">고객: {p.client_display_name || p.client_username || "—"}</p>
                    <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-lg font-bold text-primary">₩{Number(p.amount).toLocaleString()}</p>
                    <div className="flex gap-2 mt-2">
                      {p.status === "awaiting_approval" && (
                        <Button
                          size="sm" className="h-8 gap-1.5 text-xs"
                          onClick={() => {
                            setTossLink("");
                            setApproveDialog({
                              open: true, paymentId: p.id, orderId: p.order_id, amount: p.amount,
                              serverName: p.server_name || "서버",
                              clientName: p.client_display_name || p.client_username || "고객",
                            });
                          }}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> 승인
                        </Button>
                      )}
                      {p.status === "approved" && (
                        <Button
                          size="sm" variant="outline"
                          className="h-8 gap-1.5 text-xs text-emerald-600 border-emerald-500/30"
                          onClick={() => handleMarkPaid(p.id, p.order_id)}
                          disabled={markPaidMutation.isPending}
                        >
                          {markPaidMutation.isPending
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <CheckCircle2 className="h-3.5 w-3.5" />}
                          결제 완료
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 멤버 차단 + 역할 관리 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            멤버 전체 관리
          </CardTitle>
          <CardDescription>역할 변경 및 차단/해제를 관리합니다.</CardDescription>
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
                    <th className="h-12 px-4 text-left font-medium text-muted-foreground">유저네임</th>
                    <th className="h-12 px-4 text-left font-medium text-muted-foreground">이메일</th>
                    <th className="h-12 px-4 text-left font-medium text-muted-foreground">역할</th>
                    <th className="h-12 px-4 text-left font-medium text-muted-foreground">역할 변경</th>
                    <th className="h-12 px-4 text-left font-medium text-muted-foreground">차단 관리</th>
                    <th className="h-12 px-4 text-left font-medium text-muted-foreground">가입일</th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {users?.map((u) => {
                    const role      = u.role as Role;
                    const isSelf    = u.id === user?.id;
                    const isLoading = updatingId === u.id;
                    const isBanned  = u.is_banned === true;
                    return (
                      <tr key={u.id} className={`border-b transition-colors hover:bg-muted/50 ${isBanned ? "bg-destructive/5" : ""}`}>
                        <td className="p-4 font-medium">
                          <div className="flex items-center gap-2">
                            {u.display_name || u.username}
                            {u.username === "bini2222" && (
                              <span className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">슈퍼</span>
                            )}
                            {isBanned && (
                              <span className="text-xs bg-destructive/20 text-destructive px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                <Ban className="h-3 w-3" /> 차단됨
                              </span>
                            )}
                          </div>
                          {isBanned && u.ban_reason && (
                            <p className="text-xs text-muted-foreground mt-0.5">사유: {u.ban_reason}</p>
                          )}
                        </td>
                        <td className="p-4 text-muted-foreground font-mono text-xs">{u.username}</td>
                        <td className="p-4 text-muted-foreground">{u.email}</td>
                        <td className="p-4">
                          <Badge variant="outline" className={ROLE_COLORS[role] || ""}>{ROLE_LABELS[role] || role}</Badge>
                        </td>
                        <td className="p-4">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" disabled={isLoading || isBanned}>
                                {isLoading
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <><span>역할 변경</span><ChevronDown className="h-3 w-3" /></>}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              {(["admin", "counselor", "developer", "user"] as Role[]).map((r) => (
                                <DropdownMenuItem key={r} onClick={() => handleRoleChange(u.id, r)} className="gap-2">
                                  {role === r && <Check className="h-3.5 w-3.5 text-primary" />}
                                  <span className={role === r ? "font-semibold" : ""}>{ROLE_LABELS[r]}</span>
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                        <td className="p-4">
                          {u.username === "bini2222" ? (
                            <span className="text-xs text-muted-foreground">해당 없음</span>
                          ) : isBanned ? (
                            <Button
                              variant="outline" size="sm"
                              className="h-8 gap-1.5 text-xs text-emerald-600 border-emerald-500/30 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                              onClick={() => handleUnban(u.id, u.username || "")}
                              disabled={unbanMutation.isPending}
                            >
                              {unbanMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                              차단 해제
                            </Button>
                          ) : (
                            <Button
                              variant="outline" size="sm"
                              className="h-8 gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                              onClick={() => { setBanReason(""); setBanDialog({ open: true, userId: u.id, username: u.username || "" }); }}
                              disabled={isSelf}
                            >
                              <Ban className="h-3 w-3" /> 차단
                            </Button>
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

      {/* 차단 Dialog */}
      <Dialog open={banDialog.open} onOpenChange={(v) => { if (!v) setBanDialog({ open: false, userId: "", username: "" }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Ban className="h-5 w-5" /> @{banDialog.username} 차단
            </DialogTitle>
            <DialogDescription>차단된 사용자는 즉시 서비스 이용이 제한되며, 차단 알림이 발송됩니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-destructive/10 flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              차단 후 해당 계정은 DIRO에 로그인할 수 없습니다.
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ban-reason">차단 사유 <span className="text-muted-foreground text-xs">(선택)</span></Label>
              <Textarea
                id="ban-reason" value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="차단 사유를 입력하세요. 사용자에게 전달됩니다." rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBanDialog({ open: false, userId: "", username: "" })}>취소</Button>
            <Button variant="destructive" onClick={handleBan} disabled={banMutation.isPending} className="gap-2">
              {banMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              차단하기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 결제 승인 Dialog */}
      <Dialog open={approveDialog.open} onOpenChange={(v) => { if (!v) setApproveDialog(p => ({ ...p, open: false })); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <CheckCircle2 className="h-5 w-5" />
              결제 승인 — {approveDialog.serverName}
            </DialogTitle>
            <DialogDescription>
              고객 <strong>{approveDialog.clientName}</strong>에게{" "}
              <strong>₩{approveDialog.amount.toLocaleString()}</strong> 결제 링크를 전달합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
              <p className="font-medium text-primary mb-1">💡 Toss 링크 생성 방법</p>
              <ol className="space-y-1 text-muted-foreground text-xs list-decimal list-inside">
                <li>토스 앱 → 송금 → 내 링크 복사</li>
                <li>또는 <code className="bg-muted px-1 rounded">toss.me/아이디/금액</code> 형식으로 입력</li>
                <li>예: <code className="bg-muted px-1 rounded">https://toss.me/bini2222/30000</code></li>
              </ol>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="toss-link">Toss 결제 링크</Label>
              <div className="flex gap-2">
                <Input
                  id="toss-link" value={tossLink}
                  onChange={e => setTossLink(e.target.value)}
                  placeholder="https://toss.me/아이디/금액" required
                />
                {tossLink && (
                  <Button variant="outline" size="icon" asChild>
                    <a href={tossLink} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
                  </Button>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setApproveDialog(p => ({ ...p, open: false }))}>취소</Button>
            <Button onClick={handleApprove} disabled={approveMutation.isPending || !tossLink.trim()} className="gap-2">
              {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              승인 및 전달
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
