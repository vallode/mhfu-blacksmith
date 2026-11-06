import { cn } from "@/lib/cn";
import styles from "./BorderRule.module.scss";

interface BorderRuleProps {
  className?: string;
}

/** Decorative tiled horizontal divider shown under page headers. */
export default function BorderRule({ className }: BorderRuleProps) {
  return <hr className={cn(styles.rule, className)} />;
}
