import Link from "next/link";
import type { TabProps } from "../types";
import { AutonomySection } from "./Autonomy";
import { DangerSection } from "./Danger";
import { GeneralSection } from "./General";
import { IntegrationSection } from "./Integration";
import { LearningSection } from "./Learning";
import { SendingSection } from "./Sending";
import { OptionsTab } from "../Options";
import { TargetingTab } from "../Targeting";

export const SECTIONS = [
  ["genel", "Genel"],
  ["gonderim", "Gönderim"],
  ["hedefleme", "Hedefleme"],
  ["ozerklik", "Özerklik"],
  ["secenekler", "Seçenekler"],
  ["ogrenme", "Öğrenme"],
  ["entegrasyon", "Entegrasyon"],
  ["tehlike", "Tehlikeli alan"],
] as const;
export type Section = (typeof SECTIONS)[number][0];

export async function SettingsTab({ campaign: c, sp, section }: TabProps & { section: Section }) {
  return (
    <div className="sub-layout">
      <nav className="subnav" aria-label="Kampanya ayarları">
        {SECTIONS.map(([k, l]) => (
          <Link key={k} href={`/kampanyalar/${c.id}?sekme=ayarlar&bolum=${k}`} aria-current={section === k ? "page" : undefined} className={k === "tehlike" ? "danger" : undefined}>
            {l}
          </Link>
        ))}
      </nav>
      <div style={{ minWidth: 0 }}>
        {section === "genel" && <GeneralSection campaign={c} sp={sp} />}
        {section === "gonderim" && <SendingSection campaign={c} sp={sp} />}
        {section === "hedefleme" && <TargetingTab campaign={c} sp={sp} />}
        {section === "ozerklik" && <AutonomySection campaign={c} sp={sp} />}
        {section === "secenekler" && <OptionsTab campaign={c} sp={sp} />}
        {section === "ogrenme" && <LearningSection campaign={c} sp={sp} />}
        {section === "entegrasyon" && <IntegrationSection campaign={c} sp={sp} />}
        {section === "tehlike" && <DangerSection campaign={c} sp={sp} />}
      </div>
    </div>
  );
}
