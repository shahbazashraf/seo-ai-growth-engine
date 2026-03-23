import React, { useState } from 'react';
import {
  Globe, FileText, LayoutDashboard, Settings,
  Link2, Zap, Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SiteAudit } from '@/components/seo/SiteAudit';
import { AutomationEngine } from '@/components/seo/AutomationEngine';
import { ContentLab } from '@/components/seo/ContentLab';
import { OverviewDashboard } from '@/components/seo/OverviewDashboard';
import { BacklinksManager } from '@/components/seo/BacklinksManager';
import { DistributionEngine } from '@/components/seo/DistributionEngine';
import { SettingsPage } from '@/pages/SettingsPage';
import { useProjects } from '@/hooks/useData';

type View = 'overview' | 'audit' | 'automation' | 'content' | 'backlinks' | 'distribution' | 'settings';

const NAV: { view: View; icon: React.ReactNode; label: string }[] = [
  { view: 'overview',      icon: <LayoutDashboard size={18} />, label: 'Overview' },
  { view: 'audit',         icon: <Globe size={18} />,           label: 'Site Audit' },
  { view: 'content',       icon: <FileText size={18} />,        label: 'Content Lab' },
  { view: 'distribution',  icon: <Send size={18} />,            label: 'Distribution' },
  { view: 'automation',    icon: <Zap size={18} />,             label: 'Automation' },
  { view: 'backlinks',     icon: <Link2 size={18} />,           label: 'Backlinks' },
];

const VIEW_TITLE: Record<View, string> = {
  overview:     'Overview',
  audit:        'Site Audit',
  automation:   'AI Automation Engine',
  content:      'Content Lab',
  backlinks:    'Backlinks Manager',
  distribution: 'Distribution Engine',
  settings:     'Settings',
};

export const Dashboard = () => {
  const [active, setActive] = useState<View>('overview');
  const { data: projects = [] } = useProjects();
  const projectId = projects[0]?.id ?? 'demo-project';

  const renderContent = () => {
    switch (active) {
      case 'overview':   return <OverviewDashboard onNavigate={(v) => setActive(v as View)} />;
      case 'audit':      return <SiteAudit />;
      case 'automation': return <AutomationEngine />;
      case 'content':    return <ContentLab projectId={projectId} />;
      case 'backlinks':     return <BacklinksManager />;
      case 'distribution':  return <DistributionEngine onNavigate={(v) => setActive(v as View)} />;
      case 'settings':      return <SettingsPage />;
      default:           return null;
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 border-r bg-card flex-col hidden md:flex shrink-0">
        <div className="h-16 border-b flex items-center px-5 gap-2.5">
          <Zap className="h-6 w-6 text-primary" />
          <span className="font-bold tracking-tight">SEO Growth</span>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV.map(({ view, icon, label }) => (
            <button
              key={view}
              onClick={() => setActive(view)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active === view
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t">
          <button
            onClick={() => setActive('settings')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              active === 'settings'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            }`}
          >
            <Settings size={18} /> Settings
          </button>

          <div className="mt-3 p-3 bg-primary/5 rounded-xl border border-primary/10">
            <p className="text-xs font-semibold text-primary mb-1">FREE PLAN</p>
            <p className="text-xs text-muted-foreground">Unlimited audits &amp; generation</p>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-16 border-b bg-card/60 backdrop-blur-sm flex items-center justify-between px-6 shrink-0">
          <h1 className="text-base font-semibold">{VIEW_TITLE[active]}</h1>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActive('audit')}
              className="hidden sm:flex"
            >
              <Globe className="h-4 w-4 mr-1.5" /> Audit Site
            </Button>
            <Button
              size="sm"
              onClick={() => setActive('automation')}
              className="shadow-sm shadow-primary/20"
            >
              <Zap className="h-4 w-4 mr-1.5" /> Generate
            </Button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-6 max-w-6xl mx-auto">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
};
