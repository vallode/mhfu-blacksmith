import Link from "next/link";
import type { Metadata } from "next";
import SaveUpload from "@/components/SaveUpload";
import styles from "@/styles/hunter.module.scss";

export const metadata: Metadata = {
  title: "Hunter Profile — MHFU Blacksmith",
};

export default function HunterPage() {
  return (
    <div className={styles["hunter-page"]}>
      <Link className="blacksmith__title" href="/">
        <img src="/images/blacksmith.png" alt="Blacksmith" />
      </Link>

      <hr className="border" />

      <SaveUpload />
    </div>
  );
}
