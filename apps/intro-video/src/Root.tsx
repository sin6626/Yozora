import { Composition } from "remotion";
import { Page1, page1Frames } from "./Page1";

export const FPS = 30;

export function Root() {
  return (
    <Composition id="Page1" component={Page1} durationInFrames={page1Frames} fps={FPS} width={1080} height={1920} />
  );
}
