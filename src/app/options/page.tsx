import Link from "next/link";
import type { Metadata } from "next";
import OfflineSettings from "@/components/OfflineSettings";
import SaveSyncSettings from "@/components/SaveSyncSettings";
import styles from "@/styles/options.module.scss";
import BorderRule from "@/components/BorderRule";

export const metadata: Metadata = {
  title: "Options — MHFU Blacksmith",
};

export default function OptionsPage() {
  return (
    <div className={styles.page}>
      <Link className="blacksmith__title" href="/">
        <img src="/images/blacksmith.png" alt="Blacksmith" />
      </Link>

      <BorderRule />

      <div className={styles.content}>
        <SaveSyncSettings />
        <OfflineSettings />
      </div>
    </div>
  );
}
