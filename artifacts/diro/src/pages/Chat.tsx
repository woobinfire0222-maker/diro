import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { Send, Image as ImageIcon, Paperclip, Loader2, Info, MessageCircle } from "lucide-react";
import { useGetOrders, useListMessages, useSendMessage, useGetMe, Message, Order } from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderStatusBadge } from "@/components/shared/OrderStatusBadge";
import { supabase } from "@/lib/supabase";

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

export default function ChatPage() {
  const [, params] = useRoute("/chat/:orderId");
  const [, setLocation] = useLocation();
  const selectedOrderId = params?.orderId;
  const [content, setContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: user } = useGetMe();
  const { data: orders, isLoading: isOrdersLoading } = useGetOrders();
  const { data: messages, isLoading: isMessagesLoading, refetch } = useListMessages(selectedOrderId!, {
    query: { enabled: !!selectedOrderId }
  });
  
  const sendMessageMutation = useSendMessage();

  const selectedOrder = orders?.find(o => o.id === selectedOrderId);

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
      }, (payload) => {
        // Optimistically we just refetch, in a real app we'd append to cache
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

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !selectedOrderId) return;

    try {
      const msgText = content;
      setContent("");
      await sendMessageMutation.mutateAsync({
        orderId: selectedOrderId,
        data: {
          content: msgText,
          type: "text",
        }
      });
      refetch();
    } catch (err) {
      console.error(err);
      // fallback if error
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
          ) : orders && orders.length > 0 ? (
            orders.map(order => (
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
                    <p className="text-xs text-muted-foreground">상담원 대기 중</p>
                  </div>
                  <OrderStatusBadge status={selectedOrder.status} />
                </>
              )}
            </div>
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
                <ChatMessage key={msg.id} message={msg} isMe={msg.sender_id === user?.id} />
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
