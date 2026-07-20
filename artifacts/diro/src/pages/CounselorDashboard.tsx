import { useState } from "react";
import { useLocation } from "wouter";
import { Search, MessageSquare, CheckCircle, Code2, Loader2, Headset, Wrench, ArrowRightLeft } from "lucide-react";
import { useGetOrders, useGetMe, Order, useUpdateOrder } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { OrderStatusBadge } from "@/components/shared/OrderStatusBadge";
import { useToast } from "@/hooks/use-toast";

type ExtendedOrder = Order & { developer_id?: string | null };

export default function CounselorDashboard() {
  const [, setLocation] = useLocation();
  const { data: user } = useGetMe();
  const { data: orders, isLoading, refetch } = useGetOrders();
  const [search, setSearch] = useState("");
  const updateOrderMutation = useUpdateOrder();
  const { toast } = useToast();
  const [takingOverId, setTakingOverId] = useState<string | null>(null);
  const [transferringId, setTransferringId] = useState<string | null>(null);

  const isDeveloper = user?.role === "developer";
  const isCounselor = user?.role === "counselor";
  const isAdmin = user?.role === "admin";

  if (!isCounselor && !isDeveloper && !isAdmin) {
    return <div className="p-8 text-center text-destructive">접근 권한이 없습니다.</div>;
  }

  // 상담사: 대기 중인 주문 배정
  const handleTakeOrder = async (orderId: string) => {
    try {
      await updateOrderMutation.mutateAsync({
        id: orderId,
        data: { status: "consulting", counselor_id: user!.id },
      });
      toast({ title: "주문을 배정받았습니다." });
      refetch();
    } catch {
      toast({ variant: "destructive", title: "배정 실패" });
    }
  };

  // 상담사: 개발자에게 넘기기 → status: transferred
  const handleTransferToDeveloper = async (orderId: string) => {
    setTransferringId(orderId);
    try {
      await updateOrderMutation.mutateAsync({
        id: orderId,
        data: { status: "transferred" as any },
      });
      toast({ title: "개발자에게 넘겼습니다.", description: "개발자의 이어받기 목록에 표시됩니다." });
      refetch();
    } catch {
      toast({ variant: "destructive", title: "넘기기 실패" });
    } finally {
      setTransferringId(null);
    }
  };

  // 개발자: 이어받기 → status: building
  const handleTakeoverOrder = async (orderId: string) => {
    setTakingOverId(orderId);
    try {
      await updateOrderMutation.mutateAsync({
        id: orderId,
        data: { developer_id: user!.id, status: "building" },
      });
      toast({ title: "개발 담당으로 이어받았습니다." });
      refetch();
    } catch {
      toast({ variant: "destructive", title: "이어받기 실패" });
    } finally {
      setTakingOverId(null);
    }
  };

  const extOrders = (orders || []) as ExtendedOrder[];

  const filteredOrders = extOrders.filter(
    (o) =>
      o.server_name.toLowerCase().includes(search.toLowerCase()) ||
      o.order_number.toLowerCase().includes(search.toLowerCase()),
  );

  // ── 상담사 탭 ──
  const pendingOrders = filteredOrders.filter((o) => o.status === "pending");
  // 내 담당: consulting + transferred (아직 개발자가 이어받기 전)
  const myConsultingOrders = filteredOrders.filter(
    (o) => o.counselor_id === user?.id && !["completed", "cancelled"].includes(o.status),
  );
  const completedOrders = filteredOrders.filter(
    (o) => o.counselor_id === user?.id && o.status === "completed",
  );

  // ── 개발자 탭 ── 상담사가 명시적으로 넘긴(transferred) 주문만 이어받기 가능
  const transferredToPickup = filteredOrders.filter((o) => o.status === "transferred");
  const myBuildingOrders = filteredOrders.filter(
    (o) => o.developer_id === user?.id && !["completed", "cancelled"].includes(o.status),
  );
  const devCompletedOrders = filteredOrders.filter(
    (o) => o.developer_id === user?.id && o.status === "completed",
  );

  // ── 상담사 카드 ──
  const renderCounselorCard = (order: ExtendedOrder, isMine: boolean) => (
    <Card key={order.id} className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start mb-2">
          <OrderStatusBadge status={order.status} />
          <span className="text-xs font-mono bg-muted px-2 py-1 rounded">#{order.order_number}</span>
        </div>
        <CardTitle className="text-lg">{order.server_name}</CardTitle>
        <div className="flex items-center gap-2 mt-2">
          <Avatar className="h-6 w-6">
            <AvatarImage src={order.user_avatar || undefined} />
            <AvatarFallback>{order.user_username?.charAt(0) || "U"}</AvatarFallback>
          </Avatar>
          <span className="text-sm text-muted-foreground">
            {order.user_display_name || order.user_username}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-secondary/50 p-2 rounded">
            <span className="text-xs text-muted-foreground block">예산</span>
            <span className="font-medium">{order.budget.toLocaleString()}원</span>
          </div>
          <div className="bg-secondary/50 p-2 rounded">
            <span className="text-xs text-muted-foreground block">유형</span>
            <span className="font-medium">{order.atmosphere}</span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="pt-0 border-t mt-auto p-4 gap-2">
        {isMine ? (
          <>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setLocation(`/chat/${order.id}`)}
            >
              <MessageSquare className="mr-2 h-4 w-4" /> 채팅
            </Button>
            {/* 상담 중(consulting) 상태일 때만 넘기기 가능 */}
            {order.status === "consulting" ? (
              <Button
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                onClick={() => handleTransferToDeveloper(order.id)}
                disabled={transferringId === order.id}
              >
                {transferringId === order.id ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRightLeft className="mr-2 h-4 w-4" />
                )}
                개발자에게 넘기기
              </Button>
            ) : order.status === "transferred" ? (
              <Button variant="secondary" className="flex-1" disabled>
                <ArrowRightLeft className="mr-2 h-4 w-4" />
                개발 대기 중
              </Button>
            ) : null}
          </>
        ) : (
          <Button
            className="w-full"
            onClick={() => handleTakeOrder(order.id)}
            disabled={updateOrderMutation.isPending}
          >
            <CheckCircle className="mr-2 h-4 w-4" /> 내 담당으로 배정받기
          </Button>
        )}
      </CardFooter>
    </Card>
  );

  // ── 개발자 카드 ──
  const renderDevCard = (order: ExtendedOrder, isMine: boolean) => (
    <Card key={order.id} className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start mb-2">
          <OrderStatusBadge status={order.status} />
          <span className="text-xs font-mono bg-muted px-2 py-1 rounded">#{order.order_number}</span>
        </div>
        <CardTitle className="text-lg">{order.server_name}</CardTitle>
        <div className="flex items-center gap-2 mt-2">
          <Avatar className="h-6 w-6">
            <AvatarImage src={order.user_avatar || undefined} />
            <AvatarFallback>{order.user_username?.charAt(0) || "U"}</AvatarFallback>
          </Avatar>
          <span className="text-sm text-muted-foreground">
            {order.user_display_name || order.user_username}
          </span>
        </div>
        {!isMine && order.counselor_username && (
          <p className="text-xs text-muted-foreground mt-1">상담사: {order.counselor_username}</p>
        )}
      </CardHeader>
      <CardContent className="flex-1">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-secondary/50 p-2 rounded">
            <span className="text-xs text-muted-foreground block">예산</span>
            <span className="font-medium">{order.budget.toLocaleString()}원</span>
          </div>
          <div className="bg-secondary/50 p-2 rounded">
            <span className="text-xs text-muted-foreground block">유형</span>
            <span className="font-medium">{order.atmosphere}</span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="pt-0 border-t mt-auto p-4 gap-2">
        {isMine ? (
          <>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setLocation(`/chat/${order.id}`)}
            >
              <MessageSquare className="mr-2 h-4 w-4" /> 채팅
            </Button>
            <Button
              className="flex-1 bg-[#5865F2] hover:bg-[#4752C4] text-white"
              onClick={() => setLocation(`/counselor/editor/${order.id}`)}
            >
              <Wrench className="mr-2 h-4 w-4" /> 에디터
            </Button>
          </>
        ) : (
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => handleTakeoverOrder(order.id)}
            disabled={takingOverId === order.id}
          >
            {takingOverId === order.id ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Code2 className="mr-2 h-4 w-4" />
            )}
            개발 이어받기
          </Button>
        )}
      </CardFooter>
    </Card>
  );

  const EmptyState = ({ text }: { text: string }) => (
    <div className="col-span-full py-12 text-center text-muted-foreground border rounded-xl">
      {text}
    </div>
  );

  // ── 상담사 섹션 ──
  const CounselorSection = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Headset className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">상담원 뷰</h2>
        <span className="text-xs text-muted-foreground">— 고객 요청 배정 및 상담 관리</span>
      </div>
      <Tabs defaultValue="mine" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="mine">내 담당 진행중 ({myConsultingOrders.length})</TabsTrigger>
          <TabsTrigger value="pending">새로운 요청 ({pendingOrders.length})</TabsTrigger>
          <TabsTrigger value="completed">완료됨 ({completedOrders.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="mine" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myConsultingOrders.length > 0
              ? myConsultingOrders.map((o) => renderCounselorCard(o, true))
              : <EmptyState text="진행 중인 담당 프로젝트가 없습니다." />}
          </div>
        </TabsContent>
        <TabsContent value="pending" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pendingOrders.length > 0
              ? pendingOrders.map((o) => renderCounselorCard(o, false))
              : <EmptyState text="대기 중인 새로운 요청이 없습니다." />}
          </div>
        </TabsContent>
        <TabsContent value="completed" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {completedOrders.length > 0
              ? completedOrders.map((o) => renderCounselorCard(o, true))
              : <EmptyState text="완료된 프로젝트가 없습니다." />}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );

  // ── 개발자 섹션 ──
  const DevSection = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Wrench className="h-4 w-4 text-emerald-500" />
        <h2 className="text-base font-semibold">개발자 뷰</h2>
        <span className="text-xs text-muted-foreground">— 개발 이어받기 및 가격 확정</span>
      </div>
      <Tabs defaultValue="pickup" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="pickup">이어받기 ({transferredToPickup.length})</TabsTrigger>
          <TabsTrigger value="mine">내 개발 진행중 ({myBuildingOrders.length})</TabsTrigger>
          <TabsTrigger value="done">완료됨 ({devCompletedOrders.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="pickup" className="mt-4">
          <p className="text-sm text-muted-foreground mb-4">
            상담사가 개발자에게 넘긴 주문입니다. 이어받기를 클릭하면 내 담당이 됩니다.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {transferredToPickup.length > 0
              ? transferredToPickup.map((o) => renderDevCard(o, false))
              : <EmptyState text="이어받을 수 있는 주문이 없습니다. 상담사가 넘긴 주문이 여기 표시됩니다." />}
          </div>
        </TabsContent>
        <TabsContent value="mine" className="mt-4">
          <p className="text-sm text-muted-foreground mb-4">
            채팅 버튼을 눌러 신청자와 소통하고, 채팅 화면에서 가격을 확정하세요.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myBuildingOrders.length > 0
              ? myBuildingOrders.map((o) => renderDevCard(o, true))
              : <EmptyState text="진행 중인 개발 프로젝트가 없습니다." />}
          </div>
        </TabsContent>
        <TabsContent value="done" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {devCompletedOrders.length > 0
              ? devCompletedOrders.map((o) => renderDevCard(o, true))
              : <EmptyState text="완료된 프로젝트가 없습니다." />}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary flex items-center gap-2">
            <span
              className={`text-xs px-2 py-1 rounded ${
                isAdmin
                  ? "bg-purple-600 text-white"
                  : isDeveloper
                  ? "bg-emerald-500 text-white"
                  : "bg-primary text-primary-foreground"
              }`}
            >
              {isAdmin ? "슈퍼관리자" : isDeveloper ? "개발자" : "상담원"}
            </span>
            DIRO 파트너 대시보드
          </h1>
          <p className="text-muted-foreground">
            {isAdmin
              ? "상담원과 개발자의 모든 작업 현황을 한눈에 확인하세요."
              : isDeveloper
              ? "상담사가 넘긴 주문을 이어받아 서버를 제작하고 가격을 설정하세요."
              : "고객의 요청을 확인하고 상담 후 개발자에게 넘겨주세요."}
          </p>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="주문번호, 서버명 검색..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {isAdmin ? (
        <div className="space-y-10">
          {CounselorSection()}
          <div className="border-t pt-8">{DevSection()}</div>
        </div>
      ) : isDeveloper ? (
        DevSection()
      ) : (
        CounselorSection()
      )}
    </div>
  );
}
