import React, { useState, useEffect, useCallback } from 'react';
import {
  Globe, FileText, LayoutDashboard, Settings,
  Link2, Zap, Send, Target, Network, Database,
  LogOut, Menu, X, ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SiteAudit } from '@/components/seo/SiteAudit';
import { AutomationEngine } from '@/components/seo/AutomationEngine';
import { ContentLab } from '@/components/seo/ContentLab';
import { OverviewDashboard } from '@/components/seo/OverviewDashboard';
import { BacklinksManager } from '@/components/seo/BacklinksManager';
import { DistributionEngine } from '@/components/seo/DistributionEngine';
import { CompetitorAnalysis } from '@/components/seo/CompetitorAnalysis';
import { InternalLinkGraph } from '@/components/seo/InternalLinkGraph';
import { ProgrammaticSEO } from '@/components/seo/ProgrammaticSEO';
import { SettingsPage } from '@/pages/SettingsPage';
import { useProjects } from '@/hooks/useData';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from '@tanstack/react-router';
import toast from 'react-hot-toast';

type View =
  | 'overview'
  | 'audit'
  | 'competitor'
  | 'internal_links'
  | 'programmatic'
  | 'automation'
  | 'content'
  | 'backlinks'
  | 'distribution'
  | 'settings';

interface NavItem {
  view: View;
  icon: React.ReactNode;
  label: string;
}

const NAV: NavItem[] = [
  { view: 'overview',       icon: <LayoutDashboard size={18} />, label: 'Overview' },
  { view: 'audit',          icon: <Globe size={18} />,           label: 'Site Audit' },
  { view: 'competitor',     icon: <Target size={18} />,          label: 'Competitor SERP' },
  { view: 'internal_links', icon: <Network size={18} />,         label: 'Internal Links' },
  { view: 'content',        icon: <FileText size={18} />,        label: 'Content Lab' },
  { view: 'distribution',   icon: <Send size={18} />,            label: 'Distribution' },
  { view: 'automation',     icon: <Zap size={18} />,             label: 'Automation' },
  { view: 'backlinks',      icon: <Link2 size={18} />,           label: 'Backlinks' },
];

const VIEW_TITLE: Record<View, string> = {
  overview:       'Overview',
  audit:          'Site Audit',
  competitor:     'Competitor SERP Engine',
  internal_links: 'Internal Link Builder',
  programmatic:   'Programmatic SEO Engine',
  automation:     'AI Automation Engine',
  content:        'Content Lab',
  backlinks:      'Backlinks Manager',
  distribution:   'Distribution Engine',
  settings:       'Settings',
};

