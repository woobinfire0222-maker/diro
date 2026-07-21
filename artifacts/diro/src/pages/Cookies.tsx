import { useState } from "react";
import { Cookie, TrendingUp, TrendingDown, Gift, ShoppingBag, RotateCcw, Shield, Plus, Minus, Search, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useGetMe, useGetCookieBalance, useGetCookieTransactions, useGetAllCookieTransactions, useGetAdminUsers, useAdminGrantCookies, type CookieTransaction } from "@/lib/db";
import { cn } from "@/lib/utils";

// ─── 타입 아이콘 매핑 ──────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  CookieTransaction["type"],
  { label: string; icon: React.ReactNode; color: string; sign: "+" | "-" }
> = {
  admin_grant:    { label: "관리자 지급",   icon: <Gift className="h-3.5 w-3.5" />,        color: "text-emerald-500",  sign: "+" },
  order_complete: { label: "주문 완료 보상", icon: <ShoppingBag className="h-3.5 w-3.5" />, color: "text-blue-500",     sign: "+" },
  refund:         { label: "환불",           icon: <RotateCcw className="h-3.5 w-3.5" />,   color: "text-amber-500",    sign: "+" },
  spend:          { label: "사용",           icon: <Cookie className="h-3.5 w-3.5" />,       color: "text-muted-foreground", sign: "-" },
  admin_deduct:   { label: "관리자 차감",    icon: <Shield className="h-3.5 w-3.5" />,       color: "text-destructive",  sign: "-" },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금 전";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}일 전`;
  return new Date(dateStr).toLocaleDateString("ko-KR");
}

// ─── 거래 내역 행 ──────────────────────────────────────────────────────────────

