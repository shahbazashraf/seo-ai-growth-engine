import React from 'react';
import { motion } from 'framer-motion';
import { 
  BarChart3, 
  Globe, 
  Search, 
  FileText, 
  Share2, 
  LayoutDashboard, 
  Settings, 
  Plus, 
  TrendingUp, 
  Users, 
  Clock,
  ArrowUpRight,
  PlusCircle,
  MoreVertical
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Link } from '@tanstack/react-router';
import { SiteAudit } from '@/components/seo/SiteAudit';
import { ContentLab } from '@/components/seo/ContentLab';
import { useProjects } from '@/hooks/useData';

export const Dashboard = () => {
  const { data: projects = [] } = useProjects();
  const selectedProjectId = projects[0]?.id || 'demo-project';

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card hidden md:flex flex-col">
        <div className="p-6 border-b">
          <div className="flex items-center space-x-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            <span className="font-bold">Growth Engine</span>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <NavItem icon={<LayoutDashboard size={20} />} label="Overview" active />
          <NavItem icon={<Search size={20} />} label="Site Audit" />
          <NavItem icon={<TrendingUp size={20} />} label="Keywords" />
          <NavItem icon={<FileText size={20} />} label="Content Lab" />
          <NavItem icon={<Share2 size={20} />} label="Distribution" />
          <NavItem icon={<Users size={20} />} label="Backlinks" />
        </nav>

        <div className="p-4 border-t space-y-2">
          <NavItem icon={<Settings size={20} />} label="Settings" />
          <div className="p-4 bg-primary/10 rounded-xl border border-primary/20">
            <p className="text-xs font-medium text-primary mb-1">PRO PLAN</p>
            <p className="text-xs text-muted-foreground mb-3">You've used 8/10 articles</p>
            <div className="w-full bg-primary/20 h-1.5 rounded-full overflow-hidden">
              <div className="bg-primary w-[80%] h-full" />
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <header className="h-16 border-b flex items-center justify-between px-8 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <h1 className="text-lg font-semibold">Project Overview</h1>
          <div className="flex items-center space-x-4">
            <Button variant="outline" size="sm" className="hidden sm:flex">
              <Clock className="mr-2 h-4 w-4" /> History
            </Button>
            <Button size="sm">
              <PlusCircle className="mr-2 h-4 w-4" /> New Audit
            </Button>
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto space-y-8">
          <Tabs defaultValue="overview">
            <TabsList className="mb-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="audit">Site Audit</TabsTrigger>
              <TabsTrigger value="content">Content Lab</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-8">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard 
                  title="Health Score" 
                  value="84/100" 
                  change="+12" 
                  icon={<Globe className="text-primary" size={20} />} 
                />
                <StatCard 
                  title="Organic Traffic" 
                  value="12,402" 
                  change="+24%" 
                  icon={<TrendingUp className="text-primary" size={20} />} 
                />
                <StatCard 
                  title="Keywords Ranked" 
                  value="142" 
                  change="+18" 
                  icon={<Search className="text-primary" size={20} />} 
                />
                <StatCard 
                  title="Backlinks" 
                  value="2,105" 
                  change="+142" 
                  icon={<Share2 className="text-primary" size={20} />} 
                />
              </div>

              <div className="grid lg:grid-cols-3 gap-8">
                {/* Main Graph Area */}
                <Card className="lg:col-span-2">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Growth Projection</CardTitle>
                      <CardDescription>Estimated traffic growth based on AI content strategy</CardDescription>
                    </div>
                    <Button variant="ghost" size="icon"><MoreVertical size={20} /></Button>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px] w-full bg-secondary/30 rounded-lg flex items-center justify-center border-2 border-dashed">
                      <BarChart3 className="h-12 w-12 text-muted-foreground opacity-20" />
                      <span className="ml-3 text-muted-foreground font-medium">Analytics Visualization Coming Soon</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Quick Actions / Activity */}
                <Card>
                  <CardHeader>
                    <CardTitle>AI Content Queue</CardTitle>
                    <CardDescription>Pending drafts and distribution</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <QueueItem 
                      title="10 Best AI Tools for 2026" 
                      status="Researching" 
                      progress={45} 
                    />
                    <QueueItem 
                      title="Scaling Organic Traffic in 30 Days" 
                      status="Drafting" 
                      progress={15} 
                    />
                    <QueueItem 
                      title="Future of Autonomous SEO" 
                      status="Ready" 
                      progress={100} 
                    />
                    <Button className="w-full mt-4" variant="outline">View Full Library</Button>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="audit">
              <SiteAudit />
            </TabsContent>

            <TabsContent value="content">
              <ContentLab projectId={selectedProjectId} />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

const NavItem = ({ icon, label, active = false }: { icon: React.ReactNode, label: string, active?: boolean }) => (
  <button className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
    active ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
  }`}>
    {icon}
    <span className="text-sm font-medium">{label}</span>
  </button>
);

const StatCard = ({ title, value, change, icon }: { title: string, value: string, change: string, icon: React.ReactNode }) => (
  <Card>
    <CardContent className="pt-6">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div className="p-2 bg-primary/10 rounded-lg">{icon}</div>
      </div>
      <div className="flex items-baseline justify-between">
        <h3 className="text-2xl font-bold">{value}</h3>
        <span className="text-xs font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded flex items-center">
          {change} <ArrowUpRight className="ml-0.5 h-3 w-3" />
        </span>
      </div>
    </CardContent>
  </Card>
);

const QueueItem = ({ title, status, progress }: { title: string, status: string, progress: number }) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between text-xs">
      <span className="font-medium truncate max-w-[150px]">{title}</span>
      <span className={progress === 100 ? 'text-primary' : 'text-muted-foreground'}>{status}</span>
    </div>
    <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
      <div 
        className={`h-full transition-all duration-500 ${progress === 100 ? 'bg-primary' : 'bg-primary/50'}`} 
        style={{ width: `${progress}%` }} 
      />
    </div>
  </div>
);
