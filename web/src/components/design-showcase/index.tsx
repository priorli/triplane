import { ColorShowcase } from "./color-showcase";
import { TypographyShowcase } from "./typography-showcase";
import { RadiusShowcase } from "./radius-showcase";
import { ComponentShowcase } from "./component-showcase";

export { ColorShowcase, TypographyShowcase, RadiusShowcase, ComponentShowcase };

export function DesignShowcase() {
  return (
    <div className="space-y-10">
      <ColorShowcase />
      <TypographyShowcase />
      <RadiusShowcase />
      <ComponentShowcase />
    </div>
  );
}
