import "@fontsource/titan-one/400.css";
import { cn } from "@/lib/utils";

interface GigStaxLogoProps {
  className?: string;
  showDot?: boolean;
}

const TITAN_ONE_FONT_STACK = '"Titan One", sans-serif';

export function GigStaxLogo({ className, showDot = true }: GigStaxLogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {showDot ? <span className="bg-primary/80 h-3 w-3 rounded-full" /> : null}
      <span
        className="text-foreground leading-none tracking-tight"
        style={{ fontFamily: TITAN_ONE_FONT_STACK }}
      >
        Gig<span className="text-[#39D000]">Stax</span>
      </span>
    </span>
  );
}
