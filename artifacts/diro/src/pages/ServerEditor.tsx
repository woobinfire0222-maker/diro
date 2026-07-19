import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import {
  Hash, Volume2, Plus, Settings as SettingsIcon, ChevronDown, ChevronRight,
  ArrowLeft, Save, Shield, Video, Megaphone, Mic2, LayoutGrid,
  Image as ImageIcon, Trash2, CheckCircle2, Loader2, Menu, X,
  Server, Zap, AlertTriangle, ExternalLink,
} from "lucide-react";
import { useGetServerProject, useUpdateServerProject, useGetOrder, useSendPreview, useApplyDiscord, useVerifyBot } from "@/lib/db";
import { useUpdateOrder } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useGetMe } from "@/lib/db";
import { cn } from "@/lib/utils";

// ─── 타입 정의 ────────────────────────────────────────────────

type ChannelType = "text" | "voice" | "announcement" | "stage" | "forum" | "media";

interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  topic?: string;
  nsfw?: boolean;
  slowmode?: number;
  bitrate?: number;
  userLimit?: number;
}

interface Category {
  id: string;
  name: string;
  channels: Channel[];
}

interface Role {
  id: string;
  name: string;
  color: string;
  hoist: boolean;
  mentionable: boolean;
  permissions: string[];
}

interface AutoMod {
  filterExplicit: boolean;
  filterSpam: boolean;
  filterMentionSpam: boolean;
  blockLinks: boolean;
  keywords: string;
}

interface ServerConfig {
  serverName: string;
  serverDescription: string;
  verificationLevel: "none" | "low" | "medium" | "high" | "very_high";
  explicitContentFilter: "disabled" | "members_without_roles" | "all_members";
  defaultNotifications: "all_messages" | "only_mentions";
  mfaLevel: "none" | "elevated";
  afkTimeout: number;
  community: boolean;
  categories: Category[];
  roles: Role[];
  welcomeScreen: { enabled: boolean; description: string };
  autoMod: AutoMod;
}

// ─── 권한 목록 ────────────────────────────────────────────────

const PERMISSION_GROUPS = [
  {
    label: "서버 관리",
    perms: [
      { key: "ADMINISTRATOR",       label: "관리자 (모든 권한)" },
      { key: "MANAGE_GUILD",        label: "서버 관리" },
      { key: "MANAGE_CHANNELS",     label: "채널 관리" },
      { key: "MANAGE_ROLES",        label: "역할 관리" },
      { key: "MANAGE_EXPRESSIONS",  label: "이모지/스티커 관리" },
      { key: "VIEW_AUDIT_LOG",      label: "감사 로그 보기" },
      { key: "MANAGE_WEBHOOKS",     label: "웹훅 관리" },
      { key: "MANAGE_EVENTS",       label: "이벤트 관리" },
      { key: "VIEW_GUILD_INSIGHTS", label: "서버 인사이트 보기" },
    ],
  },
  {
    label: "멤버 관리",
    perms: [
      { key: "CREATE_INSTANT_INVITE", label: "초대 링크 생성" },
      { key: "KICK_MEMBERS",          label: "멤버 킥" },
      { key: "BAN_MEMBERS",           label: "멤버 차단" },
      { key: "MODERATE_MEMBERS",      label: "멤버 타임아웃" },
      { key: "CHANGE_NICKNAME",       label: "닉네임 변경" },
      { key: "MANAGE_NICKNAMES",      label: "닉네임 관리" },
      { key: "MENTION_EVERYONE",      label: "@everyone/@here 멘션" },
    ],
  },
  {
    label: "텍스트 권한",
    perms: [
      { key: "VIEW_CHANNEL",                label: "채널 보기" },
      { key: "SEND_MESSAGES",               label: "메시지 보내기" },
      { key: "SEND_MESSAGES_IN_THREADS",    label: "스레드에서 메시지 보내기" },
      { key: "CREATE_PUBLIC_THREADS",       label: "공개 스레드 생성" },
      { key: "CREATE_PRIVATE_THREADS",      label: "비공개 스레드 생성" },
      { key: "MANAGE_THREADS",              label: "스레드 관리" },
      { key: "EMBED_LINKS",                 label: "링크 미리보기" },
      { key: "ATTACH_FILES",                label: "파일 첨부" },
      { key: "ADD_REACTIONS",               label: "반응 추가" },
      { key: "USE_EXTERNAL_EMOJIS",         label: "외부 이모지 사용" },
      { key: "USE_EXTERNAL_STICKERS",       label: "외부 스티커 사용" },
      { key: "USE_APPLICATION_COMMANDS",    label: "슬래시 명령어 사용" },
      { key: "SEND_TTS_MESSAGES",           label: "TTS 메시지 전송" },
      { key: "READ_MESSAGE_HISTORY",        label: "메시지 기록 읽기" },
      { key: "MANAGE_MESSAGES",             label: "메시지 관리 (고정/삭제)" },
      { key: "CREATE_POLLS",                label: "투표 만들기" },
    ],
  },
  {
    label: "음성 권한",
    perms: [
      { key: "CONNECT",                   label: "연결" },
      { key: "SPEAK",                     label: "말하기" },
      { key: "VIDEO",                     label: "비디오" },
      { key: "USE_VAD",                   label: "음성 감지 (VAD)" },
      { key: "PRIORITY_SPEAKER",          label: "우선 발언권" },
      { key: "STREAM",                    label: "화면 공유/방송" },
      { key: "MUTE_MEMBERS",             label: "멤버 음소거" },
      { key: "DEAFEN_MEMBERS",           label: "멤버 귀막기" },
      { key: "MOVE_MEMBERS",             label: "멤버 이동" },
      { key: "REQUEST_TO_SPEAK",         label: "발언 요청 (스테이지)" },
      { key: "SET_VOICE_CHANNEL_STATUS", label: "음성 채널 상태 설정" },
      { key: "USE_SOUNDBOARD",           label: "사운드보드 사용" },
      { key: "USE_EXTERNAL_SOUNDS",      label: "외부 사운드 사용" },
    ],
  },
];

