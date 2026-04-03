import React from 'react';
import { motion } from 'framer-motion';
import { Navbar } from '@/components/layout/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BarChart3, Globe, Shield, Zap, ArrowRight, CheckCircle2, Search, FileText, Share2 } from 'lucide-react';
import { Link } from '@tanstack/react-router';

export const LandingPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="container mx-auto max-w-6xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-6">
              <Zap className="h-3 w-3" />
              <span>Introducing SEO AI Growth Engine v1.0</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
              Automate Your Organic <br /> 
              <span className="text-primary">Growth with AI</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
              The only autonomous SEO platform that analyzes your site, researches keywords, generates content, and distributes it across the web.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4 mb-16">
              <Link to="/auth">
                <Button size="lg" className="h-14 px-8 text-lg font-medium shadow-lg shadow-primary/20">
                  Start Growing Now <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="h-14 px-8 text-lg font-medium">
                View Live Demo
              </Button>
            </div>

            <div className="relative max-w-5xl mx-auto">
              <div className="absolute inset-0 bg-primary/20 blur-[100px] rounded-full" />
              <div className="relative bg-card border rounded-2xl shadow-2xl overflow-hidden aspect-video">
                <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
                  <BarChart3 className="h-20 w-20 text-primary/40 animate-pulse" />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-secondary/30 border-y">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Autonomous SEO Engine</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Our AI doesn't just suggest—it executes. From discovery to distribution, your organic growth is on autopilot.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, idx) => (
              <div key={idx} className="p-8 bg-card border rounded-xl hover:shadow-lg transition-shadow">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-6">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4 text-center">
        <div className="container mx-auto max-w-4xl bg-primary text-primary-foreground p-12 rounded-3xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Zap className="h-64 w-64" />
          </div>
          <h2 className="text-4xl font-bold mb-6 relative z-10">Ready to transform your SEO?</h2>
          <p className="text-xl text-primary-foreground/80 mb-10 max-w-xl mx-auto relative z-10">
            Join thousands of websites scaling their organic traffic with the AI Growth Engine.
          </p>
          <Link to="/auth">
            <Button size="lg" variant="secondary" className="h-14 px-10 text-lg relative z-10">
              Get Started for Free
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t">
        <div className="container mx-auto px-4 text-center">
          <div className="flex items-center justify-center space-x-2 mb-6">
            <Zap className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold">SEO Growth</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} SEO AI Growth Engine. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

const features = [
  {
    icon: <Search className="h-6 w-6 text-primary" />,
    title: "AI Site Audit",
    description: "Deep crawl of your website to identify SEO gaps, technical issues, and ranking opportunities."
  },
  {
    icon: <FileText className="h-6 w-6 text-primary" />,
    title: "AI Content Studio",
    description: "Generate high-authority, SEO-optimized blog posts and articles that actually provide value to readers."
  },
  {
    icon: <Share2 className="h-6 w-6 text-primary" />,
    title: "Autonomous Distribution",
    description: "One-click syndication to Medium, Dev.to, LinkedIn, and social media with ethical backlink creation."
  }
];