function TxRow({
  tx,
  showTarget,
}: {
  tx: CookieTransaction & { target_username?: string; target_display_name?: string };
  showTarget?: boolean;
}) {
  const cfg = TYPE_CONFIG[tx.type] ?? TYPE_CONFIG.admin_grant;
  const isPositive = tx.amount > 0;

  return (
    <div className="flex items-center gap-3 py-3 px-4 border-b last:border-0 hover:bg-secondary/30 transition-colors">
      {/* 아이콘 */}
      <div className={cn(
        "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
        isPositive ? "bg-emerald-500/10" : "bg-destructive/10"
      )}>
        <span className={cfg.color}>{cfg.icon}</span>
      </div>

      {/* 설명 */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{tx.description}</p>
        <p className="text-[11px] text-muted-foreground flex gap-1.5 items-center flex-wrap">
          <span>{cfg.label}</span>
          {showTarget && (tx.target_display_name || tx.target_username) && (
            <>
              <span>·</span>
              <span>@{tx.target_display_name || tx.target_username}</span>
            </>
          )}
          {(tx.created_by_display_name || tx.created_by_username) && (
            <>
              <span>·</span>
              <span>by {tx.created_by_display_name || tx.created_by_username}</span>
            </>
          )}
          <span>·</span>
          <span>{timeAgo(tx.created_at)}</span>
        </p>
      </div>

      {/* 금액 */}
      <p className={cn(
        "text-sm font-bold tabular-nums shrink-0",
        isPositive ? "text-emerald-500" : "text-destructive"
      )}>
        {cfg.sign}{Math.abs(tx.amount).toLocaleString()}🍪
      </p>
    </div>
  );
}

// ─── 쿠키 지급 다이얼로그 ─────────────────────────────────────────────────────

function GrantDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const { data: users, isLoading: usersLoading } = useGetAdminUsers({ limit: 200 });
  const grantMutation = useAdminGrantCookies();

  const [search, setSearch]       = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amount, setAmount]       = useState("");
  const [desc, setDesc]           = useState("");
  const [isDeduct, setIsDeduct]   = useState(false);

  const filtered = (users ?? []).filter(u =>
    `${u.display_name} ${u.username} ${u.email}`.toLowerCase().includes(search.toLowerCase())
  );
  const selectedUser = (users ?? []).find(u => u.id === selectedId);

  const handleSubmit = async () => {
    if (!selectedId) return toast({ variant: "destructive", title: "대상 유저를 선택해주세요." });
    const n = parseInt(amount, 10);
    if (!n || n <= 0) return toast({ variant: "destructive", title: "올바른 수량을 입력해주세요." });
    if (!desc.trim()) return toast({ variant: "destructive", title: "사유를 입력해주세요." });

    try {
      await grantMutation.mutateAsync({
        targetUserId: selectedId,
        amount: isDeduct ? -n : n,
        description: desc.trim(),
      });
      toast({ title: `🍪 ${isDeduct ? "차감" : "지급"} 완료!`, description: `${selectedUser?.display_name || selectedUser?.username}에게 ${n.toLocaleString()}쿠키 ${isDeduct ? "차감" : "지급"} 완료` });
      setAmount(""); setDesc(""); setSelectedId(null); setSearch("");
      onClose();
    } catch (e) {
      toast({ variant: "destructive", title: "실패", description: String(e) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cookie className="h-5 w-5 text-amber-500" />
            쿠키 지급 / 차감
          </DialogTitle>
          <DialogDescription>관리자 권한으로 유저에게 쿠키를 지급하거나 차감합니다.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 지급 / 차감 토글 */}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={!isDeduct ? "default" : "outline"}
              onClick={() => setIsDeduct(false)}
              className="flex-1 gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              지급
            </Button>
            <Button
              size="sm"
              variant={isDeduct ? "destructive" : "outline"}
              onClick={() => setIsDeduct(true)}
              className="flex-1 gap-1.5"
            >
              <Minus className="h-3.5 w-3.5" />
              차감
            </Button>
          </div>

          {/* 유저 검색 */}
          <div className="space-y-1.5">
            <Label>대상 유저</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="이름 또는 이메일 검색..."
                className="pl-9"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {selectedUser && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-sm">
                <Cookie className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium">{selectedUser.display_name || selectedUser.username}</span>
                <Badge variant="outline" className="ml-auto text-xs">현재 {(selectedUser as any).cookie_balance ?? 0}🍪</Badge>
              </div>
            )}
            {search && !selectedUser && (
              <ScrollArea className="max-h-40 border rounded-lg">
                {usersLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : filtered.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">검색 결과 없음</p>
                ) : (
                  <div>
                    {filtered.slice(0, 20).map(u => (
                      <button
                        key={u.id}
                        onClick={() => { setSelectedId(u.id); setSearch(""); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-secondary text-left border-b last:border-0 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{u.display_name || u.username}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{(u as any).cookie_balance ?? 0}🍪</span>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            )}
          </div>

          {/* 수량 */}
          <div className="space-y-1.5">
            <Label>쿠키 수량</Label>
            <Input
              type="number"
              min={1}
              placeholder="예: 100"
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
          </div>

          {/* 사유 */}
          <div className="space-y-1.5">
            <Label>사유</Label>
            <Textarea
              placeholder="지급/차감 사유를 입력해주세요"
              rows={2}
              value={desc}
              onChange={e => setDesc(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>취소</Button>
          <Button
            className="flex-1"
            variant={isDeduct ? "destructive" : "default"}
            onClick={handleSubmit}
            disabled={grantMutation.isPending}
          >
            {grantMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (isDeduct ? "차감하기" : "지급하기")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────

export default function CookiesPage() {
  const { data: me }      = useGetMe();
  const { data: balance, isLoading: balanceLoading } = useGetCookieBalance();
  const { data: myTxs,   isLoading: txLoading }      = useGetCookieTransactions();
  const { data: allTxs,  isLoading: allTxLoading }   = useGetAllCookieTransactions({
    query: { enabled: me?.role === "admin" || me?.username === "bini2222" },
  });

  const [grantOpen, setGrantOpen] = useState(false);

  const isAdmin = me?.role === "admin" || me?.username === "bini2222";

  const earned = (myTxs ?? []).filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const spent  = (myTxs ?? []).filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Cookie className="h-6 w-6 text-amber-500" />
            쿠키 지갑
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            DIRO 서비스를 이용하며 획득한 쿠키를 확인하세요
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setGrantOpen(true)} className="gap-2 shrink-0">
            <Gift className="h-4 w-4" />
            쿠키 지급
          </Button>
        )}
      </div>

      {/* 잔액 카드 + 통계 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* 현재 잔액 */}
        <Card className="sm:col-span-1 border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-orange-500/5">
          <CardContent className="pt-6 pb-5">
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-3">현재 잔액</p>
            <div className="flex items-end gap-2">
              {balanceLoading ? (
                <div className="h-10 w-24 rounded-lg bg-secondary animate-pulse" />
              ) : (
                <p className="text-4xl font-black tabular-nums">{(balance ?? 0).toLocaleString()}</p>
              )}
              <span className="text-2xl mb-0.5">🍪</span>
            </div>
          </CardContent>
        </Card>

        {/* 총 획득 */}
        <Card>
          <CardContent className="pt-6 pb-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
              총 획득
            </p>
            <p className="text-3xl font-bold text-emerald-500 tabular-nums">+{earned.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">{(myTxs ?? []).filter(t => t.amount > 0).length}건</p>
          </CardContent>
        </Card>

        {/* 총 사용 */}
        <Card>
          <CardContent className="pt-6 pb-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5 text-destructive" />
              총 사용
            </p>
            <p className="text-3xl font-bold text-destructive tabular-nums">-{spent.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">{(myTxs ?? []).filter(t => t.amount < 0).length}건</p>
          </CardContent>
        </Card>
      </div>

      {/* 내 거래 내역 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">내 거래 내역</CardTitle>
          <CardDescription>쿠키 획득·사용 내역을 최신순으로 표시합니다</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {txLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (myTxs ?? []).length === 0 ? (
            <div className="py-14 text-center text-muted-foreground">
              <Cookie className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">거래 내역이 없습니다</p>
            </div>
          ) : (
            <ScrollArea className="max-h-96">
              {(myTxs ?? []).map(tx => (
                <TxRow key={tx.id} tx={tx} />
              ))}
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* 관리자: 전체 거래 내역 */}
      {isAdmin && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              전체 거래 내역 (관리자)
            </CardTitle>
            <CardDescription>모든 유저의 쿠키 거래 내역</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {allTxLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (allTxs ?? []).length === 0 ? (
              <div className="py-14 text-center text-muted-foreground">
                <p className="text-sm">내역 없음</p>
              </div>
            ) : (
              <ScrollArea className="max-h-96">
                {(allTxs ?? []).map(tx => (
                  <TxRow key={tx.id} tx={tx as any} showTarget />
                ))}
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      )}

      {/* 쿠키 안내 */}
      <Card className="bg-secondary/30 border-dashed">
        <CardContent className="pt-5 pb-5">
          <p className="text-xs font-semibold text-muted-foreground mb-3">🍪 쿠키란?</p>
          <ul className="text-sm text-muted-foreground space-y-1.5">
            <li>• 주문 완료, 이벤트, 관리자 지급 등을 통해 쿠키를 획득할 수 있습니다</li>
            <li>• 쿠키는 향후 서비스 할인·우선 접수 등에 활용될 예정입니다</li>
            <li>• 쿠키는 현금으로 환불되지 않습니다</li>
          </ul>
        </CardContent>
      </Card>

      {/* 지급 다이얼로그 */}
      <GrantDialog open={grantOpen} onClose={() => setGrantOpen(false)} />
    </div>
  );
}
