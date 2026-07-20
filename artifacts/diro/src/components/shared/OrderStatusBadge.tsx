import { Badge } from "@/components/ui/badge";

export function OrderStatusBadge({ status }: { status: string }) {
  const statusMap: Record<string, { label: string, variant: 'default' | 'secondary' | 'destructive' | 'outline', colorClass?: string }> = {
    pending: { label: '대기 중', variant: 'secondary' },
    consulting: { label: '상담 중', variant: 'default', colorClass: 'bg-primary text-primary-foreground' },
    transferred: { label: '개발 대기', variant: 'default', colorClass: 'bg-orange-500 text-white' },
    building: { label: '제작 중', variant: 'default', colorClass: 'bg-accent text-accent-foreground' },
    payment_pending: { label: '결제 대기', variant: 'outline', colorClass: 'border-yellow-500 text-yellow-600 dark:text-yellow-400' },
    completed: { label: '제작 완료', variant: 'default', colorClass: 'bg-success text-success-foreground hover:bg-success/90' },
    cancelled: { label: '취소됨', variant: 'destructive' },
  };

  const config = statusMap[status] || { label: status, variant: 'secondary' };

  return (
    <Badge variant={config.variant} className={config.colorClass}>
      {config.label}
    </Badge>
  );
}
