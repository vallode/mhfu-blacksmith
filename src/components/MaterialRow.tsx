import Icon from "./Icon";
import type { Material } from "@/lib/types";

interface MaterialRowProps {
  material: Material;
}

export default function MaterialRow({ material }: MaterialRowProps) {
  return (
    <div className="material">
      <Icon type={material.type} color={material.color} />
      <p className="material-name">{material.name}:</p>
      <p className="material-amount">{material.amount}</p>
    </div>
  );
}
