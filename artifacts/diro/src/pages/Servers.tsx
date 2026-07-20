import { useLocation } from "wouter";
import { Server, ExternalLink } from "lucide-react";
import { useGetOrders, useGetMe } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderStatusBadge } from "@/components/shared/OrderStatusBadge";

export default function ServersPage() {
  const [, setLocation] = useLocation();
  const { data: orders, isLoading } = useGetOrders();
  const { data: me } = useGetMe();

  // 내가 신청해서 완성된 서버만 표시
  const activeServers = orders?.filter(o =>
    o.status === "completed" && o.user_id === me?.id
  ) || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">내 서버 관리</h1>
          <p className="text-muted-foreground">구축 완료된 서버와 진행 중인 서버를 확인하세요.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {isLoading ? (
          Array(2).fill(0).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-1/2 mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-32 w-full rounded-xl" />
              </CardContent>
            </Card>
          ))
        ) : activeServers.length > 0 ? (
          activeServers.map(server => (
            <Card key={server.id} className="overflow-hidden flex flex-col relative">
              {/* Preview Banner */}
              <div className="h-32 bg-gradient-to-r from-primary/80 to-accent/80 flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-black/10 backdrop-blur-sm" />
                <div className="h-16 w-16 rounded-2xl bg-white/20 backdrop-blur-md shadow-xl flex items-center justify-center text-white z-10 text-2xl font-bold border border-white/30">
                  {server.server_name.charAt(0)}
                </div>
              </div>

              <CardHeader className="relative pt-6">
                <div className="absolute -top-4 right-4 bg-background rounded-full p-1 shadow-sm">
                  <OrderStatusBadge status={server.status} />
                </div>
                <CardTitle>{server.server_name}</CardTitle>
                <CardDescription>{server.server_description || "설명이 없습니다."}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3 bg-secondary/50 rounded-lg">
                    <span className="text-muted-foreground block mb-1">채널 수</span>
                    <span className="font-semibold">{(server.text_channel_count || 0) + (server.voice_channel_count || 0)}개</span>
                  </div>
                  <div className="p-3 bg-secondary/50 rounded-lg">
                    <span className="text-muted-foreground block mb-1">카테고리 수</span>
                    <span className="font-semibold">{server.category_count || 0}개</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="bg-muted/30 border-t p-4 flex gap-2">
                <Button
                  className="flex-1"
                  variant={server.status === "completed" ? "default" : "secondary"}
                  disabled={server.status !== "completed"}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {server.status === "completed" ? "디스코드에서 열기" : "적용 대기 중"}
                </Button>
                {server.status === "building" && (
                  <Button variant="outline" onClick={() => setLocation(`/chat/${server.id}`)}>
                    진행 상황 보기
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))
        ) : (
          <div className="col-span-full py-20 flex flex-col items-center justify-center text-center bg-card rounded-xl border border-dashed">
            <div className="h-20 w-20 rounded-full bg-secondary flex items-center justify-center mb-6">
              <Server className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-bold mb-2">관리 중인 서버가 없습니다</h3>
            <p className="text-muted-foreground mb-6 max-w-md">
              주문이 접수되어 제작이 시작되면 여기에 서버가 표시됩니다.
            </p>
            <Button onClick={() => setLocation("/orders?new=true")}>주문하기</Button>
          </div>
        )}
      </div>
    </div>
  );
}
