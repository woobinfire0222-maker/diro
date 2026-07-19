import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { Send, Image as ImageIcon, Paperclip, Loader2, Info, MessageCircle, DollarSign, X, CheckCircle2 } from "lucide-react";
import { useGetOrders, useListMessages, useSendMessage, useGetMe, useRequestPaymentApproval, Message, Order } from "@/lib/db";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderStatusBadge } from "@/components/shared/OrderStatusBadge";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

type ExtendedOrder = Order & { developer_id?: string | null };

function ChatMessage({ message, isMe }: { message: Message, isMe: boolean }) {
  if (message.type === 'system') {
    return (
      <div className="flex justify-center my-4">
        <span className="text-xs bg-muted text-muted-foreground px-3 py-1 rounded-full italic">
          {message.content}
        </span>
      </div>
    );
  }

  if (message.type === 'payment') {
    return (
      <div className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'} mb-4`}>
        <div className="bg-card border rounded-xl p-4 max-w-sm w-full shadow-sm">
          <div className="flex items-center gap-2 mb-3 text-primary font-bold">
            <span className="h-8 w-8 bg-primary/10 rounded-full flex items-center justify-center">💳</span>
            결제 요청
          </div>
          <p className="text-sm mb-4">{message.content}</p>
          <Button className="w-full" asChild>
            <a href={message.metadata_json ? JSON.parse(message.metadata_json).deeplink : '#'} target="_blank" rel="noreferrer">
              송금하기 (Toss)
            </a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-3 mb-6 ${isMe ? 'flex-row-reverse' : ''} group`}>
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarImage src={message.sender_avatar || undefined} />
        <AvatarFallback>{message.sender_display_name?.charAt(0) || message.sender_username?.charAt(0) || 'U'}</AvatarFallback>
      </Avatar>
      <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[70%]`}>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-sm font-semibold">{message.sender_display_name || message.sender_username}</span>
          <span className="text-xs text-muted-foreground">{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div className={`px-4 py-2.5 rounded-2xl ${isMe ? 'bg-primary text-primary-foreground rounded-tr-none' : 'bg-card border shadow-sm rounded-tl-none'}`}>
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </div>
    </div>
  );
}

// Panel for developer to confirm price and request bini2222 approval
function DevPricePanel({ order, onClose }: { order: ExtendedOrder; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();
  const requestApproval = useRequestPaymentApproval();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amount.replace(/,/g, ""));
    if (!numAmount || numAmount <= 0) {
      toast({ variant: "destructive", title: "올바른 금액을 입력해주세요." });
      return;
    }

    try {
      const result = await requestApproval.mutateAsync({ orderId: order.id, amount: numAmount });
      setSubmitted(true);
      toast({
        title: "✅ 승인 요청 전송됨",
        description: result.discord_notified
          ? "bini2222에게 Discord DM으로 알림이 전송되었습니다."
          : "결제 요청이 생성되었습니다. 관리자 패널에서 확인 가능합니다.",
      });
    } catch (e) {
      toast({ variant: "destructive", title: "전송 실패", description: String(e) });
    }
  };

  if (submitted) {
    return (
      <div className="border-t bg-emerald-50 dark:bg-emerald-950/30 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium text-sm">승인 요청이 전송되었습니다. bini2222의 Discord DM을 기다리세요.</span>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t bg-amber-50 dark:bg-amber-950/20 p-4">
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center shrink-0">
          <DollarSign className="h-4 w-4 text-amber-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold mb-1">💰 가격 확정 및 승인 요청</p>
          <p className="text-xs text-muted-foreground mb-3">
            금액을 입력하고 확인하면 bini2222에게 Discord DM으로 승인 요청이 전송됩니다.
            승인 후 신청자 채팅에 토스 송금 버튼이 자동으로 표시됩니다.
          </p>
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">₩</span>
              <Input
                type="text"
                placeholder="예: 30000"
                value={amount}
                onChange={e => setAmount(e.target.value.replace(/[^0-9,]/g, ""))}
                className="pl-7 h-9"
                required
              />
            </div>
            <Button
              type="submit"
              size="sm"
              className="bg-amber-500 hover:bg-amber-600 text-white h-9"
              disabled={requestApproval.isPending}
            >
              {requestApproval.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "승인 요청 전송"}
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9" type="button" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [, params] = useRoute("/chat/:orderId");
  const [, setLocation] = useLocation();
  const selectedOrderId = params?.orderId;
  const [content, setContent] = useState("");
  const [showPricePanel, setShowPricePanel] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: user } = useGetMe();
  const { data: orders, isLoading: isOrdersLoading } = useGetOrders();
  const { data: messages, isLoading: isMessagesLoading, refetch } = useListMessages(selectedOrderId!, {
    query: { enabled: !!selectedOrderId }
  });
  
  const sendMessageMutation = useSendMessage();

  const extOrders = (orders || []) as ExtendedOrder[];
  const selectedOrder = extOrders.find(o => o.id === selectedOrderId);

  // Any staff member who is the developer_id on a building order can set the price
  const isStaff = user?.role !== "user";
  const isMyBuildingOrder = isStaff && selectedOrder?.status === "building" && (selectedOrder as ExtendedOrder)?.developer_id === user?.id;

  // Same-account scenario: current user is BOTH the order's client AND the counselor/developer.
  // In that case we use sender_role to determine message side instead of sender_id.
  const isClientOnOrder = selectedOrder?.user_id === user?.id;
  const isStaffOnOrder = isStaff && user?.id && (
    selectedOrder?.counselor_id === user.id ||
    (selectedOrder as ExtendedOrder)?.developer_id === user?.id
  );
  const isSameAccountScenario = !!(isClientOnOrder && isStaffOnOrder);

  const getIsMe = (msg: Message): boolean => {
    if (msg.sender_id !== user?.id) return false;
    if (isSameAccountScenario) {
      // Staff-role messages appear on the right (staff side); "user"-role on left (client side)
      return msg.sender_role !== "user";
    }
    return true;
  };

  // Set up real-time subscription
  useEffect(() => {
    if (!selectedOrderId) return;

    const channel = supabase
      .channel(`room:${selectedOrderId}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'order_messages',
        filter: `order_id=eq.${selectedOrderId}`
      }, () => {
        refetch();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedOrderId, refetch]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Close price panel when order changes
  useEffect(() => {
    setShowPricePanel(false);
  }, [selectedOrderId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !selectedOrderId) return;

    try {
      const msgText = content;
      setContent("");
      await sendMessageMutation.mutateAsync({
        orderId: selectedOrderId,
        content: msgText,
        type: "text",
      });
      refetch();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] bg-background border rounded-2xl overflow-hidden shadow-sm">
      {/* Sidebar - Room List */}
      <div className={`${selectedOrderId ? 'hidden md:flex' : 'flex'} w-full md:w-80 flex-col border-r bg-card/50`}>
        <div className="p-4 border-b">
          <h2 className="font-bold text-lg">상담 메시지</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isOrdersLoading ? (
            Array(5).fill(0).map((_, i) => (
              <div key={i} className="p-4 border-b flex gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))
          ) : extOrders && extOrders.length > 0 ? (
            extOrders.map(order => (
              <div 
                key={order.id} 
                onClick={() => setLocation(`/chat/${order.id}`)}
                className={`p-4 border-b cursor-pointer transition-colors flex gap-3 hover:bg-secondary/50 ${selectedOrderId === order.id ? 'bg-secondary border-l-4 border-l-primary' : ''}`}
              >
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <span className="font-bold">{order.server_name.charAt(0)}</span>
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="font-semibold truncate">{order.server_name}</h3>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <OrderStatusBadge status={order.status} />
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
              <Info className="h-8 w-8 mb-2 opacity-50" />
              <p>진행 중인 주문이 없습니다.</p>
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      {selectedOrderId ? (
        <div className="flex-1 flex flex-col bg-background relative">
          {/* Header */}
          <div className="h-16 border-b flex items-center justify-between px-6 bg-card/50 backdrop-blur-md sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="md:hidden -ml-2" onClick={() => setLocation('/chat')}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </Button>
              {selectedOrder && (
                <>
                  <div>
                    <h2 className="font-bold">{selectedOrder.server_name}</h2>
                    <p className="text-xs text-muted-foreground">
                      {selectedOrder.status === "building" ? "서버 제작 중" : "상담원 대기 중"}
                    </p>
                  </div>
                  <OrderStatusBadge status={selectedOrder.status} />
                </>
              )}
            </div>
            {/* Developer price button in header */}
            {isMyBuildingOrder && !showPricePanel && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-amber-400 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                onClick={() => setShowPricePanel(true)}
              >
                <DollarSign className="h-3.5 w-3.5" />
                가격 확정
              </Button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#F8F9FB] dark:bg-[#2B2D31]/30">
            {isMessagesLoading ? (
              <div className="flex flex-col gap-4">
                <Skeleton className="h-16 w-3/4 self-start rounded-2xl" />
                <Skeleton className="h-16 w-1/2 self-end rounded-2xl" />
                <Skeleton className="h-24 w-2/3 self-start rounded-2xl" />
              </div>
            ) : messages && messages.length > 0 ? (
              messages.map(msg => (
                <ChatMessage key={msg.id} message={msg} isMe={getIsMe(msg)} />
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                <div className="h-16 w-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4">
                  <MessageCircle className="h-8 w-8" />
                </div>
                <p>상담이 시작되었습니다. 원하시는 내용을 남겨주세요!</p>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Developer Price Panel */}
          {isMyBuildingOrder && showPricePanel && selectedOrder && (
            <DevPricePanel
              order={selectedOrder}
              onClose={() => setShowPricePanel(false)}
            />
          )}

          {/* Input Area */}
          <div className="p-4 bg-card border-t">
            <form onSubmit={handleSend} className="flex gap-2 items-end">
              <div className="flex gap-1 mb-1">
                <Button type="button" variant="ghost" size="icon" className="text-muted-foreground rounded-full h-10 w-10">
                  <ImageIcon className="h-5 w-5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="text-muted-foreground rounded-full h-10 w-10">
                  <Paperclip className="h-5 w-5" />
                </Button>
              </div>
              <Input 
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="메시지를 입력하세요..." 
                className="flex-1 h-12 bg-background border-none shadow-sm focus-visible:ring-1"
                disabled={sendMessageMutation.isPending}
              />
              <Button 
                type="submit" 
                size="icon" 
                className="h-12 w-12 rounded-xl shrink-0"
                disabled={!content.trim() || sendMessageMutation.isPending}
              >
                {sendMessageMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </Button>
            </form>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 flex-col items-center justify-center text-muted-foreground bg-[#F8F9FB] dark:bg-[#1E1F22]">
          <MessageCircle className="h-16 w-16 mb-4 opacity-20" />
          <p>왼쪽에서 대화방을 선택해주세요.</p>
        </div>
      )}
    </div>
  );
}
