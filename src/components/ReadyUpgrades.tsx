"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useHunterProgress } from "@/context/HunterProgressContext";
import { findReadyUpgrades, type ReadyUpgrade } from "@/lib/hunter-progress";
import Card from "@/components/Card";
import Icon from "@/components/Icon";
import styles from "@/styles/hunter.module.scss";

/** Weapon upgrades the loaded hunter can make right now from their equipment box, item box and zenny. */
export default function ReadyUpgrades() {
  const { active, owned, counts, zenny } = useHunterProgress();
  const [result, setResult] = useState<{ owned: Set<string>; upgrades: ReadyUpgrade[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!owned) return;
    let cancelled = false;
    setFailed(false);
    findReadyUpgrades(owned, counts, zenny).then(
      (upgrades) => !cancelled && setResult({ owned, upgrades }),
      () => !cancelled && setFailed(true)
    );
    return () => {
      cancelled = true;
    };
  }, [owned, counts, zenny]);

  if (!active) return null;

  const upgrades = result && result.owned === owned ? result.upgrades : null;
  let body: React.ReactNode;
  if (!counts || zenny === undefined) {
    body = <p className={styles["equipment-box__note"]}>Load your save again to check its item box.</p>;
  } else if (failed) {
    body = <p className={styles["equipment-box__note"]}>Couldn&apos;t load weapon data.</p>;
  } else if (!upgrades) {
    body = <p className={styles["equipment-box__note"]}>Checking…</p>;
  } else if (upgrades.length === 0) {
    body = (
      <p className={styles["equipment-box__note"]}>
        None yet: no owned weapon has an upgrade whose materials and zenny you have.
      </p>
    );
  } else {
    body = (
      <ul className={styles["equipment-box__list"]}>
        {upgrades.map((u) => (
          <li key={`${u.from.href}>${u.to.href}`}>
            <Link href={u.to.href} className={`list-row ${styles["equipment-box__row"]}`}>
              <Icon type={u.to.type} size="mini" rarity={u.to.rarity} />
              <span className={styles["equipment-box__name"]}>
                {u.to.name}
                <span className={styles["equipment-box__from"]}>from {u.from.name}</span>
              </span>
              <span className={styles["equipment-box__count"]}>{u.cost.toLocaleString()}z</span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Card className={styles["equipment-box"]}>
      <h2 className={styles["equipment-box__title"]}>
        Upgrades you can make now
        {upgrades && upgrades.length > 0 && <span className={styles["equipment-box__count"]}>{upgrades.length}</span>}
      </h2>
      {body}
    </Card>
  );
}
