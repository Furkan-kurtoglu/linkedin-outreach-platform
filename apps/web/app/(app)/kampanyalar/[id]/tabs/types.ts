import type { Campaign } from "@/lib/campaign";

export interface TabProps {
  campaign: Campaign;
  sp: Record<string, string | undefined>;
}
