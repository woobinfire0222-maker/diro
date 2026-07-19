import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Hash, Volume2, Plus, Settings as SettingsIcon, ChevronDown, FolderOpen, ArrowLeft, Save, Shield, Video, Megaphone, CheckCircle } from "lucide-react";
import { useGetServerProject, useUpdateServerProject, useGetOrder } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

type ChannelType = "text" | "voice" | "stage" | "announcement";

interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  topic?: string;
  nsfw?: boolean;
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
  permissions: string[];
}

interface ServerConfig {
  categories: Category[];
  roles: Role[];
  serverName: string;
  verificationLevel: string;
}

const defaultConfig: ServerConfig = {
  serverName: "새 서버",
  verificationLevel: "low",
  categories: [
    {
      id: "cat-1",
      name: "정보",
      channels: [
        { id: "ch-1", name: "공지사항", type: "announcement" },
        { id: "ch-2", name: "환영합니다", type: "text" }
      ]
    },
    {
      id: "cat-2",
      name: "일반",
      channels: [
        { id: "ch-3", name: "잡담", type: "text" },
        { id: "ch-4", name: "일반 음성", type: "voice" }
      ]
    }
  ],
  roles: [
    { id: "role-1", name: "관리자", color: "#ED4245", permissions: ["ADMINISTRATOR"] },
    { id: "role-2", name: "멤버", color: "#5865F2", permissions: ["VIEW_CHANNEL", "SEND_MESSAGES"] }
  ]
};

