"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SystemHealthCard } from "../../dashboard/_components/system-health-card";
import { OrganizationProfileView } from "./organization-profile-view";
import { PeopleView } from "./people-view";

/**
 * People first, deliberately.
 *
 * This page used to be two stacked cards — an industry dropdown, then
 * fourteen terminology inputs — and nothing at all about who is in the
 * organization. "Who else is here, and how do I add someone?" is by far
 * the most common reason to open an organization page, and it was the one
 * question the page could not answer; terminology, which most
 * organizations set once and never revisit, took up the whole screen
 * instead. Tabs put each on equal footing without making anyone scroll
 * past fourteen text fields to reach a colleague's name.
 */
export function OrganizationTabs({ isOwner }: { isOwner: boolean }) {
  return (
    <Tabs defaultValue="people">
      <TabsList>
        <TabsTrigger value="people">People</TabsTrigger>
        <TabsTrigger value="industry">Industry</TabsTrigger>
        <TabsTrigger value="terminology">Terminology</TabsTrigger>
        <TabsTrigger value="system">System</TabsTrigger>
      </TabsList>

      <TabsContent value="people">
        <PeopleView isOwner={isOwner} />
      </TabsContent>
      <TabsContent value="industry">
        <OrganizationProfileView isOwner={isOwner} section="industry" />
      </TabsContent>
      <TabsContent value="terminology">
        <OrganizationProfileView isOwner={isOwner} section="terminology" />
      </TabsContent>
      <TabsContent value="system">
        <SystemHealthCard />
      </TabsContent>
    </Tabs>
  );
}
