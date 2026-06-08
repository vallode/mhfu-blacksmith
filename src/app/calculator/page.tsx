import Link from "next/link";
import type { Metadata } from "next";
import Calculator from "@/components/Calculator";

export const metadata: Metadata = {
  title: "Calculator — MHFU Blacksmith",
};

export default function CalculatorPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <Link className="blacksmith__title" href="/">
        <img src="/images/blacksmith.png" alt="Blacksmith" />
      </Link>
      <hr className="border" style={{ width: "100%" }} />
      <Calculator />
    </div>
  );
}
