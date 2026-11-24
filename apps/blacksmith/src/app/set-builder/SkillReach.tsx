"use client";

/**
 * The "Skills within reach" sheet's content: the skills that can be added to
 * the wanted ones, or the wanted ones raised to, with at least one set still
 * activating them all (lib/skill-reach.ts, checked by hooks/useSkillReach.ts).
 * Listed like the skills sheet (SkillBrowser): choosing one changes the
 * wanted skills, and the list is checked again for them, the trees not yet
 * checked again dimmed.
 */
import { useMemo } from "react";
import Loading from "@/components/Loading";
import { useT } from "@/context/LanguageContext";
import type { SkillReachState } from "@/hooks/useSkillReach";
import * as ui from "@/styles/settings";
import { SkillBrowser, type SkillOption } from "./SkillPicker";

export default function SkillReach({
  reach,
  skills,
  value,
  onChange,
}: {
  reach: SkillReachState;
  /** Every skill that can be chosen. */
  skills: SkillOption[];
  /** The wanted skills, by name. */
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const text = useT().setBuilder.reach;
  const { options, pending } = useMemo(() => {
    const byName = new Map(skills.map((s) => [s.name, s]));
    const options: SkillOption[] = [];
    const pending = new Set<string>();
    for (const t of reach.trees) {
      if (t.pending) pending.add(t.tree);
      // The tree's wanted level first, so choosing a stronger one replaces it.
      const chosen = value.find((v) => byName.get(v)?.tree === t.tree);
      for (const name of chosen ? [chosen, ...t.skills] : t.skills) {
        const s = byName.get(name);
        if (s && !options.includes(s)) options.push(s);
      }
    }
    return { options, pending };
  }, [reach.trees, skills, value]);

  let status: React.ReactNode = null;
  if (reach.error) status = <p className={ui.error}>{text.failed}</p>;
  else if (reach.checking)
    status = <Loading className={ui.note}>{text.checking(reach.checked, reach.total)}</Loading>;
  else if (reach.base === "none") status = <p className={ui.note}>{text.noBase}</p>;
  else if (reach.base === "unsure") status = <p className={ui.note}>{text.unsureBase}</p>;
  else if (reach.base === "ok" && options.length === 0)
    status = <p className={ui.note}>{text.nothingMore}</p>;
  else if (reach.trees.some((t) => t.unsure)) status = <p className={ui.note}>{text.unsure}</p>;

  return (
    <div className="flex flex-col gap-[1.2rem]">
      <p className={ui.note}>{text.note(value.length > 0)}</p>
      {status}
      {options.length > 0 && (
        <SkillBrowser skills={options} value={value} onChange={onChange} pending={pending} />
      )}
    </div>
  );
}
