import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useGetMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { SiDiscord } from "react-icons/si";

export default function LoginPage() {
  const { session, signInWithDiscord } = useAuth();
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (session) {
      setLocation("/home");
    }
  }, [session, setLocation]);

  const handleLogin = async () => {
    try {
      setIsLoading(true);
      await signInWithDiscord();
    } catch (error) {
      console.error(error);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#F8F9FB] dark:bg-[#1E1F22] p-4 relative overflow-hidden">
      {/* Abstract background shapes */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[30%] h-[30%] bg-accent/10 rounded-full blur-[80px]" />
      </div>

      <div className="w-full max-w-md bg-white dark:bg-[#2B2D31] rounded-2xl shadow-2xl overflow-hidden border border-white/20 dark:border-white/5 relative z-10">
        <div className="px-8 pt-12 pb-8 flex flex-col items-center text-center">
          <div className="h-16 w-16 bg-primary rounded-2xl flex items-center justify-center text-white text-3xl font-black mb-6 shadow-lg shadow-primary/30">
            D
          </div>
          
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-3">
            DIRO
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mb-10 text-lg">
            최고의 프리미엄 디스코드 서버를<br />
            가장 쉽고 빠르게 제작하세요.
          </p>

          <Button 
            className="w-full h-14 text-base font-semibold bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-xl shadow-md transition-all active:scale-[0.98]"
            onClick={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>연결 중...</span>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <SiDiscord className="h-6 w-6" />
                <span>Discord로 로그인</span>
              </div>
            )}
          </Button>
        </div>
        
        <div className="bg-slate-50 dark:bg-black/20 p-6 text-center border-t border-slate-100 dark:border-white/5">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            로그인 시 DIRO의 <a href="#" className="underline hover:text-primary">이용약관</a> 및 <a href="#" className="underline hover:text-primary">개인정보처리방침</a>에 동의하게 됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