const SLOWMODE_OPTIONS = [
  { value: 0,     label: "없음" },
  { value: 5,     label: "5초" },
  { value: 10,    label: "10초" },
  { value: 15,    label: "15초" },
  { value: 30,    label: "30초" },
  { value: 60,    label: "1분" },
  { value: 120,   label: "2분" },
  { value: 300,   label: "5분" },
  { value: 600,   label: "10분" },
  { value: 900,   label: "15분" },
  { value: 1800,  label: "30분" },
  { value: 3600,  label: "1시간" },
  { value: 21600, label: "6시간" },
];

const AFK_OPTIONS = [
  { value: 60,   label: "1분" },
  { value: 300,  label: "5분" },
  { value: 900,  label: "15분" },
  { value: 1800, label: "30분" },
  { value: 3600, label: "1시간" },
];

const CHANNEL_TYPE_LABELS: Record<ChannelType, string> = {
  text: "텍스트", voice: "음성", announcement: "공지",
  stage: "스테이지", forum: "포럼", media: "미디어",
};

const defaultConfig: ServerConfig = {
  serverName: "새 서버",
  serverDescription: "",
  verificationLevel: "low",
  explicitContentFilter: "members_without_roles",
  defaultNotifications: "only_mentions",
  mfaLevel: "none",
  afkTimeout: 300,
  community: false,
  categories: [
    {
      id: "cat-1", name: "정보",
      channels: [
        { id: "ch-1", name: "공지사항", type: "announcement" },
        { id: "ch-2", name: "환영합니다", type: "text", topic: "서버에 오신 것을 환영합니다!" },
      ],
    },
    {
      id: "cat-2", name: "일반",
      channels: [
        { id: "ch-3", name: "잡담", type: "text" },
        { id: "ch-4", name: "일반 음성", type: "voice", bitrate: 64, userLimit: 0 },
      ],
    },
  ],
  roles: [
    { id: "role-1", name: "관리자", color: "#ED4245", hoist: true,  mentionable: false, permissions: ["ADMINISTRATOR"] },
    { id: "role-2", name: "멤버",   color: "#5865F2", hoist: false, mentionable: false, permissions: ["VIEW_CHANNEL", "SEND_MESSAGES", "READ_MESSAGE_HISTORY", "CONNECT", "SPEAK"] },
  ],
  welcomeScreen: { enabled: false, description: "" },
  autoMod: { filterExplicit: false, filterSpam: false, filterMentionSpam: false, blockLinks: false, keywords: "" },
};

// ─── 채널 아이콘 ──────────────────────────────────────────────

function ChannelIcon({ type, className = "h-4 w-4 text-[#949BA4]" }: { type: ChannelType; className?: string }) {
  switch (type) {
    case "voice":        return <Volume2 className={className} />;
    case "announcement": return <Megaphone className={className} />;
    case "stage":        return <Mic2 className={className} />;
    case "forum":        return <LayoutGrid className={className} />;
    case "media":        return <ImageIcon className={className} />;
    default:             return <Hash className={className} />;
  }
}

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const inputCls = "bg-[#1E1F22] border-[#1E1F22] text-[#DBDEE1] focus-visible:ring-[#5865F2] placeholder:text-[#4F5660]";

// ─── 서브 컴포넌트 ────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#2B2D31] rounded-lg border border-[#1E1F22] overflow-hidden">
      <div className="px-5 py-3 border-b border-[#1E1F22]">
        <p className="text-xs font-bold uppercase tracking-wider text-[#949BA4]">{title}</p>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, desc, children, className }: { label: string; desc?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-[#B5BAC1] font-semibold text-xs uppercase tracking-wide">{label}</Label>
      {desc && <p className="text-xs text-[#949BA4]">{desc}</p>}
      {children}
    </div>
  );
}

function Toggle({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div>
        <p className="text-sm font-medium text-[#DBDEE1]">{label}</p>
        {desc && <p className="text-xs text-[#949BA4] mt-0.5">{desc}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} className="data-[state=checked]:bg-[#5865F2]" />
    </div>
  );
}

// ─── Apply Dialog ─────────────────────────────────────────────

interface ApplyDialogProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  onSaveFirst: () => Promise<void>;
}

