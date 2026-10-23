import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { useTheme } from "@/hooks/useTheme";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={theme === "day" ? "Switch to night drive theme" : "Switch to day theme"}
      title={theme === "day" ? "Night drive" : "Day"}
    >
      {theme === "day" ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
    </Button>
  );
}
