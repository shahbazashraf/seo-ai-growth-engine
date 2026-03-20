import React from 'react';
import {
  BarChart3,
  Globe,
  Search,
  FileText,
  Share2,
  LayoutDashboard,
  Settings,
  TrendingUp,
  Users,
  Clock,
  PlusCircle,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SiteAudit } from '@/components/seo/SiteAudit';
import { ContentLab } from '@/components/seo/ContentLab';
import { AutomationSettings } from '@/components/seo/AutomationSettings';
import { OverviewDashboard } from '@/components/seo/OverviewDashboard';
import { useProjects } from '@/hooks/useData';

type DashboardView = 'overview' | 'audit' | 'content' | 'automation' | 'distribution' | 'backlinks' | 'settings';

const VIEW_LABELS: Record<DashboardView, string> = {
  overview: 'Overview',
  audit: 'Site Audit',
  content: 'Content Lab',
  automation: 'Automation Engine',
  distribution: 'Distribution',
  backlinks: 'Backlinks',
  settings: 'Settings',
};

export const Dashboard = () => {
  const { data: projects = [] } = useProjects();
  const selectedProjectId = projects[0]?.id || 'demo-project';
  const [activeView, setActiveView] = React.useState<DashboardView>('overview');

  const renderContent = () => {
    switch (activeView) {
      case 'overview':
        return <OverviewDashboard onNavigate={(v) => setActiveView(v as DashboardView)} />;
      case 'audit':
        return <SiteAudit />;
      case 'content':
        return <ContentLab projectId={selectedProjectId} />;
      case 'automation':
        return <AutomationSettings projectId={selectedProjectId} />;
      default:
        return (
          <div className="flex flex-col items-center justify-center h-[400px] border-2 border-dashed rounded-xl text-muted-foreground gap-3">
            <span className="text-4xl">🚧</span>
            <p className="font-medium capitalize">{VIEW_LABELS[activeView]} — Coming Soon</p>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-60 border-r bg-card hidden md:flex flex-col shrink-0">
        <div className="p-5 border-b">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-sm">SEO Growth Engine</span>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <NavItem icon={<LayoutDashboard size={18} />} label="Overview"         active={activeView === 'overview'}    onClick={() => setActiveView('overview')} />
          <NavItem icon={<Search size={18} />}          label="Site Audit"       active={activeView === 'audit'}       onClick={() => setActiveView('audit')} />
          <NavItem icon={<Zap size={18} />}             label="Automation"       active={activeView === 'automation'}  onClick={() => setActiveView('automation')} />
          <NavItem icon={<FileText size={18} />}        label="Content Lab"      active={activeView === 'content'}     onClick={() => setActiveView('content')} />
          <NavItem icon={<Share2 size={18} />}          label="Distribution"     active={activeView === 'distribution'} onClick={() => setActiveView('distribution')} />
          <NavItem icon={<Users size={18} />}           label="Backlinks"        active={activeView === 'backlinks'}   onClick={() => setActiveView('backlinks')} />
        </nav>

        <div className="p-3 border-t space-y-2">
          <NavItem icon={<Settings size={18} />} label="Settings" active={activeView === 'settings'} onClick={() => setActiveView('settings')} />
          <div className="p-3 bg-primary/10 rounded-xl border border-primary/20">
            <p className="text-xs font-semibold text-primary mb-0.5">FREE PLAN</p>
            <p className="text-xs text-muted-foreground mb-2">Run your first audit to get started.</p>
            <div className="w-full bg-primary/20 h-1.5 rounded-full overflow-hidden">
              <div className="bg-primary w-0 h-full" />
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto min-w-0">
        <header className="h-14 border-b flex items-center justify-between px-6 bg-card/60 backdrop-blur-sm sticky top-0 z-10">
          <h1 className="text-base font-semibold">{VIEW_LABELS[activeView]}</h1>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              className="hidden sm:flex gap-1.5 text-xs"
              onClick={() => setActiveView('audit')}
            >
              <Search className="h-3.5 w-3.5" /> New Audit
            </Button>
            <Button
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setActiveView('automation')}
            >
              <Zap className="h-3.5 w-3.5" /> Generate Content
            </Button>
          </div>
        </header>

        <div className="p-6 max-w-7xl mx-auto">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

const NavItem = ({
  icon, label, active = false, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors ${
      active
        ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
    }`}
  >
    {icon}
    <span className="font-medium">{label}</span>
  </button>
);
