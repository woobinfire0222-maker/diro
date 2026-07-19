import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TermsPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Button variant="ghost" size="sm" className="mb-6 gap-2" onClick={() => setLocation("/")}>
          <ArrowLeft className="h-4 w-4" /> 돌아가기
        </Button>

        <div className="prose prose-slate dark:prose-invert max-w-none space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">DIRO 이용약관</h1>
            <p className="text-sm text-muted-foreground mt-1">최종 업데이트: 2026년 7월 19일</p>
          </div>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">제1조 (목적)</h2>
            <p className="text-muted-foreground leading-relaxed">
              본 약관은 DIRO(이하 "서비스")가 제공하는 Discord 서버 제작 및 관련 서비스의 이용 조건,
              이용자와 운영자의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">제2조 (서비스 내용)</h2>
            <p className="text-muted-foreground">DIRO는 다음과 같은 서비스를 제공합니다.</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
              <li>Discord 서버 제작 신청</li>
              <li>상담사와의 실시간 채팅 상담</li>
              <li>Discord 서버 설계 및 제작</li>
              <li>Discord 서버 설정 적용</li>
              <li>결제 요청 및 주문 관리</li>
              <li>기타 운영자가 제공하는 부가 서비스</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">제3조 (회원가입)</h2>
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground ml-2">
              <li>이용자는 서비스가 제공하는 회원가입 절차를 통해 계정을 생성할 수 있습니다.</li>
              <li>회원은 정확한 정보를 제공하여야 하며, 허위 정보를 입력함으로써 발생하는 문제에 대한 책임은 회원에게 있습니다.</li>
              <li>회원은 자신의 계정 정보를 안전하게 관리하여야 합니다.</li>
            </ol>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">제4조 (회원의 의무)</h2>
            <p className="text-muted-foreground">회원은 다음 각 호의 행위를 하여서는 안 됩니다.</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
              <li>타인의 계정 도용</li>
              <li>허위 주문 또는 악의적인 주문</li>
              <li>불법 목적의 서버 제작 요청</li>
              <li>욕설, 협박, 사기, 명예훼손 등 타인에게 피해를 주는 행위</li>
              <li>서비스 운영을 방해하는 행위</li>
              <li>관련 법령 및 Discord 이용 정책을 위반하는 요청</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">제5조 (주문 및 제작)</h2>
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground ml-2">
              <li>서버 제작은 이용자가 제출한 신청서를 바탕으로 진행됩니다.</li>
              <li>제작 과정에서 상담을 통해 요청 사항이 변경될 수 있습니다.</li>
              <li>제작 완료 후 결과물을 확인한 뒤 수정 요청이 가능합니다.</li>
            </ol>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">제6조 (결제)</h2>
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground ml-2">
              <li>제작 비용은 상담 과정에서 안내됩니다.</li>
              <li>결제 요청은 서비스 내에서 전달됩니다.</li>
              <li>결제가 완료된 후 제작이 진행되거나 최종 결과물이 제공될 수 있습니다.</li>
            </ol>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">제7조 (환불)</h2>
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground ml-2">
              <li>제작이 시작되기 전에는 환불을 요청할 수 있습니다.</li>
              <li>제작이 시작된 이후에는 서비스의 특성상 환불이 제한될 수 있습니다.</li>
              <li>운영자의 귀책사유가 있는 경우 협의를 통해 환불 또는 재제작을 진행합니다.</li>
            </ol>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">제8조 (서비스 이용 제한)</h2>
            <p className="text-muted-foreground">운영자는 다음 각 호의 경우 회원의 서비스 이용을 제한하거나 계정을 정지할 수 있습니다.</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
              <li>약관 위반</li>
              <li>불법 행위</li>
              <li>서비스 운영 방해</li>
              <li>허위 정보 제공</li>
              <li>반복적인 악성 행위</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">제9조 (면책사항)</h2>
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground ml-2">
              <li>Discord의 정책 변경, API 제한, 장애 등 외부 서비스 문제로 발생하는 사항에 대해서는 책임을 지지 않습니다.</li>
              <li>이용자의 부주의로 발생한 손해에 대해서는 책임을 지지 않습니다.</li>
              <li>천재지변 등 불가항력으로 인한 서비스 장애에 대해서는 책임을 지지 않습니다.</li>
            </ol>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">제10조 (약관 변경)</h2>
            <p className="text-muted-foreground leading-relaxed">
              운영자는 필요한 경우 본 약관을 변경할 수 있으며, 변경 시 서비스 내 공지사항을 통해 안내합니다.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">제11조 (문의)</h2>
            <p className="text-muted-foreground leading-relaxed">
              서비스 이용 중 문의 사항은 고객센터 또는 운영자가 지정한 문의 채널을 통해 접수할 수 있습니다.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
