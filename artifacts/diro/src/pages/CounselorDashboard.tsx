import { useState } from "react";
import { useLocation } from "wouter";
import { Search, Filter, MessageSquare, Play, CheckCircle } from "lucide-react";
import { useGetOrders, useGetMe, Order, useUpdateOrder } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { OrderStatusBadge } from "@/components/shared/OrderStatusBadge";
import { useToast } from "@/hooks/use-toast";

export default function CounselorDashboard() {
  const [, setLocation] = useLocation();
  const { data: user } = useGetMe();
  const { data: orders, isLoading, refetch } = useGetOrders();
  const [search, setSearch] = useState("");
  const updateOrderMutation = useUpdateOrder();
  const { toast } = useToast();

  if (user?.role !== "counselor" && user?.role !== "admin") {
    return <div className="p-8 text-center text-destructive">접근 권한이 없습니다.</div>;
  }

  const handleTakeOrder = async (orderId: string) => {
    try {
      await updateOrderMutation.mutateAsync({
        id: orderId,
        data: {
          status: "consulting",
          counselor_id: user.id
        }
      });
      toast({ title: "주문을 배정받았습니다." });
      refetch();
    } catch (e) {
      toast({ variant: "destructive", title: "배정 실패" });
    }
  };

  const filteredOrders = orders?.filter(o => 
    o.server_name.toLowerCase().includes(search.toLowerCase()) || 
    o.order_number.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const pendingOrders = filteredOrders.filter(o => o.status === "pending");
  const myOrders = filteredOrders.filter(o => o.counselor_id === user.id && o.status !== "completed");
  const completedOrders = filteredOrders.filter(o => o.counselor_id === user.id && o.status === "completed");

  const renderOrderCard = (order: Order, isMine: boolean) => (
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
            <AvatarFallback>{order.user_username?.charAt(0) || 'U'}</AvatarFallback>
          </Avatar>
          <span className="text-sm text-muted-foreground">{order.user_display_name || order.user_username}</span>
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
            <Button variant="outline" className="flex-1" onClick={() => setLocation(`/chat/${order.id}`)}>
              <MessageSquare className="mr-2 h-4 w-4" /> 채팅
            </Button>
            <Button variant="default" className="flex-1 bg-[#5865F2] hover:bg-[#4752C4]" onClick={() => setLocation(`/counselor/editor/${order.id}`)}>
              <Play className="mr-2 h-4 w-4" /> 에디터
            </Button>
          </>
        ) : (
          <Button className="w-full" onClick={() => handleTakeOrder(order.id)} disabled={updateOrderMutation.isPending}>
            <CheckCircle className="mr-2 h-4 w-4" /> 내 담당으로 배정받기
          </Button>
        )}
      </CardFooter>
    </Card>
  );

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary flex items-center gap-2">
            <span className="bg-primary text-primary-foreground text-xs px-2 py-1 rounded">상담원</span>
            DIRO 파트너 대시보드
          </h1>
          <p className="text-muted-foreground">고객의 요청을 확인하고 최고의 서버를 제작해주세요.</p>
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

      <Tabs defaultValue="mine" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="mine">내 담당 진행중 ({myOrders.length})</TabsTrigger>
          <TabsTrigger value="pending">새로운 요청 ({pendingOrders.length})</TabsTrigger>
          <TabsTrigger value="completed">완료됨 ({completedOrders.length})</TabsTrigger>
        </TabsList>
        
        <TabsContent value="mine" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myOrders.length > 0 ? myOrders.map(o => renderOrderCard(o, true)) : (
              <div className="col-span-full py-12 text-center text-muted-foreground border rounded-xl">진행 중인 담당 프로젝트가 없습니다.</div>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="pending" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pendingOrders.length > 0 ? pendingOrders.map(o => renderOrderCard(o, false)) : (
              <div className="col-span-full py-12 text-center text-muted-foreground border rounded-xl">대기 중인 새로운 요청이 없습니다.</div>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="completed" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {completedOrders.length > 0 ? completedOrders.map(o => renderOrderCard(o, true)) : (
              <div className="col-span-full py-12 text-center text-muted-foreground border rounded-xl">완료된 프로젝트가 없습니다.</div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
