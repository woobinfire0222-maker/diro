import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Plus, Clock, Trash, MessageCircle } from "lucide-react";
import { useGetOrders, useCreateOrder, useDeleteOrder } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OrderStatusBadge } from "@/components/shared/OrderStatusBadge";

const orderFormSchema = z.object({
  server_name: z.string().min(2, { message: "서버 이름은 2자 이상이어야 합니다." }),
  server_description: z.string().optional(),
  atmosphere: z.enum(["gaming", "community", "corporate", "social", "streaming", "education", "other"] as const),
  category_count: z.number().min(0).max(50).default(5),
  text_channel_count: z.number().min(0).max(100).default(10),
  voice_channel_count: z.number().min(0).max(100).default(5),
  desired_roles: z.string().optional(),
  desired_permissions: z.string().optional(),
  budget: z.number().min(10000, { message: "최소 예산은 10,000원입니다." }),
  additional_notes: z.string().optional(),
});

type OrderFormValues = z.infer<typeof orderFormSchema>;

export default function OrdersPage() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const isNew = searchParams.get("new") === "true";
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(isNew);
  const [step, setStep] = useState(1);
  const { toast } = useToast();

  const { data: orders, isLoading, refetch } = useGetOrders();
  const createOrderMutation = useCreateOrder();
  const deleteOrderMutation = useDeleteOrder();

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      server_name: "",
      server_description: "",
      atmosphere: "community",
      category_count: 5,
      text_channel_count: 10,
      voice_channel_count: 5,
      desired_roles: "",
      desired_permissions: "",
      budget: 50000,
      additional_notes: "",
    },
  });

  useEffect(() => {
    if (isNew) {
      setIsCreateModalOpen(true);
    }
  }, [isNew]);

  const handleModalChange = (open: boolean) => {
    setIsCreateModalOpen(open);
    if (!open) {
      // Remove ?new=true from URL if present
      if (isNew) {
        setLocation("/orders", { replace: true });
      }
      setTimeout(() => setStep(1), 300); // Reset step after animation
      form.reset();
    }
  };

  const onSubmit = async (data: OrderFormValues) => {
    try {
      await createOrderMutation.mutateAsync({ data });
      toast({
        title: "주문이 완료되었습니다",
        description: "상담원이 곧 배정되어 연락드릴 예정입니다.",
      });
      handleModalChange(false);
      refetch();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "오류 발생",
        description: "주문을 생성하지 못했습니다. 다시 시도해주세요.",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("정말로 이 주문을 취소/삭제하시겠습니까?")) {
      try {
        await deleteOrderMutation.mutateAsync({ id });
        toast({
          title: "삭제 완료",
          description: "주문이 성공적으로 삭제되었습니다.",
        });
        refetch();
      } catch (error) {
        toast({
          variant: "destructive",
          title: "오류 발생",
          description: "삭제 중 문제가 발생했습니다.",
        });
      }
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">나의 주문내역</h1>
          <p className="text-muted-foreground">요청하신 디스코드 서버 제작 진행 상황을 확인하세요.</p>
        </div>
        
        <Dialog open={isCreateModalOpen} onOpenChange={handleModalChange}>
          <DialogTrigger asChild>
            <Button className="shadow-md">
              <Plus className="mr-2 h-4 w-4" /> 새 주문 작성
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] h-[80vh] sm:h-auto flex flex-col p-0">
            <div className="p-6 border-b">
              <DialogTitle className="text-xl">새 서버 제작 주문</DialogTitle>
              <DialogDescription>
                원하시는 디스코드 서버의 형태를 알려주세요. ({step}/4단계)
              </DialogDescription>
              <div className="flex gap-1 mt-4">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className={`h-1 flex-1 rounded-full ${step >= i ? 'bg-primary' : 'bg-secondary'}`} />
                ))}
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  {step === 1 && (
                    <div className="space-y-4 animate-in slide-in-from-right-4 fade-in">
                      <FormField
                        control={form.control}
                        name="server_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>서버 이름 *</FormLabel>
                            <FormControl>
                              <Input placeholder="예: 무지개 게임 커뮤니티" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="atmosphere"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>원하는 분위기/주제 *</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="주제를 선택하세요" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="gaming">🎮 게이밍</SelectItem>
                                <SelectItem value="community">💬 종합 커뮤니티</SelectItem>
                                <SelectItem value="corporate">💼 기업/비즈니스</SelectItem>
                                <SelectItem value="social">🍻 친목/사교</SelectItem>
                                <SelectItem value="streaming">🎥 스트리머/방송용</SelectItem>
                                <SelectItem value="education">📚 교육/스터디</SelectItem>
                                <SelectItem value="other">✨ 기타</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="server_description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>간단한 서버 설명</FormLabel>
                            <FormControl>
                              <Textarea placeholder="어떤 목적으로 만들어지는 서버인가요?" className="resize-none" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {step === 2 && (
                    <div className="space-y-8 animate-in slide-in-from-right-4 fade-in">
                      <FormField
                        control={form.control}
                        name="category_count"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex justify-between">
                              <span>카테고리 개수</span>
                              <span className="text-primary font-bold">{field.value}개</span>
                            </FormLabel>
                            <FormControl>
                              <Slider min={0} max={20} step={1} value={[field.value]} onValueChange={(val) => field.onChange(val[0])} />
                            </FormControl>
                            <FormDescription>채널들을 묶는 큰 분류의 개수입니다.</FormDescription>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="text_channel_count"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex justify-between">
                              <span>텍스트 채널 개수</span>
                              <span className="text-primary font-bold">{field.value}개</span>
                            </FormLabel>
                            <FormControl>
                              <Slider min={0} max={50} step={1} value={[field.value]} onValueChange={(val) => field.onChange(val[0])} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="voice_channel_count"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex justify-between">
                              <span>음성 채널 개수</span>
                              <span className="text-primary font-bold">{field.value}개</span>
                            </FormLabel>
                            <FormControl>
                              <Slider min={0} max={50} step={1} value={[field.value]} onValueChange={(val) => field.onChange(val[0])} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {step === 3 && (
                    <div className="space-y-6 animate-in slide-in-from-right-4 fade-in">
                      <FormField
                        control={form.control}
                        name="desired_roles"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>원하는 역할(역급) 체계</FormLabel>
                            <FormControl>
                              <Textarea placeholder="예: 관리자, 매니저, VIP, 일반유저 등" className="resize-none" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="desired_permissions"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>특수 권한 요청</FormLabel>
                            <FormControl>
                              <Textarea placeholder="예: 특정 역할만 접근 가능한 비밀 채널 구성 등" className="resize-none" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {step === 4 && (
                    <div className="space-y-6 animate-in slide-in-from-right-4 fade-in">
                      <FormField
                        control={form.control}
                        name="budget"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex justify-between">
                              <span>생각하시는 예산</span>
                              <span className="text-primary font-bold">{field.value.toLocaleString()}원</span>
                            </FormLabel>
                            <FormControl>
                              <Slider min={10000} max={500000} step={10000} value={[field.value]} onValueChange={(val) => field.onChange(val[0])} />
                            </FormControl>
                            <FormDescription>요청 사항의 복잡도에 따라 실제 견적은 달라질 수 있습니다.</FormDescription>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="additional_notes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>기타 남기실 말씀</FormLabel>
                            <FormControl>
                              <Textarea placeholder="상담원에게 미리 전하고 싶은 내용이 있다면 적어주세요." className="h-32 resize-none" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </form>
              </Form>
            </div>
            
            <div className="p-6 border-t bg-muted/30 flex justify-between">
              <Button 
                variant="outline" 
                onClick={() => step > 1 ? setStep(step - 1) : handleModalChange(false)}
              >
                {step === 1 ? "취소" : "이전"}
              </Button>
              
              {step < 4 ? (
                <Button onClick={async () => {
                  const stepFields: Record<number, (keyof OrderFormValues)[]> = {
                    1: ["server_name", "atmosphere"],
                    2: ["category_count", "text_channel_count", "voice_channel_count"],
                    3: [],
                  };
                  const valid = await form.trigger(stepFields[step]);
                  if (valid) setStep(step + 1);
                }}>다음 단계</Button>
              ) : (
                <Button onClick={form.handleSubmit(onSubmit)} disabled={createOrderMutation.isPending}>
                  {createOrderMutation.isPending ? "제출 중..." : "신청 완료"}
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          Array(4).fill(0).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-1/2 mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))
        ) : orders && orders.length > 0 ? (
          orders.map((order) => (
            <Card key={order.id} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start mb-2">
                  <OrderStatusBadge status={order.status} />
                  <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded">#{order.order_number}</span>
                </div>
                <CardTitle className="text-xl">{order.server_name}</CardTitle>
                <CardDescription className="line-clamp-2 mt-1">
                  {order.server_description || "설명 없음"}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1.5"><Clock className="h-4 w-4" /> 신청일</span>
                    <span>{new Date(order.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">분위기</span>
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
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">예산</span>
                    <span className="font-medium text-primary">{order.budget.toLocaleString()}원</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-0 border-t mt-auto gap-2 p-4">
                <Button variant="default" className="flex-1" onClick={() => setLocation(`/chat/${order.id}`)}>
                  <MessageCircle className="mr-2 h-4 w-4" /> 상담하기
                </Button>
                
                {['pending', 'consulting'].includes(order.status) && (
                  <Button variant="outline" size="icon" onClick={() => handleDelete(order.id)} className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                    <Trash className="h-4 w-4" />
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))
        ) : (
          <div className="col-span-full py-20 flex flex-col items-center justify-center text-center bg-card rounded-xl border-2 border-dashed">
            <div className="h-20 w-20 rounded-full bg-secondary flex items-center justify-center mb-6">
              <Plus className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-bold mb-2">신청한 주문이 없습니다</h3>
            <p className="text-muted-foreground mb-6 max-w-md">
              전문 상담원과 1:1로 소통하며 완벽한 디스코드 서버를 구축해보세요. 복잡한 봇 설정부터 권한 체계까지 모두 알아서 해드립니다.
            </p>
            <Button size="lg" onClick={() => setIsCreateModalOpen(true)}>
              첫 주문 작성하기
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
