import { useLocation } from "wouter";
import { Plus, ArrowRight, MessageCircle, Clock, Zap } from "lucide-react";
import { useGetOrders, useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderStatusBadge } from "@/components/shared/OrderStatusBadge";

export default function HomePage() {
  const [, setLocation] = useLocation();
  const { data: user } = useGetMe();
  const { data: orders, isLoading } = useGetOrders({ limit: 3 });

  const activeOrders = orders?.filter(o => !['completed', 'cancelled'].includes(o.status)) || [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">안녕하세요, {user?.display_name || user?.username}님.</h1>
          <p className="text-muted-foreground text-lg">오늘도 멋진 커뮤니티를 만들어볼까요?</p>
        </div>
        <Button size="lg" className="rounded-full shadow-lg shadow-primary/25 group" onClick={() => setLocation("/orders?new=true")}>
          <Plus className="mr-2 h-5 w-5 transition-transform group-hover:rotate-90" />
          주문 신청하기
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-gradient-to-br from-primary/10 to-transparent border-primary/20 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              진행 중인 프로젝트
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{isLoading ? <Skeleton className="h-10 w-16" /> : activeOrders.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-muted-foreground">
              <MessageCircle className="h-5 w-5" />
              읽지 않은 메시지
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">0</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-muted-foreground">
              <Clock className="h-5 w-5" />
              완료된 프로젝트
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">
              {isLoading ? <Skeleton className="h-10 w-16" /> : (orders?.filter(o => o.status === 'completed').length || 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">최근 주문</h2>
          <Button variant="ghost" onClick={() => setLocation("/orders")} className="text-muted-foreground hover:text-foreground">
            모두 보기 <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading ? (
            Array(3).fill(0).map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <CardHeader>
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
              </Card>
            ))
          ) : orders && orders.length > 0 ? (
            orders.slice(0, 3).map((order) => (
              <Card key={order.id} className="group hover:border-primary/50 transition-colors cursor-pointer" onClick={() => setLocation(`/chat/${order.id}`)}>
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start mb-2">
                    <OrderStatusBadge status={order.status} />
                    <span className="text-xs text-muted-foreground font-mono">{order.order_number}</span>
                  </div>
                  <CardTitle className="text-xl group-hover:text-primary transition-colors">{order.server_name}</CardTitle>
                  <CardDescription className="line-clamp-1">{order.server_description || "설명 없음"}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge variant="secondary">{
                      {
                        gaming: '게이밍',
                        community: '커뮤니티',
                        corporate: '기업/비즈니스',
                        social: '친목',
                        streaming: '스트리머/방송',
                        education: '교육/스터디',
                        other: '기타'
                      }[order.atmosphere] || order.atmosphere
                    }</Badge>
                    <Badge variant="outline">예산: {order.budget.toLocaleString()}원</Badge>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="col-span-full py-12 flex flex-col items-center justify-center border-2 border-dashed rounded-xl bg-card/50 text-center">
              <ShoppingBag className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">아직 주문 내역이 없습니다</h3>
              <p className="text-muted-foreground mb-6">첫 번째 디스코드 서버 제작을 시작해보세요!</p>
              <Button onClick={() => setLocation("/orders?new=true")}>
                주문 신청하기
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