// ─── Sidebar Nav Item ────────────────────────────────────────────────────────
function NavButton({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
        active
          ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25'
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
      }`}
    >
      <span className="shrink-0">{item.icon}</span>
      <span className="truncate">{item.label}</span>
      {active && <ChevronRight size={14} className="ml-auto shrink-0 opacity-60" />}
    </button>
  );
}

// ─── Desktop Sidebar ─────────────────────────────────────────────────────────
function DesktopSidebar({
  active,
  user,
  onNavigate,
  onLogout,
}: {
  active: View;
  user: { email?: string | null; displayName?: string | null } | null;
  onNavigate: (v: View) => void;
  onLogout: () => void;
}) {
  return (
    <aside className="w-60 border-r bg-card flex-col hidden md:flex shrink-0">
      {/* Logo */}
      <div className="h-16 border-b flex items-center px-5 gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <Zap className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-bold tracking-tight text-sm">SEO Growth</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV.map((item) => (
          <NavButton
            key={item.view}
            item={item}
            active={active === item.view}
            onClick={() => onNavigate(item.view)}
          />
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t space-y-1">
        <NavButton
          item={{ view: 'settings', icon: <Settings size={18} />, label: 'Settings' }}
          active={active === 'settings'}
          onClick={() => onNavigate('settings')}
        />

        <div className="mt-3 p-3 bg-primary/5 rounded-xl border border-primary/10">
          <p className="text-xs font-semibold text-primary mb-0.5">FREE PLAN</p>
          <p className="text-xs text-muted-foreground">Unlimited audits &amp; generation</p>
        </div>

        <div className="pt-2 border-t mt-3">
          {(user?.displayName || user?.email) && (
            <p className="text-xs font-medium text-muted-foreground truncate px-3 mb-2">
              {user.displayName ?? user.email}
            </p>
          )}
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
              text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </div>
    </aside>
  );
}

// ─── Mobile Drawer ────────────────────────────────────────────────────────────
function MobileDrawer({
  open,
  active,
  user,
  onNavigate,
  onLogout,
  onClose,
}: {
  open: boolean;
  active: View;
  user: { email?: string | null; displayName?: string | null } | null;
  onNavigate: (v: View) => void;
  onLogout: () => void;
  onClose: () => void;
}) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className="fixed inset-y-0 left-0 z-50 w-72 bg-card border-r flex flex-col
          shadow-2xl md:hidden animate-in slide-in-from-left duration-250"
      >
        {/* Header */}
        <div className="h-16 border-b flex items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold tracking-tight text-sm">SEO Growth</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV.map((item) => (
            <NavButton
              key={item.view}
              item={item}
              active={active === item.view}
              onClick={() => {
                onNavigate(item.view);
                onClose();
              }}
            />
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t space-y-1">
          <NavButton
            item={{ view: 'settings', icon: <Settings size={18} />, label: 'Settings' }}
            active={active === 'settings'}
            onClick={() => {
              onNavigate('settings');
              onClose();
            }}
          />

          <div className="mt-3 p-3 bg-primary/5 rounded-xl border border-primary/10">
            <p className="text-xs font-semibold text-primary mb-0.5">FREE PLAN</p>
            <p className="text-xs text-muted-foreground">Unlimited audits &amp; generation</p>
          </div>

          <div className="pt-2 border-t mt-3">
            {(user?.displayName || user?.email) && (
              <p className="text-xs font-medium text-muted-foreground truncate px-3 mb-2">
                {user.displayName ?? user.email}
              </p>
            )}
            <button
              onClick={() => { onLogout(); onClose(); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
            >
              <LogOut size={18} />
              Logout
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export const Dashboard = () => {
  const [active, setActive] = useState<View>('overview');
  const [distContentId, setDistContentId] = useState<string>('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const { data: projects = [] } = useProjects();
  const projectId = projects[0]?.id ?? 'demo-project';
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = useCallback(async () => {
    try {
      await logout();
      navigate({ to: '/' });
    } catch (err) {
      console.error(err);
      toast.error('Logout failed. Please try again.');
    }
  }, [logout, navigate]);

  const handleNavigate = useCallback((v: View) => {
    setActive(v);
  }, []);

  const renderContent = () => {
    switch (active) {
      case 'overview':
        return <OverviewDashboard onNavigate={(v) => setActive(v as View)} />;
      case 'audit':
        return <SiteAudit />;
      case 'competitor':
        return <CompetitorAnalysis />;
      case 'internal_links':
        return <InternalLinkGraph />;
      case 'programmatic':
        return <ProgrammaticSEO />;
      case 'automation':
        return <AutomationEngine />;
      case 'content':
        return (
          <ContentLab
            projectId={projectId}
            onNavigate={(v, id) => {
              if (id) setDistContentId(id);
              setActive(v as View);
            }}
          />
        );
      case 'backlinks':
        return <BacklinksManager />;
      case 'distribution':
        return (
          <DistributionEngine
            onNavigate={(v) => setActive(v as View)}
            initialContentId={distContentId}
          />
        );
      case 'settings':
        return <SettingsPage />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* ── Desktop sidebar ── */}
      <DesktopSidebar
        active={active}
        user={user}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
      />

      {/* ── Mobile drawer ── */}
      <MobileDrawer
        open={mobileNavOpen}
        active={active}
        user={user}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
        onClose={() => setMobileNavOpen(false)}
      />

      {/* ── Main content area ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Top bar */}
        <header className="h-14 md:h-16 border-b bg-card/60 backdrop-blur-sm
          flex items-center justify-between px-4 md:px-6 shrink-0 gap-3">

          {/* Mobile: hamburger + breadcrumb */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="md:hidden p-2 -ml-1 rounded-lg text-muted-foreground
                hover:text-foreground hover:bg-secondary transition-colors shrink-0"
              aria-label="Open navigation menu"
              aria-expanded={mobileNavOpen}
            >
              <Menu size={20} />
            </button>
            <h1 className="text-sm md:text-base font-semibold truncate">
              {VIEW_TITLE[active]}
            </h1>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActive('audit')}
              className="hidden sm:flex h-8 md:h-9"
            >
              <Globe className="h-3.5 w-3.5 mr-1.5" />
              <span className="hidden md:inline">Audit Site</span>
              <span className="md:hidden">Audit</span>
            </Button>
            <Button
              size="sm"
              onClick={() => setActive('automation')}
              className="shadow-sm shadow-primary/20 h-8 md:h-9"
            >
              <Zap className="h-3.5 w-3.5 mr-1.5" />
              <span>Generate</span>
            </Button>
          </div>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 md:p-6 max-w-6xl mx-auto">
            {renderContent()}
          </div>
        </main>

        {/* Mobile bottom nav (quick shortcuts) */}
        <nav className="md:hidden border-t bg-card/80 backdrop-blur-sm flex shrink-0"
          aria-label="Quick navigation">
          {NAV.slice(0, 5).map((item) => (
            <button
              key={item.view}
              onClick={() => setActive(item.view)}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors ${
                active === item.view
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="h-5 w-5 flex items-center justify-center">{item.icon}</span>
              <span className="truncate max-w-[52px]">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
};