function ApplyDialog({ open, onClose, orderId, onSaveFirst }: ApplyDialogProps) {
  const { toast } = useToast();
  const verifyBot = useVerifyBot();
  const applyDiscord = useApplyDiscord();
  const [serverId, setServerId] = useState("");
  const [verifyResult, setVerifyResult] = useState<{ inServer: boolean; serverName: string | null } | null>(null);
  const [applyResult, setApplyResult] = useState<{ success: boolean; appliedItems: string[]; error: string | null } | null>(null);
  const [step, setStep] = useState<"input" | "verified" | "done">("input");

  const reset = () => {
    setServerId("");
    setVerifyResult(null);
    setApplyResult(null);
    setStep("input");
    onClose();
  };

  const handleVerify = async () => {
    if (!serverId.trim()) return;
    try {
      const res = await verifyBot.mutateAsync(serverId.trim());
      setVerifyResult(res);
      if (res.in_server) setStep("verified");
      else toast({ variant: "destructive", title: "봇이 해당 서버에 없습니다", description: "DIRO Bot을 먼저 서버에 초대해주세요." });
    } catch {
      toast({ variant: "destructive", title: "서버 확인 실패" });
    }
  };

  const handleApply = async () => {
    try {
      await onSaveFirst();
      const res = await applyDiscord.mutateAsync({ orderId, serverId: serverId.trim() });
      setApplyResult(res);
      setStep("done");
      if (res.success) toast({ title: "✅ Discord 서버에 적용 완료!" });
      else toast({ variant: "destructive", title: "일부 항목 적용 실패", description: res.error ?? undefined });
    } catch {
      toast({ variant: "destructive", title: "적용 실패" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) reset(); }}>
      <DialogContent className="bg-[#2B2D31] border-[#1E1F22] text-[#DBDEE1] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Zap className="h-5 w-5 text-[#5865F2]" /> Discord 서버에 적용
          </DialogTitle>
          <DialogDescription className="text-[#949BA4]">
            DIRO Bot이 서버에 초대되어 있어야 합니다. 채널·역할·설정이 실제 Discord 서버에 생성됩니다.
          </DialogDescription>
        </DialogHeader>

        {step === "input" && (
          <div className="space-y-4">
            <Field label="Discord 서버 ID" desc="Discord 앱 → 서버 우클릭 → 서버 ID 복사 (개발자 모드 필요)">
              <div className="flex gap-2">
                <Input
                  value={serverId}
                  onChange={e => setServerId(e.target.value)}
                  placeholder="1234567890123456789"
                  className={inputCls}
                  onKeyDown={e => e.key === "Enter" && handleVerify()}
                />
                <Button
                  onClick={handleVerify}
                  disabled={!serverId.trim() || verifyBot.isPending}
                  className="bg-[#5865F2] hover:bg-[#4752C4] text-white shrink-0"
                >
                  {verifyBot.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "확인"}
                </Button>
              </div>
            </Field>
            {verifyResult && !verifyResult.in_server && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">봇이 서버에 없습니다</p>
                  <a href="https://discord.com/oauth2/authorize?scope=bot&permissions=8" target="_blank" rel="noreferrer" className="flex items-center gap-1 mt-1 underline text-xs">
                    DIRO Bot 초대하기 <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {step === "verified" && verifyResult && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 text-green-400">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium text-sm">{verifyResult.serverName}</p>
                <p className="text-xs opacity-80">봇이 서버에 있습니다</p>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-yellow-500/10 text-yellow-400 text-xs space-y-1">
              <p className="font-bold flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> 주의사항</p>
              <ul className="space-y-0.5 text-yellow-400/80 list-disc list-inside">
                <li>기존 채널·역할이 있어도 새로 추가됩니다 (덮어쓰지 않음)</li>
                <li>서버 이름과 설명은 업데이트됩니다</li>
                <li>되돌리려면 Discord에서 직접 삭제해야 합니다</li>
              </ul>
            </div>
          </div>
        )}

        {step === "done" && applyResult && (
          <div className="space-y-3">
            <div className={cn("flex items-center gap-2 p-3 rounded-lg text-sm font-medium",
              applyResult.success ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400")}>
              {applyResult.success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
              {applyResult.success ? "성공적으로 적용되었습니다!" : `오류: ${applyResult.error}`}
            </div>
            {applyResult.appliedItems.length > 0 && (
              <ScrollArea className="h-36 rounded-md bg-[#1E1F22] p-3">
                <p className="text-xs text-[#949BA4] mb-2 font-bold uppercase tracking-wide">적용된 항목</p>
                {applyResult.appliedItems.map((item, i) => (
                  <p key={i} className="text-xs text-[#DBDEE1] py-0.5">✓ {item}</p>
                ))}
              </ScrollArea>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={reset} className="text-[#949BA4] hover:text-[#DBDEE1] hover:bg-[#3F4147]">
            {step === "done" ? "닫기" : "취소"}
          </Button>
          {step === "verified" && (
            <Button
              onClick={handleApply}
              disabled={applyDiscord.isPending}
              className="bg-[#5865F2] hover:bg-[#4752C4] text-white"
            >
              {applyDiscord.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />적용 중…</> : "Discord에 적용"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────

export default function ServerEditorPage() {
  const [, params] = useRoute("/counselor/editor/:orderId");
  const [, setLocation] = useLocation();
  const orderId = params?.orderId;
  const { toast } = useToast();

  const { data: me } = useGetMe();
  const { data: order, isLoading: isOrderLoading } = useGetOrder(orderId!, { query: { enabled: !!orderId } });
  const { data: project, isLoading: isProjectLoading, refetch } = useGetServerProject(orderId!, { query: { enabled: !!orderId } });
  const updateProjectMutation = useUpdateServerProject();
  const updateOrderMutation = useUpdateOrder();
  const sendPreviewMutation = useSendPreview();

  const [config, setConfig] = useState<ServerConfig>(defaultConfig);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);

  type Selection =
    | { type: "server" }
    | { type: "category"; id: string }
    | { type: "channel"; id: string; categoryId: string }
    | { type: "role"; id: string };

  const [sel, setSel] = useState<Selection>({ type: "server" });

  useEffect(() => {
    if (project?.config_json) {
      try { setConfig({ ...defaultConfig, ...JSON.parse(project.config_json) }); } catch {}
    } else if (order) {
      setConfig(prev => ({ ...prev, serverName: order.server_name, serverDescription: order.server_description || "" }));
    }
  }, [project, order]);

  const isDev   = me?.role === "developer";
  const isAdmin = me?.role === "admin" || me?.username === "bini2222";

  if (me && !isDev && !isAdmin) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#1E1F22] text-red-400">
        개발자 또는 관리자만 접근할 수 있습니다.
      </div>
    );
  }

  if (isProjectLoading || isOrderLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#1E1F22]">
        <Loader2 className="animate-spin h-8 w-8 text-[#5865F2]" />
      </div>
    );
  }

  // ── 설정 헬퍼 ──────────────────────────────────────────────

  const set = (patch: Partial<ServerConfig>) => setConfig(prev => ({ ...prev, ...patch }));

  const updateCategory = (catId: string, patch: Partial<Category>) =>
    set({ categories: config.categories.map(c => c.id === catId ? { ...c, ...patch } : c) });

  const updateChannel = (catId: string, chId: string, patch: Partial<Channel>) =>
    set({
      categories: config.categories.map(c =>
        c.id === catId ? { ...c, channels: c.channels.map(ch => ch.id === chId ? { ...ch, ...patch } : ch) } : c
      ),
    });

  const updateRole = (roleId: string, patch: Partial<Role>) =>
    set({ roles: config.roles.map(r => r.id === roleId ? { ...r, ...patch } : r) });

  const togglePerm = (roleId: string, perm: string) => {
    const role = config.roles.find(r => r.id === roleId)!;
    const has = role.permissions.includes(perm);
    updateRole(roleId, { permissions: has ? role.permissions.filter(p => p !== perm) : [...role.permissions, perm] });
  };

  const addCategory = () => {
    const id = `cat-${uid()}`;
    set({ categories: [...config.categories, { id, name: "새 카테고리", channels: [] }] });
    setSel({ type: "category", id });
    setMobileSidebarOpen(false);
  };

  const deleteCategory = (catId: string) => {
    set({ categories: config.categories.filter(c => c.id !== catId) });
    setSel({ type: "server" });
  };

  const addChannel = (catId: string, type: ChannelType = "text") => {
    const id = `ch-${uid()}`;
    const newCh: Channel = { id, name: "새-채널", type };
    updateCategory(catId, { channels: [...config.categories.find(c => c.id === catId)!.channels, newCh] });
    setSel({ type: "channel", id, categoryId: catId });
    setMobileSidebarOpen(false);
  };

  const deleteChannel = (catId: string, chId: string) => {
    updateCategory(catId, { channels: config.categories.find(c => c.id === catId)!.channels.filter(ch => ch.id !== chId) });
    setSel({ type: "category", id: catId });
  };

  const addRole = () => {
    const id = `role-${uid()}`;
    set({ roles: [...config.roles, { id, name: "새 역할", color: "#99AAB5", hoist: false, mentionable: false, permissions: [] }] });
    setSel({ type: "role", id });
    setMobileSidebarOpen(false);
  };

  const deleteRole = (roleId: string) => {
    set({ roles: config.roles.filter(r => r.id !== roleId) });
    setSel({ type: "server" });
  };

  const handleSave = async () => {
    if (!orderId) return;
    try {
      await updateProjectMutation.mutateAsync({ orderId, data: { config_json: JSON.stringify(config) } });
      toast({ title: "저장 완료" });
      refetch();
    } catch { toast({ variant: "destructive", title: "저장 실패" }); }
  };

  const handleSendPreview = async () => {
    if (!orderId) return;
    try {
      await sendPreviewMutation.mutateAsync({ orderId });
      toast({ title: "미리보기 전송 완료", description: "고객 채팅에 전달되었습니다." });
    } catch { toast({ variant: "destructive", title: "전송 실패" }); }
  };

  const handleMarkComplete = async () => {
    if (!orderId) return;
    try {
      await handleSave();
      await updateOrderMutation.mutateAsync({ id: orderId, data: { status: "completed" } });
      toast({ title: "✅ 서버 제작 완료 처리", description: "고객에게 완료 알림이 전송됩니다." });
      setLocation("/counselor");
    } catch { toast({ variant: "destructive", title: "처리 실패" }); }
  };

  const selCategory = sel.type === "category" ? config.categories.find(c => c.id === sel.id) : null;
  const selChannel  = sel.type === "channel"  ? config.categories.find(c => c.id === sel.categoryId)?.channels.find(ch => ch.id === sel.id) : null;
  const selRole     = sel.type === "role"     ? config.roles.find(r => r.id === sel.id) : null;

  // ── 사이드바 콘텐츠 (재사용) ───────────────────────────────

  const SidebarContent = ({ onSelect }: { onSelect?: () => void }) => (
    <div className="flex flex-col h-full bg-[#2B2D31]">
      {/* 서버 이름 */}
      <div
        className="h-12 border-b border-black/30 flex items-center px-4 font-bold text-white shadow-sm cursor-pointer hover:bg-[#3F4147] transition-colors shrink-0"
        onClick={() => { setSel({ type: "server" }); onSelect?.(); }}
      >
        <span className="truncate flex-1 text-sm">{config.serverName}</span>
        <ChevronDown className="ml-auto h-4 w-4 opacity-60 shrink-0" />
      </div>

      {/* 채널/카테고리 목록 */}
      <div className="flex-1 overflow-y-auto py-2 px-1.5 space-y-1">
        {config.categories.map(cat => (
          <div key={cat.id}>
            <div
              className={cn("flex items-center px-1.5 py-1 rounded cursor-pointer group text-[#949BA4] hover:text-[#DBDEE1]", sel.type === "category" && sel.id === cat.id && "text-white")}
              onClick={() => { setSel({ type: "category", id: cat.id }); onSelect?.(); }}
            >
              <ChevronDown className="h-3 w-3 mr-1 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider truncate flex-1">{cat.name}</span>
              <Plus
                className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 hover:text-white shrink-0"
                onClick={e => { e.stopPropagation(); addChannel(cat.id); }}
              />
            </div>
            {cat.channels.map(ch => (
              <div
                key={ch.id}
                onClick={() => { setSel({ type: "channel", id: ch.id, categoryId: cat.id }); onSelect?.(); }}
                className={cn("flex items-center px-2 py-1.5 mx-0.5 rounded cursor-pointer group text-[#949BA4] hover:bg-[#3F4147] hover:text-[#DBDEE1] transition-colors", sel.type === "channel" && sel.id === ch.id && "bg-[#3F4147] !text-white")}
              >
                <ChannelIcon type={ch.type} className="h-4 w-4 shrink-0" />
                <span className="ml-1.5 truncate flex-1 text-sm">{ch.name}</span>
                {ch.nsfw && <span className="text-[10px] bg-red-500/20 text-red-400 px-1 rounded shrink-0">18+</span>}
              </div>
            ))}
          </div>
        ))}

        <button
          onClick={addCategory}
          className="w-full mt-2 flex items-center gap-1.5 px-2 py-1.5 text-xs text-[#949BA4] hover:text-[#DBDEE1] rounded hover:bg-[#3F4147] transition-colors"
        >
          <Plus className="h-3 w-3" /> 카테고리 추가
        </button>

        {/* 역할 구분선 */}
        <div className="mt-3 mb-1 px-2">
          <div className="flex items-center gap-2 text-[#949BA4]">
            <div className="flex-1 h-px bg-[#3F4147]" />
            <span className="text-[10px] font-bold uppercase tracking-wider">역할</span>
            <div className="flex-1 h-px bg-[#3F4147]" />
          </div>
        </div>

        {config.roles.map(role => (
          <div
            key={role.id}
            onClick={() => { setSel({ type: "role", id: role.id }); onSelect?.(); }}
            className={cn("flex items-center px-2 py-1.5 mx-0.5 rounded cursor-pointer text-[#949BA4] hover:bg-[#3F4147] hover:text-[#DBDEE1] transition-colors", sel.type === "role" && sel.id === role.id && "bg-[#3F4147] !text-white")}
          >
            <div className="w-2.5 h-2.5 rounded-full shrink-0 mr-2" style={{ backgroundColor: role.color }} />
            <span className="text-sm truncate flex-1">{role.name}</span>
            {role.hoist && <span className="text-[10px] text-[#949BA4]">표시</span>}
          </div>
        ))}

        <button
          onClick={addRole}
          className="w-full mt-1 flex items-center gap-1.5 px-2 py-1.5 text-xs text-[#949BA4] hover:text-[#DBDEE1] rounded hover:bg-[#3F4147] transition-colors"
        >
          <Plus className="h-3 w-3" /> 역할 추가
        </button>
      </div>

      {/* 봇 정보 */}
      <div className="bg-[#232428] p-3 flex items-center gap-2 border-t border-black/20 shrink-0">
        <div className="h-8 w-8 bg-[#5865F2] rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0">D</div>
        <div className="text-xs overflow-hidden">
          <div className="font-bold text-white truncate">DIRO Bot</div>
          <div className="text-[#949BA4]">개발자 모드</div>
        </div>
      </div>
    </div>
  );

  // ── 오른쪽 패널 콘텐츠 ─────────────────────────────────────

  const RightPanel = () => (
    <div className="flex flex-col h-full bg-[#313338]">
      {/* 패널 헤더 */}
      <div className="h-12 border-b border-black/20 flex items-center px-5 gap-2 font-semibold text-white shadow-sm shrink-0">
        {sel.type === "server"   && <><Shield className="h-4 w-4 text-[#949BA4]" /> 서버 설정</>}
        {sel.type === "category" && selCategory && <><SettingsIcon className="h-4 w-4 text-[#949BA4]" /> 카테고리: {selCategory.name}</>}
        {sel.type === "channel"  && selChannel  && <><ChannelIcon type={selChannel.type} /> 채널: {selChannel.name}</>}
        {sel.type === "role"     && selRole     && <><div className="w-3 h-3 rounded-full" style={{ backgroundColor: selRole.color }} /> 역할: {selRole.name}</>}
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ═══ 서버 설정 ═══════════════════════════════════ */}
        {sel.type === "server" && (
          <Tabs defaultValue="general" className="h-full flex flex-col">
            <TabsList className="mx-5 mt-4 mb-0 w-fit bg-[#2B2D31] flex-wrap h-auto gap-1">
              <TabsTrigger value="general"    className="data-[state=active]:bg-[#5865F2] data-[state=active]:text-white text-[#949BA4] text-xs">서버 설정</TabsTrigger>
              <TabsTrigger value="moderation" className="data-[state=active]:bg-[#5865F2] data-[state=active]:text-white text-[#949BA4] text-xs">보안/필터</TabsTrigger>
              <TabsTrigger value="automod"    className="data-[state=active]:bg-[#5865F2] data-[state=active]:text-white text-[#949BA4] text-xs">AutoMod</TabsTrigger>
              <TabsTrigger value="welcome"    className="data-[state=active]:bg-[#5865F2] data-[state=active]:text-white text-[#949BA4] text-xs">환영 화면</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="flex-1 p-5 space-y-6 overflow-y-auto">
              <Section title="서버 기본 정보">
                <Field label="서버 이름">
                  <Input value={config.serverName} onChange={e => set({ serverName: e.target.value })} className={inputCls} />
                </Field>
                <Field label="서버 설명">
                  <Textarea value={config.serverDescription} onChange={e => set({ serverDescription: e.target.value })} className={`${inputCls} resize-none`} rows={3} placeholder="서버 소개를 입력하세요" />
                </Field>
              </Section>
              <Section title="기본 알림">
                <Field label="기본 알림 설정">
                  <Select value={config.defaultNotifications} onValueChange={v => set({ defaultNotifications: v as ServerConfig["defaultNotifications"] })}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#2B2D31] border-[#1E1F22] text-[#DBDEE1]">
                      <SelectItem value="all_messages">모든 메시지</SelectItem>
                      <SelectItem value="only_mentions">@멘션만</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="AFK 타임아웃">
                  <Select value={String(config.afkTimeout)} onValueChange={v => set({ afkTimeout: Number(v) })}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#2B2D31] border-[#1E1F22] text-[#DBDEE1]">
                      {AFK_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </Section>
              <Section title="커뮤니티">
                <Toggle label="커뮤니티 기능 활성화" desc="서버 발견, 공지 채널, 서버 인사이트 등 커뮤니티 기능을 사용합니다." checked={config.community} onChange={v => set({ community: v })} />
              </Section>
            </TabsContent>

            <TabsContent value="moderation" className="flex-1 p-5 space-y-6 overflow-y-auto">
              <Section title="인증 레벨">
                <Field label="서버 인증 레벨" desc="새로운 멤버가 메시지를 보내려면 충족해야 하는 조건입니다.">
                  <Select value={config.verificationLevel} onValueChange={v => set({ verificationLevel: v as ServerConfig["verificationLevel"] })}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#2B2D31] border-[#1E1F22] text-[#DBDEE1]">
                      <SelectItem value="none">없음</SelectItem>
                      <SelectItem value="low">낮음 — 이메일 인증 필요</SelectItem>
                      <SelectItem value="medium">중간 — Discord 가입 5분 이상</SelectItem>
                      <SelectItem value="high">높음 — 서버 가입 10분 이상</SelectItem>
                      <SelectItem value="very_high">최고 — 휴대폰 인증 필요</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </Section>
              <Section title="미디어 콘텐츠 필터">
                <Field label="명시적 미디어 콘텐츠 필터" desc="Discord가 메시지의 미디어 콘텐츠를 자동으로 검사합니다.">
                  <Select value={config.explicitContentFilter} onValueChange={v => set({ explicitContentFilter: v as ServerConfig["explicitContentFilter"] })}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#2B2D31] border-[#1E1F22] text-[#DBDEE1]">
                      <SelectItem value="disabled">비활성화</SelectItem>
                      <SelectItem value="members_without_roles">역할 없는 멤버만</SelectItem>
                      <SelectItem value="all_members">모든 멤버</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </Section>
              <Section title="2단계 인증 (2FA)">
                <Toggle label="관리자 2FA 요구" desc="관리자 기능을 사용하려면 2FA가 활성화되어 있어야 합니다." checked={config.mfaLevel === "elevated"} onChange={v => set({ mfaLevel: v ? "elevated" : "none" })} />
              </Section>
            </TabsContent>

            <TabsContent value="automod" className="flex-1 p-5 space-y-6 overflow-y-auto">
              <Section title="자동 필터">
                <Toggle label="명시적 콘텐츠 필터" desc="욕설, 불법 콘텐츠 등을 자동으로 차단합니다." checked={config.autoMod.filterExplicit} onChange={v => set({ autoMod: { ...config.autoMod, filterExplicit: v } })} />
                <Toggle label="스팸 필터" desc="스팸성 반복 메시지를 자동으로 감지합니다." checked={config.autoMod.filterSpam} onChange={v => set({ autoMod: { ...config.autoMod, filterSpam: v } })} />
                <Toggle label="멘션 스팸 차단" desc="과도한 @멘션이 포함된 메시지를 차단합니다." checked={config.autoMod.filterMentionSpam} onChange={v => set({ autoMod: { ...config.autoMod, filterMentionSpam: v } })} />
                <Toggle label="외부 링크 차단" desc="멤버가 외부 링크를 공유하지 못하게 합니다." checked={config.autoMod.blockLinks} onChange={v => set({ autoMod: { ...config.autoMod, blockLinks: v } })} />
              </Section>
              <Section title="금칙어">
                <Field label="금칙어 목록" desc="쉼표(,)로 구분하여 입력하세요.">
                  <Textarea value={config.autoMod.keywords} onChange={e => set({ autoMod: { ...config.autoMod, keywords: e.target.value } })} className={`${inputCls} resize-none`} rows={4} placeholder="욕설, 스팸, ..." />
                </Field>
              </Section>
            </TabsContent>

            <TabsContent value="welcome" className="flex-1 p-5 space-y-6 overflow-y-auto">
              <Section title="환영 화면">
                <Toggle label="환영 화면 활성화" desc="새 멤버가 서버에 참가하면 환영 화면을 보여줍니다." checked={config.welcomeScreen.enabled} onChange={v => set({ welcomeScreen: { ...config.welcomeScreen, enabled: v } })} />
                <Field label="설명 문구">
                  <Textarea value={config.welcomeScreen.description} onChange={e => set({ welcomeScreen: { ...config.welcomeScreen, description: e.target.value } })} className={`${inputCls} resize-none`} rows={3} placeholder="새 멤버들에게 보여줄 서버 소개 문구" />
                </Field>
              </Section>
            </TabsContent>
          </Tabs>
        )}

        {/* ═══ 카테고리 설정 ════════════════════════════════ */}
        {sel.type === "category" && selCategory && (
          <div className="p-5 space-y-6">
            <Section title="카테고리 설정">
              <Field label="카테고리 이름">
                <Input value={selCategory.name} onChange={e => updateCategory(selCategory.id, { name: e.target.value })} className={inputCls} />
              </Field>
            </Section>
            <Section title="채널 추가">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(["text","voice","announcement","stage","forum","media"] as ChannelType[]).map(t => (
                  <button key={t} onClick={() => addChannel(selCategory.id, t)} className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#2B2D31] hover:bg-[#3F4147] text-[#DBDEE1] text-sm transition-colors">
                    <ChannelIcon type={t} /> {CHANNEL_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </Section>
            <Section title="위험">
              <button onClick={() => deleteCategory(selCategory.id)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm transition-colors">
                <Trash2 className="h-4 w-4" /> 카테고리 삭제
              </button>
            </Section>
          </div>
        )}

        {/* ═══ 채널 설정 ════════════════════════════════════ */}
        {sel.type === "channel" && selChannel && (
          <div className="p-5 space-y-6">
            <Section title="채널 기본 설정">
              <Field label="채널 이름">
                <Input value={selChannel.name} onChange={e => updateChannel(sel.categoryId!, selChannel.id, { name: e.target.value.replace(/\s/g, "-") })} className={inputCls} />
              </Field>
              <Field label="채널 종류">
                <Select value={selChannel.type} onValueChange={v => updateChannel(sel.categoryId!, selChannel.id, { type: v as ChannelType })}>
                  <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#2B2D31] border-[#1E1F22] text-[#DBDEE1]">
                    {(["text","voice","announcement","stage","forum","media"] as ChannelType[]).map(t => (
                      <SelectItem key={t} value={t}>{CHANNEL_TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </Section>

            {["text","announcement","forum","media"].includes(selChannel.type) && (
              <Section title="텍스트 채널 설정">
                <Field label="채널 주제 (Topic)">
                  <Textarea value={selChannel.topic || ""} onChange={e => updateChannel(sel.categoryId!, selChannel.id, { topic: e.target.value })} className={`${inputCls} resize-none`} rows={3} placeholder="이 채널에 대한 설명" />
                </Field>
                <Field label="슬로우 모드">
                  <Select value={String(selChannel.slowmode ?? 0)} onValueChange={v => updateChannel(sel.categoryId!, selChannel.id, { slowmode: Number(v) })}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#2B2D31] border-[#1E1F22] text-[#DBDEE1]">
                      {SLOWMODE_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Toggle label="연령 제한 채널 (NSFW)" desc="18세 이상 확인 후 입장 가능합니다." checked={selChannel.nsfw || false} onChange={v => updateChannel(sel.categoryId!, selChannel.id, { nsfw: v })} />
              </Section>
            )}

            {["voice","stage"].includes(selChannel.type) && (
              <Section title="음성 채널 설정">
                <Field label={`비트레이트: ${selChannel.bitrate ?? 64}kbps`}>
                  <Slider min={8} max={384} step={8} value={[selChannel.bitrate ?? 64]} onValueChange={([v]) => updateChannel(sel.categoryId!, selChannel.id, { bitrate: v })} className="mt-2" />
                </Field>
                <Field label={`사용자 제한: ${selChannel.userLimit === 0 || !selChannel.userLimit ? "무제한" : `${selChannel.userLimit}명`}`}>
                  <Slider min={0} max={99} step={1} value={[selChannel.userLimit ?? 0]} onValueChange={([v]) => updateChannel(sel.categoryId!, selChannel.id, { userLimit: v })} className="mt-2" />
                </Field>
              </Section>
            )}

            <Section title="위험">
              <button onClick={() => deleteChannel(sel.categoryId!, selChannel.id)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm transition-colors">
                <Trash2 className="h-4 w-4" /> 채널 삭제
              </button>
            </Section>
          </div>
        )}

        {/* ═══ 역할 설정 ════════════════════════════════════ */}
        {sel.type === "role" && selRole && (
          <div className="p-5 space-y-6">
            <Section title="역할 기본 정보">
              <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
                <Field label="역할 이름" className="flex-1">
                  <Input value={selRole.name} onChange={e => updateRole(selRole.id, { name: e.target.value })} className={inputCls} />
                </Field>
                <Field label="색상">
                  <div className="flex items-center gap-2">
                    <input type="color" value={selRole.color} onChange={e => updateRole(selRole.id, { color: e.target.value })} className="w-10 h-9 rounded cursor-pointer bg-transparent border-0 p-0" />
                    <span className="text-sm text-[#949BA4] font-mono">{selRole.color.toUpperCase()}</span>
                  </div>
                </Field>
              </div>
              <Toggle label="목록에서 분리 표시 (Hoist)" desc="온라인 멤버 목록에서 이 역할을 별도 그룹으로 표시합니다." checked={selRole.hoist} onChange={v => updateRole(selRole.id, { hoist: v })} />
              <Toggle label="@멘션 허용 (Mentionable)" desc="누구든 이 역할을 @멘션으로 호출할 수 있습니다." checked={selRole.mentionable} onChange={v => updateRole(selRole.id, { mentionable: v })} />
            </Section>

            <Section title="역할 권한">
              {PERMISSION_GROUPS.map(group => (
                <div key={group.label} className="mb-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#949BA4] mb-2">{group.label}</p>
                  <div className="space-y-1.5">
                    {group.perms.map(p => (
                      <label key={p.key} className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-[#2B2D31] cursor-pointer group">
                        <Checkbox
                          checked={selRole.permissions.includes(p.key)}
                          onCheckedChange={() => togglePerm(selRole.id, p.key)}
                          className="border-[#4F5660] data-[state=checked]:bg-[#5865F2] data-[state=checked]:border-[#5865F2]"
                        />
                        <span className="text-sm text-[#DBDEE1]">{p.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </Section>

            {selRole.name !== "@everyone" && (
              <Section title="위험">
                <button onClick={() => deleteRole(selRole.id)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm transition-colors">
                  <Trash2 className="h-4 w-4" /> 역할 삭제
                </button>
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen flex-col bg-[#1E1F22] text-[#DBDEE1] font-sans overflow-hidden">

      {/* ── 상단 헤더 ── */}
      <header className="h-12 bg-[#2B2D31] border-b border-black/30 flex items-center justify-between px-3 sm:px-4 shrink-0 shadow z-10 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="sm" className="text-[#DBDEE1] hover:bg-[#3F4147] hover:text-white h-8 px-2" onClick={() => setLocation("/counselor")}>
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline ml-1">뒤로</span>
          </Button>
          <div className="h-4 w-px bg-[#3F4147] hidden sm:block" />
          <h1 className="font-semibold text-white text-sm hidden sm:flex items-center gap-2 truncate">
            <span className="bg-[#5865F2] text-white text-xs px-2 py-0.5 rounded font-bold tracking-wider shrink-0">DEV</span>
            <span className="truncate">{order?.server_name || "서버 에디터"}</span>
          </h1>
          {/* Mobile: hamburger to open sidebar sheet */}
          <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="lg:hidden text-[#DBDEE1] hover:bg-[#3F4147] h-8 w-8 p-0">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-64 bg-[#2B2D31] border-[#1E1F22]">
              {SidebarContent({ onSelect: () => setMobileSidebarOpen(false) })}
            </SheetContent>
          </Sheet>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <Button
            variant="ghost" size="sm"
            className="text-[#DBDEE1] hover:bg-[#3F4147] hover:text-white h-8 text-xs px-2 sm:px-3"
            onClick={handleSendPreview}
            disabled={sendPreviewMutation.isPending}
          >
            {sendPreviewMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            <span className="hidden sm:inline">미리보기 전송</span>
            <span className="sm:hidden">미리보기</span>
          </Button>
          <Button
            size="sm"
            className="bg-[#5865F2] hover:bg-[#4752C4] text-white h-8 text-xs px-2 sm:px-3"
            onClick={() => setApplyDialogOpen(true)}
          >
            <Zap className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">Discord 적용</span>
          </Button>
          <Button
            size="sm"
            className="bg-[#248046] hover:bg-[#1a6334] text-white h-8 text-xs px-2 sm:px-3"
            onClick={handleSave}
            disabled={updateProjectMutation.isPending}
          >
            {updateProjectMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5 sm:mr-1" />}
            <span className="hidden sm:inline">저장</span>
          </Button>
          <Button
            size="sm"
            className="bg-[#ED4245] hover:bg-[#c03537] text-white h-8 text-xs px-2 sm:px-3"
            onClick={handleMarkComplete}
            disabled={updateOrderMutation.isPending}
          >
            {updateOrderMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 sm:mr-1" />}
            <span className="hidden sm:inline">완료</span>
          </Button>
        </div>
      </header>

      {/* ── 본문: 사이드바 + 메인 패널 ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* 서버 아이콘 레일 (데스크톱만) */}
        <div className="hidden lg:flex w-[72px] bg-[#1E1F22] flex-col items-center py-3 gap-2 shrink-0">
          <div
            className="w-12 h-12 bg-[#5865F2] rounded-2xl flex items-center justify-center text-white font-bold text-xl cursor-pointer shadow-lg hover:rounded-xl transition-all duration-200"
            onClick={() => setSel({ type: "server" })}
          >
            {config.serverName.charAt(0)}
          </div>
          <div className="w-8 h-[2px] bg-[#3F4147] rounded-full" />
        </div>

        {/* 왼쪽 사이드바 (데스크톱) */}
        <div className="hidden lg:flex w-60 xl:w-64 shrink-0 flex-col">
          {SidebarContent({})}
        </div>

        {/* 오른쪽 메인 패널 */}
        <div className="flex-1 overflow-hidden">
          {RightPanel()}
        </div>
      </div>

      {/* Apply Dialog */}
      {orderId && (
        <ApplyDialog
          open={applyDialogOpen}
          onClose={() => setApplyDialogOpen(false)}
          orderId={orderId}
          onSaveFirst={handleSave}
        />
      )}
    </div>
  );
}
