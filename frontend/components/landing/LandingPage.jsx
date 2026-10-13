import AgentsSection from "./AgentsSection";
import { FactsBand, TopicBand } from "./Bands";
import Faq from "./Faq";
import FinalCta from "./FinalCta";
import Hero from "./Hero";
import InterviewTypes from "./InterviewTypes";
import LoopStory from "./LoopStory";
import SampleReport from "./SampleReport";
import SiteHeader from "./SiteHeader";

/**
 * The home page (Phase 7.4): the interview room, then the loop, the agents, and the details.
 * A server component: the static sections (bands, agents, interview types, sample report) render to HTML on the
 * server and ship no component code; only the interactive parts are client components (header, hero, loop story,
 * FAQ, final call to action). Scrolling is the browser's own (no scroll library).
 */
export default function LandingPage() {
  return (
    <div className="grain relative">
      <SiteHeader />
      <main id="main" tabIndex={-1} className="focus:outline-none">
        <Hero />
        <TopicBand />
        <LoopStory />
        <FactsBand />
        <AgentsSection />
        <InterviewTypes />
        <SampleReport />
        <Faq />
      </main>
      <FinalCta />
    </div>
  );
}
