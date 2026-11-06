import styles from "@/styles/sharpness.module.scss";

interface SharpnessBarProps {
  values: (string | number)[];
  plus?: boolean;
}

export default function SharpnessBar({ values, plus }: SharpnessBarProps) {
  const className = plus ? styles["sharpness-plus"] : styles.sharpness;
  const title = plus ? "Sharpness +1" : "Sharpness";

  return (
    <div className={className} title={title} tabIndex={plus ? 1 : 0}>
      {values.map((v, i) => (
        <span
          key={i}
          style={{
            backgroundColor: `var(--color-sharpness-${i + 1})`,
            width: `${Number(v) * 4}px`,
          }}
        />
      ))}
    </div>
  );
}
