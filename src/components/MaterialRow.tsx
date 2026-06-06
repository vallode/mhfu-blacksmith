import Icon from "./Icon";
import type { Material } from "@/lib/types";

interface MaterialRowProps {
  material: Material;
}

export default function MaterialRow({ material }: MaterialRowProps) {
  return (
    <div className="material">
      <Icon type={material.type} color={material.color} />
      <p>
        {material.name}: {material.amount}
      </p>
    </div>
  );
}
