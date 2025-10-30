import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { Features } from "@/components/Features";
import { MapInterface } from "@/components/MapInterface";
// ImpactResults is shown inside the MapInterface when analysis completes
import { Footer } from "@/components/Footer";
import PrismaticBurst from "@/components/PrismaticBurst";

const Index = () => {
  return (
    <div className="min-h-screen bg-background font-['Inter'] relative">
      {/* Full-page prismatic background (behind content) */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <PrismaticBurst
          animationType="rotate3d"
          intensity={1.5}
          speed={0.4}
          distort={0.8}
          paused={false}
          offset={{ x: 0, y: 0 }}
          hoverDampness={0.25}
          rayCount={24}
          mixBlendMode="lighten"
          colors={["#00ffaa", "#4d3dff", "#ffffff"]}
        />
      </div>

      {/* Page content - above the prismatic background */}
      <div className="relative z-10">
        <Navbar />
        <Hero />
        <HowItWorks />
        <Features />
  <MapInterface />
        <Footer />
      </div>
    </div>
  );
};

export default Index;
