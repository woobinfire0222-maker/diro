import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PrivacyPolicyPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Button variant="ghost" size="sm" className="mb-6 gap-2" onClick={() => setLocation("/")}>
          <ArrowLeft className="h-4 w-4" /> 돌아가기
        </Button>

        <div className="prose prose-slate dark:prose-invert max-w-none space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">DIRO 개인정보처리방침</h1>
            <p className="text-sm text-muted-foreground mt-1">최종 업데이트: 2026년 7월 19일</p>
          </div>

          <p className="text-muted-foreground leading-relaxed">
            DIRO는 이용자의 개인정보를 소중하게 생각하며, 관련 법령을 준수하기 위해 노력합니다.
          </p>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">1. 수집하는 개인정보</h2>
            <p className="text-muted-foreground">회원가입 및 서비스 이용 과정에서 다음 정보를 수집할 수 있습니다.</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
              <li>아이디</li>
              <li>닉네임</li>
              <li>이메일</li>
              <li>프로필 이미지 (선택)</li>
              <li>주문 정보</li>
              <li>상담 및 채팅 기록</li>
              <li>접속 로그</li>
              <li>서비스 이용 기록</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">2. 개인정보의 이용 목적</h2>
            <p className="text-muted-foreground">수집한 개인정보는 다음 목적으로 이용됩니다.</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
              <li>회원 식별 및 로그인</li>
              <li>주문 관리</li>
              <li>상담 진행</li>
              <li>Discord 서버 제작</li>
              <li>고객 문의 처리</li>
              <li>서비스 운영 및 개선</li>
              <li>부정 이용 방지</li>
              <li>보안 관리</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">3. 상담 및 채팅 기록</h2>
            <p className="text-muted-foreground leading-relaxed">
              상담 품질 향상, 주문 관리 및 분쟁 해결을 위해 상담 내용과 채팅 기록을 저장할 수 있습니다.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">4. 개인정보 보관 기간</h2>
            <p className="text-muted-foreground leading-relaxed">
              회원 탈퇴 시 원칙적으로 개인정보를 삭제합니다.
              다만, 관계 법령에 따라 일정 기간 보관이 필요한 정보는 해당 기간 동안 보관합니다.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">5. 개인정보의 제3자 제공</h2>
            <p className="text-muted-foreground leading-relaxed">
              DIRO는 법령에 따른 경우를 제외하고 이용자의 개인정보를 제3자에게 판매하거나 제공하지 않습니다.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">6. 개인정보 보호</h2>
            <p className="text-muted-foreground leading-relaxed">
              DIRO는 개인정보 보호를 위해 접근 권한 관리, 암호화 및 기타 보안 조치를 적용합니다.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">7. 쿠키 및 서비스 이용 기록</h2>
            <p className="text-muted-foreground leading-relaxed">
              서비스는 로그인 유지, 서비스 개선 및 보안 강화를 위해 쿠키 또는 유사한 기술을 사용할 수 있습니다.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">8. 이용자의 권리</h2>
            <p className="text-muted-foreground leading-relaxed">
              이용자는 언제든지 자신의 개인정보에 대해 열람, 수정 및 삭제를 요청할 수 있습니다.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">9. 문의</h2>
            <p className="text-muted-foreground leading-relaxed">
              개인정보와 관련된 문의는 서비스 내 고객센터 또는 운영자가 안내하는 문의 채널을 통해 접수할 수 있습니다.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
