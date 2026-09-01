import Footer from "@/components/layout/Footer";
import Nav from "@/components/layout/Nav";
import CustomCursor from "@/components/ui/CustomCursor";
import Loader from "@/components/ui/Loader";
import DayList from "@/features/home/DayList";
import About from "@/features/home/sections/About";
import BrosMoment from "@/features/home/sections/BrosMoment";
import Coffee from "@/features/home/sections/Coffee";
import Collection from "@/features/home/sections/Collection";
import Community from "@/features/home/sections/Community";
import DiscoverBros from "@/features/home/sections/DiscoverBros";
import Hero from "@/features/home/sections/Hero";
import LoyaltyCTA from "@/features/home/sections/LoyaltyCTA";
import Marquee from "@/features/home/sections/Marquee";
import MenuPreview from "@/features/home/sections/MenuPreview";
import MerchLookbook from "@/features/home/sections/MerchLookbook";
import OpeningTeaser from "@/features/home/sections/OpeningTeaser";
import WhatsNew from "@/features/home/sections/WhatsNew";
import YourPicks from "@/features/home/sections/YourPicks";
import { useLenis } from "@/hooks/useLenis";

/**
 * The cinematic single-page homepage.
 *
 * Section order here must match HOME_SECTIONS in config/site.js — that list
 * drives the numbered editorial labels (01, 02, …).
 */
export default function HomePage() {
  useLenis();

  return (
    <div className="bg-cream text-olive">
      <Loader />
      <CustomCursor />
      <Nav />
      <main>
        <Hero />
        <Marquee />
        <OpeningTeaser />
        <Coffee />
        <Collection />
        <YourPicks />
        <BrosMoment />
        <About />
        <MenuPreview />
        <DiscoverBros />
        <MerchLookbook />
        <LoyaltyCTA />
        <WhatsNew />
        <Community />
      </main>
      <Footer />
      <DayList />
    </div>
  );
}
