import React from 'react';
import { Link } from '@tanstack/react-router';
import { BarChart3, Globe, Shield, Zap, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const Navbar = () => {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center space-x-2">
            <Zap className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold tracking-tight">SEO Growth</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center space-x-8">
            <Link to="/" className="text-sm font-medium hover:text-primary transition-colors">Features</Link>
            <Link to="/" className="text-sm font-medium hover:text-primary transition-colors">Pricing</Link>
            <Link to="/" className="text-sm font-medium hover:text-primary transition-colors">Resources</Link>
            <div className="flex items-center space-x-4">
              <Link to="/dashboard">
                <Button variant="ghost" size="sm">Sign In</Button>
              </Link>
              <Link to="/dashboard">
                <Button size="sm">Get Started</Button>
              </Link>
            </div>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 text-muted-foreground hover:text-primary transition-colors"
            >
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        {isOpen && (
          <div className="md:hidden pb-6 space-y-4 animate-fade-in">
            <Link to="/" className="block text-sm font-medium hover:text-primary px-2 py-1">Features</Link>
            <Link to="/" className="block text-sm font-medium hover:text-primary px-2 py-1">Pricing</Link>
            <Link to="/" className="block text-sm font-medium hover:text-primary px-2 py-1">Resources</Link>
            <div className="flex flex-col space-y-2 pt-4">
              <Link to="/dashboard" className="w-full">
                <Button variant="ghost" className="w-full justify-start">Sign In</Button>
              </Link>
              <Link to="/dashboard" className="w-full">
                <Button className="w-full">Get Started</Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};
