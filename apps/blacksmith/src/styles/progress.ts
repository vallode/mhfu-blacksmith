/** Thin framed progress bar for <progress>: dark track, green fill. */
export const progressBar = [
  "h-[0.8rem] w-full appearance-none border border-hr bg-black/45",
  "[&::-webkit-progress-bar]:bg-black/45 [&::-webkit-progress-value]:bg-accent [&::-moz-progress-bar]:bg-accent",
].join(" ");