export default function ServerEditorPage() {
  const [, params] = useRoute("/counselor/editor/:orderId");
  const [, setLocation] = useLocation();
  const orderId = params?.orderId;
  const { toast } = useToast();

  const { data: order, isLoading: isOrderLoading } = useGetOrder(orderId!, { query: { enabled: !!orderId } });
  const { data: project, isLoading: isProjectLoading, refetch } = useGetServerProject(orderId!, { query: { enabled: !!orderId } });
  const updateProjectMutation = useUpdateServerProject();

  const [config, setConfig] = useState<ServerConfig>(defaultConfig);
  const [selectedItem, setSelectedItem] = useState<{ type: 'server' | 'category' | 'channel' | 'role', id?: string, categoryId?: string }>({ type: 'server' });

  useEffect(() => {
    if (project && project.config_json) {
      try {
        setConfig({ ...defaultConfig, ...JSON.parse(project.config_json) });
      } catch (e) {
        console.error("Failed to parse config", e);
      }
    } else if (order) {
      // Initialize with order info if no project exists
      setConfig(prev => ({ ...prev, serverName: order.server_name }));
    }
  }, [project, order]);

  const handleSave = async () => {
    if (!orderId) return;
    try {
      await updateProjectMutation.mutateAsync({
        orderId,
        data: {
          config_json: JSON.stringify(config)
        }
      });
      toast({ title: "저장 완료", description: "서버 설정이 저장되었습니다." });
      refetch();
    } catch (e) {
      toast({ variant: "destructive", title: "저장 실패" });
    }
  };

  const getChannelIcon = (type: ChannelType) => {
    switch(type) {
      case "text": return <Hash className="h-4 w-4 text-muted-foreground" />;
      case "voice": return <Volume2 className="h-4 w-4 text-muted-foreground" />;
      case "announcement": return <Megaphone className="h-4 w-4 text-muted-foreground" />;
      case "stage": return <Video className="h-4 w-4 text-muted-foreground" />;
      default: return <Hash className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (isProjectLoading || isOrderLoading) {
    return <div className="h-screen w-full flex items-center justify-center bg-[#1E1F22]"><div className="animate-spin h-8 w-8 border-4 border-[#5865F2] border-t-transparent rounded-full" /></div>;
  }

  const selectedChannel = selectedItem.type === 'channel' 
    ? config.categories.find(c => c.id === selectedItem.categoryId)?.channels.find(ch => ch.id === selectedItem.id)
    : null;

  return (
    <div className="flex h-screen flex-col bg-[#1E1F22] text-[#DBDEE1] font-sans overflow-hidden">
      {/* Top Header */}
      <header className="h-12 bg-[#2B2D31] border-b border-[#1E1F22] flex items-center justify-between px-4 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="text-[#DBDEE1] hover:bg-[#3F4147] hover:text-white" onClick={() => setLocation('/counselor')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> 뒤로
          </Button>
          <div className="h-4 w-px bg-[#3F4147] mx-1" />
          <h1 className="font-semibold text-white flex items-center gap-2">
            <span className="bg-[#5865F2] text-white text-xs px-2 py-0.5 rounded uppercase font-bold tracking-wider">Editor</span>
            {order?.server_name || "서버 편집기"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="bg-transparent border-[#3F4147] text-[#DBDEE1] hover:bg-[#3F4147] hover:text-white">
            미리보기 전송
          </Button>
          <Button size="sm" className="bg-[#248046] hover:bg-[#1a6334] text-white" onClick={handleSave} disabled={updateProjectMutation.isPending}>
            <Save className="mr-2 h-4 w-4" /> 저장
          </Button>
        </div>
      </header>

      <ResizablePanelGroup direction="horizontal" className="flex-1 overflow-hidden">
        {/* Far Left - Servers mock */}
        <div className="w-[72px] bg-[#1E1F22] flex flex-col items-center py-3 gap-2 shrink-0">
          <div className="w-12 h-12 bg-[#5865F2] rounded-2xl flex items-center justify-center text-white font-bold text-xl cursor-pointer shadow-lg hover:rounded-xl transition-all duration-200">
            {config.serverName.charAt(0)}
          </div>
          <div className="w-8 h-[2px] bg-[#3F4147] rounded-full mx-auto my-1" />
          <div className="w-12 h-12 bg-[#313338] rounded-[24px] hover:rounded-xl hover:bg-[#5865F2] hover:text-white transition-all duration-200 flex items-center justify-center text-[#23A559] cursor-pointer">
            <Plus className="h-6 w-6" />
          </div>
        </div>

        {/* Sidebar - Channels */}
        <ResizablePanel defaultSize={20} minSize={15} maxSize={30} className="bg-[#2B2D31] flex flex-col rounded-tl-lg">
          <div 
            className="h-12 border-b border-[#1E1F22] flex items-center px-4 font-bold text-white shadow-sm cursor-pointer hover:bg-[#3F4147] transition-colors"
            onClick={() => setSelectedItem({ type: 'server' })}
          >
            {config.serverName}
            <ChevronDown className="ml-auto h-4 w-4 opacity-70" />
          </div>
          
          <div className="flex-1 overflow-y-auto py-3 px-2 custom-scrollbar">
            {config.categories.map((category) => (
              <div key={category.id} className="mb-4">
                <div className="flex items-center justify-between px-2 text-[#949BA4] hover:text-[#DBDEE1] cursor-pointer group mb-1">
                  <div className="flex items-center text-xs font-bold uppercase tracking-wider">
                    <ChevronDown className="h-3 w-3 mr-1" />
                    {category.name}
                  </div>
                  <Plus className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                </div>
                <div className="space-y-[2px]">
                  {category.channels.map((channel) => (
                    <div 
                      key={channel.id}
                      onClick={() => setSelectedItem({ type: 'channel', id: channel.id, categoryId: category.id })}
                      className={`flex items-center px-2 py-1.5 mx-1 rounded-md cursor-pointer text-[#949BA4] hover:bg-[#3F4147] hover:text-[#DBDEE1] ${selectedItem.id === channel.id ? 'bg-[#3F4147] text-white' : ''}`}
                    >
                      {getChannelIcon(channel.type)}
                      <span className="ml-1.5 truncate flex-1">{channel.name}</span>
                      <SettingsIcon className="h-3 w-3 opacity-0 hover:opacity-100" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-auto bg-[#232428] p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 bg-[#5865F2] rounded-full flex items-center justify-center text-white font-bold text-xs">DI</div>
              <div className="text-xs">
                <div className="font-bold text-white">DIRO Bot</div>
                <div className="text-[#949BA4]">#1234</div>
              </div>
            </div>
            <div className="flex gap-1 text-[#949BA4]">
              <SettingsIcon className="h-4 w-4 cursor-pointer hover:text-[#DBDEE1]" />
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle className="bg-[#1E1F22] w-1" />

        {/* Main Editor */}
        <ResizablePanel defaultSize={80} className="bg-[#313338] flex flex-col">
          <div className="h-12 border-b border-[#1E1F22] flex items-center px-4 gap-2 font-bold text-white shadow-sm shrink-0">
            {selectedItem.type === 'server' && (
              <><Shield className="h-5 w-5 text-[#949BA4]" /> 서버 설정</>
            )}
            {selectedItem.type === 'channel' && selectedChannel && (
              <>{getChannelIcon(selectedChannel.type)} {selectedChannel.name}</>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-3xl">
              {selectedItem.type === 'server' && (
                <div className="space-y-8 animate-in fade-in">
                  <div>
                    <h2 className="text-xl font-bold text-white mb-4">서버 개요</h2>
                    <div className="space-y-4 bg-[#2B2D31] p-6 rounded-lg border border-[#1E1F22]">
                      <div className="space-y-2">
                        <Label className="text-[#B5BAC1] font-bold uppercase text-xs">서버 이름</Label>
                        <Input 
                          value={config.serverName}
                          onChange={e => setConfig({...config, serverName: e.target.value})}
                          className="bg-[#1E1F22] border-none text-[#DBDEE1] focus-visible:ring-[#00C7FF]"
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h2 className="text-xl font-bold text-white mb-4">역할 관리</h2>
                    <div className="bg-[#2B2D31] rounded-lg border border-[#1E1F22] overflow-hidden">
                      <div className="p-4 border-b border-[#1E1F22] flex justify-between items-center">
                        <p className="text-sm text-[#949BA4]">멤버들에게 권한을 부여하고 이름을 색상으로 꾸며보세요.</p>
                        <Button size="sm" className="bg-[#5865F2] hover:bg-[#4752C4] text-white">새 역할 만들기</Button>
                      </div>
                      <div className="p-2 space-y-1">
                        {config.roles.map(role => (
                          <div key={role.id} className="flex items-center p-2 hover:bg-[#3F4147] rounded cursor-pointer group">
                            <div className="w-3 h-3 rounded-full mr-3" style={{ backgroundColor: role.color }} />
                            <span className="flex-1 text-[#DBDEE1] group-hover:text-white">{role.name}</span>
                            <div className="text-xs text-[#949BA4] opacity-0 group-hover:opacity-100 transition-opacity">
                              편집
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {selectedItem.type === 'channel' && selectedChannel && (
                <div className="space-y-8 animate-in fade-in">
                  <div>
                    <h2 className="text-xl font-bold text-white mb-4">채널 설정</h2>
                    <div className="space-y-6 bg-[#2B2D31] p-6 rounded-lg border border-[#1E1F22]">
                      <div className="space-y-2">
                        <Label className="text-[#B5BAC1] font-bold uppercase text-xs">채널 이름</Label>
                        <Input 
                          value={selectedChannel.name}
                          onChange={(e) => {
                            const newConfig = {...config};
                            const cat = newConfig.categories.find(c => c.id === selectedItem.categoryId);
                            if (cat) {
                              const ch = cat.channels.find(c => c.id === selectedItem.id);
                              if (ch) ch.name = e.target.value;
                            }
                            setConfig(newConfig);
                          }}
                          className="bg-[#1E1F22] border-none text-[#DBDEE1] focus-visible:ring-[#00C7FF]"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-[#B5BAC1] font-bold uppercase text-xs">채널 주제</Label>
                        <Textarea 
                          value={selectedChannel.topic || ""}
                          placeholder="이 채널에 대한 설명을 입력하세요"
                          className="bg-[#1E1F22] border-none text-[#DBDEE1] resize-none focus-visible:ring-[#00C7FF]"
                        />
                      </div>
                      
                      <div className="flex items-center justify-between pt-4 border-t border-[#1E1F22]">
                        <div className="space-y-1">
                          <Label className="text-[#DBDEE1] font-medium">연령 제한 채널 (NSFW)</Label>
                          <p className="text-sm text-[#949BA4]">사용자가 이 채널의 콘텐츠를 보기 전에 18세 이상인지 확인해야 합니다.</p>
                        </div>
                        <Switch />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
