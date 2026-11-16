import { star } from "@kummie/brand";
import Svg, { Path } from "react-native-svg";

/**
 * The brand polygon rotated −20° around the centre, computed once. A plain path renders the same on
 * Android, iOS and web (react-native-svg transforms behave differently on web).
 */
const ROTATED_PATH = (() => {
  const angle = (star.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const points = [...star.path.matchAll(/(\d+(?:\.\d+)?) (\d+(?:\.\d+)?)/g)].map((m) => {
    const x = Number(m[1]) - 50;
    const y = Number(m[2]) - 50;
    return `${(50 + x * cos - y * sin).toFixed(2)} ${(50 + x * sin + y * cos).toFixed(2)}`;
  });
  return `M${points.join(" L")} Z`;
})();

/** The KUMMIE star: rotated −20°, never outlined, pink / glow / white only. */
export function Star({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d={ROTATED_PATH} fill={color} />
    </Svg>
  );
}
