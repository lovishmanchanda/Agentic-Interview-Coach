"use client";

import { useState } from "react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Dialog from "@/components/ui/Dialog";
import EmptyState from "@/components/ui/EmptyState";
import IconButton from "@/components/ui/IconButton";
import * as Icons from "@/components/ui/icons";
import Kbd from "@/components/ui/Kbd";
import ProgressRing from "@/components/ui/ProgressRing";
import Skeleton, { SkeletonText } from "@/components/ui/Skeleton";
import SpotlightCard from "@/components/ui/SpotlightCard";
import StatTile from "@/components/ui/StatTile";
import Tabs from "@/components/ui/Tabs";
import Tooltip from "@/components/ui/Tooltip";
import { toast } from "@/store/toastStore";

/** The 7.3 component library on /design, each in its states. */
export default function ComponentsDemo() {
  const [tab, setTab] = useState("practice");
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-10">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Interviews" value={7} note="since September" />
        <StatTile label="Latest score" value={7.4} decimals={1} suffix="/ 10" delta={0.9} />
        <StatTile label="Streak" value={4} suffix="days" />
        <StatTile label="Weakest topic" value="System design" delta={-0.4} note="4.6 last time" />
      </div>

      <div className="flex flex-wrap items-center gap-8">
        <ProgressRing value={7.4} caption="out of 10" size="size-32" />
        <ProgressRing value={4.6} tone="warning" size="size-24" />
        <ProgressRing value={8.8} tone="success" size="size-20" />
        <div className="flex flex-wrap gap-2">
          <Badge>neutral</Badge><Badge tone="primary">in progress</Badge><Badge tone="success">strong</Badge>
          <Badge tone="warning">weak</Badge><Badge tone="steel">VERA</Badge>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Tabs label="Interview mode" tabs={[{ value: "practice", label: "Practice" }, { value: "serious", label: "Serious" }, { value: "drill", label: "Drill" }]}
          value={tab} onChange={setTab} />
        <Tooltip content="Search everything"><IconButton label="Search"><Icons.SearchIcon /></IconButton></Tooltip>
        <IconButton label="Sign out" size="sm"><Icons.LogoutIcon className="size-4" /></IconButton>
        <span className="flex items-center gap-1 text-sm text-muted">Quick actions <Kbd>⌘</Kbd><Kbd>K</Kbd></span>
        <Button variant="secondary" onClick={() => setOpen(true)}>Open dialog</Button>
        <Button variant="secondary" onClick={() => toast.success("Your report is on your desk.", { title: "Report ready" })}>Toast: success</Button>
        <Button variant="ghost" onClick={() => toast.error("Couldn't reach the server. Try again.")}>Toast: error</Button>
      </div>

      <div className="flex flex-wrap gap-3 text-muted">
        {Object.entries(Icons).map(([name, Icon]) => (
          <Tooltip key={name} content={name.replace("Icon", "")}>
            <span tabIndex={0} className="flex size-10 items-center justify-center rounded-lg border border-border"><Icon /></span>
          </Tooltip>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Surface card" description="The everyday container.">Content</Card>
        <Card variant="raised" title="Raised card" description="A step brighter.">Content</Card>
        <Card variant="lamp" title="Under the lamp" description="The one next thing to do.">
          <Button size="sm">Drill system design</Button>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SpotlightCard glow="primary" innerClassName="p-6"><p className="font-medium">Spotlight card</p><p className="mt-1 text-sm text-muted">Move the pointer over me.</p></SpotlightCard>
        <div className="space-y-3 rounded-2xl border border-border p-6">
          <Skeleton className="h-6 w-1/3" />
          <SkeletonText lines={3} />
        </div>
      </div>

      <EmptyState icon={Icons.DeskIcon} title="Your desk is empty" body="Take your first interview. Its report lands here."
        action={<Button size="sm">Take the seat</Button>} />

      <Dialog open={open} onClose={() => setOpen(false)} title="Leave the interview?" description="VERA keeps your place. You can resume from your desk."
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Stay</Button><Button onClick={() => setOpen(false)}>Leave</Button></>} />
    </div>
  );
}
