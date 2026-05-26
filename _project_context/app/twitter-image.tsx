import OpenGraphImage from "./opengraph-image";

export const runtime = "edge";

export const alt = "SkillEdge AI — Premium AI Trading Workspace";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function TwitterImage() {
  return OpenGraphImage();
}