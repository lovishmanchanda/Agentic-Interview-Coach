"use client";

import ScoreBars from "@/components/charts/ScoreBars";
import ActivityHeatmap from "@/components/dashboard/ActivityHeatmap";
import AskAria from "@/components/dashboard/AskAria";
import DeskHero from "@/components/dashboard/DeskHero";
import EmptyDesk from "@/components/dashboard/EmptyDesk";
import RecentInterviews from "@/components/dashboard/RecentInterviews";
import ScoreTrend from "@/components/dashboard/ScoreTrend";
import useDashboardData from "@/components/dashboard/useDashboardData";
import Reveal from "@/components/motion/Reveal";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import StatTile from "@/components/ui/StatTile";
import { activity, ariaPrompts, formatDuration, kpis, mastery, trend } from "@/lib/dashboard";
import { TARGET_ROLES, labelFor } from "@/lib/profileOptions";
import { useProfileStore } from "@/store/profileStore";

function Loading() {
  return (
    <div role="status" aria-label="Loading your desk" className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      <div className="grid gap-4 lg:grid-cols-5"><Skeleton className="h-72 rounded-2xl lg:col-span-3" /><Skeleton className="h-72 rounded-2xl lg:col-span-2" /></div>
    </div>
  );
}

/**
 * Your desk (Phase 7.7): the 3D desk up top, then your numbers, how your score has moved, where each topic
 * stands, when you practised, ARIA, and every interview. A new desk explains the loop instead of showing
 * empty charts. Everything comes from your own data (lib/dashboard.js); nothing is invented.
 */
export default function DashboardPage() {
  const profile = useProfileStore((s) => s.profile);
  const data = useDashboardData();
  if (!profile) return null; // AuthGuard guarantees a profile before rendering

  const firstName = profile.personal.name.split(" ")[0];
  const role = labelFor(TARGET_ROLES, profile.target.role);
  const { status, reports, sessions, welcome, plans } = data;
  const ready = status === "ready";
  const k = ready ? kpis(reports, sessions) : null;
  const topics = ready ? mastery(reports) : [];

  return (
    <div>
      <DeskHero firstName={firstName} role={role} company={profile.target.company} data={data} />

      {/* The rest of the dashboard sits on solid black, below the window onto the desk */}
      <div className="relative -mx-4 space-y-6 bg-background px-4 pb-4 md:-mx-8 md:px-8">
        {!ready && <Loading />}

        {ready && reports.length === 0 && <Reveal><EmptyDesk /></Reveal>}

        {ready && reports.length > 0 && (
          <>
            <Reveal className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatTile label="Interviews completed" value={k.completed} />
              <StatTile label="Latest score" value={k.latestScore} decimals={1} suffix="/ 10" delta={k.delta ?? undefined}
                note={k.delta === null ? "Your first report" : "vs the one before"} />
              <StatTile label="Practice streak" value={k.streak} suffix={k.streak === 1 ? "day" : "days"}
                note={k.streak ? "Days in a row" : "Practise today to start one"} />
              <StatTile label="Time in the seat" value={formatDuration(k.practiceSeconds)} note="Across all interviews" />
            </Reveal>

            <div className="grid gap-4 lg:grid-cols-5">
              <Reveal className="lg:col-span-3">
                <Card title="Your score over time" description="Overall score of each interview, oldest to newest." className="h-full">
                  <ScoreTrend points={trend(reports)} />
                </Card>
              </Reveal>
              <Reveal delay={0.08} className="lg:col-span-2">
                {topics.length > 0 ? (
                  <ScoreBars title="Where each topic stands" description="Latest score per topic, weakest first." rows={topics}
                    labelWidth="7rem" className="h-full" />
                ) : (
                  <Card title="Where each topic stands" className="h-full"><p className="text-sm text-muted">Topic scores appear after your first technical interview.</p></Card>
                )}
              </Reveal>
            </div>
          </>
        )}

        {ready && (
          <div className="grid gap-4 lg:grid-cols-5">
            <Reveal className="lg:col-span-3">
              <Card title="Practice activity" description="Interviews started per day, last 12 weeks." className="h-full">
                <ActivityHeatmap data={activity(sessions)} />
              </Card>
            </Reveal>
            <Reveal delay={0.08} className="lg:col-span-2">
              <Card variant="raised" className="h-full">
                <AskAria prompts={ariaPrompts(reports, welcome?.latest?.weakest_topic)} plan={plans[0]} />
              </Card>
            </Reveal>
          </div>
        )}

        {ready && sessions.length > 0 && (
          <Reveal>
            <Card title="Your interviews" description="Open a report, or resume an interview in progress.">
              <RecentInterviews sessions={sessions} reports={reports} />
            </Card>
          </Reveal>
        )}
      </div>
    </div>
  );
}
