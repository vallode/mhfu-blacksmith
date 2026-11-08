import Card from "@/components/Card";
import * as ui from "@/styles/settings";

/**
 * A card on the Options page, styled after the game's Options menu: the teal
 * frame, and the title in yellow on the grey selector bar.
 */
export default function SettingsCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card frame="teal" className={ui.section}>
      <div className={ui.menuHeader}>
        <h2 className={ui.menuTitle}>{title}</h2>
      </div>
      {children}
    </Card>
  );
}
