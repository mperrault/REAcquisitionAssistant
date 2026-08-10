import * as React from "react";

import { cn } from "@/lib/utils";

function Separator({
  className,
  decorative = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { decorative?: boolean }) {
  return (
    <div
      role={decorative ? "none" : "separator"}
      className={cn("h-px w-full bg-border", className)}
      {...props}
    />
  );
}

export { Separator };
