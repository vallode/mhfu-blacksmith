import Link from "next/link";
import type { Metadata } from "next";
import OfflineSettings from "@/components/OfflineSettings";
import styles from "@/styles/options.module.scss";

export const metadata: Metadata = {
  title: "Options — MHFU Blacksmith",
};

export default function OptionsPage() {
  return (
    <div className={styles.page}>
      <Link className="blacksmith__title" href="/">
        <img src="/images/blacksmith.png" alt="Blacksmith" />
      </Link>

      <hr className="border" />

      <div className={styles.content}>
        <OfflineSettings />
      </div>
    </div>
  );
}
