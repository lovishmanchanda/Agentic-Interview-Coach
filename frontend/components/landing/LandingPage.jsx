"use client";

import SmoothScroll from "@/components/providers/SmoothScroll";

import AgentsSection from "./AgentsSection";
import { FactsBand, TopicBand } from "./Bands";
import Faq from "./Faq";
import FinalCta from "./FinalCta";
import Hero from "./Hero";
import InterviewTypes from "./InterviewTypes";
import LoopStory from "./LoopStory";
import SampleReport from "./SampleReport";
import SiteHeader from "./SiteHeader";

/** The signed-out home page (Phase 7.4): the interview room, then the loop, the agents, and the details. */
export default function LandingPage() {
  return (
    <SmoothScroll>
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
    </SmoothScroll>
  );
}
