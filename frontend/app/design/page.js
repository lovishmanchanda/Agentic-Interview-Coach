import { notFound } from "next/navigation";

import { InterviewerAvatar, MentorAvatar } from "@/components/brand/AgentAvatar";
import Logo, { LogoMark, Wordmark } from "@/components/brand/Logo";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";

import ComponentsDemo from "./ComponentsDemo";
import Playground from "./Playground";
import RoomDemo from "./RoomDemo";

export const metadata = { title: "Design system" };

/**
 * The living style guide (Phase 7.1): every token and component, reviewed in the browser.
 * Development only: a 404 in any build that isn't `next dev`.
 */
const COLOURS = [
  { group: "Greys", items: [
    ["background", "#0a0a0b", "The page"],
    ["surface", "#121214", "Cards, panels"],
    ["raised", "#1a1a1d", "Raised cards, inputs on cards"],
    ["border", "#26262a", "Hairlines"],
    ["border-strong", "#34343a", "Key-caps, focus-adjacent edges"],
    ["subtle", "#6b6b72", "Decorative / disabled only (3.5:1)"],
    ["muted", "#8b8b92", "Secondary text (5.1:1 on raised)"],
    ["foreground", "#ededed", "Body text (14.8:1)"],
  ] },
  { group: "Accents (sparingly)", items: [
    ["primary", "#ff7a2e", "Brand orange, ARIA's lamp: actions, active item, focus, chart marks"],
    ["primary-soft", "#2a160d", "Orange tint behind selected items"],
    ["steel", "#7c93b5", "VERA's spotlight, 'AI at work' states"],
    ["steel-soft", "#161b24", "Steel tint"],
  ] },
  { group: "Status (reserved, always with an icon or label)", items: [
    ["success", "#4cc38a", "Strong answers, passed tests"],
    ["warning", "#f5d06a", "Weak answers, attention"],
    ["danger", "#e54d84", "Errors, failed tests"],
  ] },
];

const TYPE = [
  ["text-display", "Take the seat."],
  ["text-headline", "Your desk, Dev"],
  ["text-2xl font-semibold", "Interview report"],
  ["text-lg font-semibold", "What to fix next"],
  ["text-base", "VERA asks a question; you answer in your own words. ARIA turns every report into a plan."],
  ["text-sm text-muted", "Secondary text: hints, captions and timestamps."],
  ["font-mono text-sm", "O(n log n) · 7.8 / 10 · ⌘K"],
];

function Section({ title, children }) {
  return (
    <section className="space-y-5 border-t border-border pt-10">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function DesignPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <main className="mx-auto max-w-6xl space-y-12 px-6 py-12">
      <header className="space-y-3">
        <Logo />
        <h1 className="text-headline font-semibold">Design system</h1>
        <p className="max-w-2xl text-muted">
          Dark only. Black and greys carry the page; orange (the brand, and ARIA&apos;s lamp) and steel (VERA&apos;s spotlight)
          are used sparingly. Visible in development only.
        </p>
      </header>

      <Section title="Brand">
        <div className="flex flex-wrap items-end gap-10">
          <div className="space-y-2">
            <LogoMark className="size-16" title="InterviewOS" />
            <p className="text-xs text-muted">Mark · the chair under a light</p>
          </div>
          <div className="space-y-2">
            <Wordmark className="text-3xl" />
            <p className="text-xs text-muted">Wordmark</p>
          </div>
          <div className="space-y-2">
            <Logo />
            <p className="text-xs text-muted">Lockup</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-8">
          {[
            ["VERA", "Interviewer · the spotlight", InterviewerAvatar],
            ["ARIA", "Mentor · the desk lamp", MentorAvatar],
          ].map(([name, role, Avatar]) => (
            <div key={name} className="elevated flex items-center gap-4 rounded-xl px-4 py-3">
              <Avatar size="size-10" />
              <Avatar size="size-10" active />
              <div>
                <p className="font-semibold">{name}</p>
                <p className="text-xs text-muted">{role} · idle, then thinking</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Colour">
        {COLOURS.map(({ group, items }) => (
          <div key={group} className="space-y-3">
            <h3 className="text-sm font-medium text-muted">{group}</h3>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {items.map(([name, hex, role]) => (
                <li key={name} className="overflow-hidden rounded-xl border border-border bg-surface">
                  <div className="h-16 border-b border-border" style={{ background: `var(--${name})` }} />
                  <div className="space-y-0.5 p-3">
                    <p className="text-sm font-medium">{name}</p>
                    <p className="font-mono text-xs text-muted">{hex}</p>
                    <p className="text-xs text-muted">{role}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Section>

      <Section title="Type · Geist Sans and Geist Mono">
        <ul className="space-y-4">
          {TYPE.map(([cls, sample]) => (
            <li key={cls} className="grid gap-1 sm:grid-cols-[14rem_1fr] sm:items-baseline">
              <code className="font-mono text-xs text-muted">{cls}</code>
              <span className={cls}>{sample}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Start interview</Button>
          <Button variant="secondary">Open ARIA</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger">Delete</Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
        </div>
      </Section>

      <Section title="Badges, alerts, spinner">
        <div className="flex flex-wrap gap-2">
          <Badge>neutral</Badge>
          <Badge tone="primary">in progress</Badge>
          <Badge tone="success">strong</Badge>
          <Badge tone="warning">weak</Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Alert tone="info" title="Heads up">VERA saves your draft as you type.</Alert>
          <Alert tone="success" title="Report ready">Your report is on your desk.</Alert>
          <Alert tone="warning" title="Almost out of time">Two minutes left on this question.</Alert>
          <Alert tone="error" title="Couldn't connect">Check your connection and try again.</Alert>
        </div>
        <Spinner label="VERA is evaluating your answer…" />
      </Section>

      <Section title="Cards">
        <div className="grid gap-4 md:grid-cols-3">
          <Card title="Surface card" description="The default container.">Content</Card>
          <div className="elevated rounded-xl p-6">
            <p className="font-semibold">Raised</p>
            <p className="mt-1 text-sm text-muted">Border plus a faint top highlight: elevation without shadows.</p>
          </div>
          <div className="rounded-xl border border-primary/40 bg-primary-soft p-6">
            <p className="font-semibold text-primary">Under the lamp</p>
            <p className="mt-1 text-sm text-muted">The one thing to do next. Used once per screen at most.</p>
          </div>
        </div>
      </Section>

      <Section title="Components (7.3)">
        <ComponentsDemo />
      </Section>

      <Section title="Forms and charts">
        <Playground />
      </Section>

      <Section title="The interview room (3D) and motion">
        <p className="max-w-3xl text-sm text-muted">
          One scene for the whole site. Switch presets to watch the camera, the chair and the two lights move between
          them. On the desk preset, click a report sheet or the card under the lamp.
        </p>
        <RoomDemo />
      </Section>

      <Section title="Motion tokens">
        <ul className="grid gap-2 font-mono text-sm sm:grid-cols-2">
          <li>--duration-fast 150ms · hovers, presses</li>
          <li>--duration-base 250ms · reveals, toggles</li>
          <li>--duration-slow 400ms · panels, morphs</li>
          <li>--duration-scene 700ms · camera moves, page scenes</li>
          <li>--ease-out-expo · everything that arrives</li>
          <li>prefers-reduced-motion · all of it becomes instant</li>
        </ul>
      </Section>
    </main>
  );
}
