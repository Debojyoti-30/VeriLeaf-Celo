import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { Features } from "@/components/Features";
import { MapInterface } from "@/components/MapInterface";
// ImpactResults is shown inside the MapInterface when analysis completes
import { Footer } from "@/components/Footer";
// PrismaticBurst disabled to improve performance

const Index = () => {
  return (
    <div className="min-h-screen bg-background font-['Inter']">
      {/* Page content */}
      <div className="relative">
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
