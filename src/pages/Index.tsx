import { useState } from "react";
import { MusicSidebar } from "@/components/sidebar/MusicSidebar";
import { HeroSection } from "@/components/hero/HeroSection";
import { UserProfile } from "@/components/auth/UserProfile";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";

const Index = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-hero flex">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <MusicSidebar />
      </div>

      {/* Mobile sidebar toggle */}
      <div className="md:hidden absolute top-4 left-4 z-20">
        <Button size="sm" variant="ghost" onClick={() => setSidebarOpen(true)}>
          <Menu className="w-5 h-5" />
        </Button>
      </div>

      {/* Mobile overlay sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-80 animate-slide-in-left">
            <MusicSidebar />
          </div>
        </div>
      )}

      <div className="flex-1 relative flex flex-col">
        <div className="absolute top-4 right-4 z-10">
          <UserProfile />
        </div>
        <HeroSection />

        {/* Footer */}
        <footer className="py-4 text-center text-sm text-muted-foreground border-t border-border/30 bg-background/50 backdrop-blur-sm">
          <p>
            A product by{' '}
            <a
              href="https://niftysoftsol.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium"
            >
              Nifty Software Solutions
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
