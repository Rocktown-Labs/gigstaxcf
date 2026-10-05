import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

interface AdminSubpageHeaderProps {
  description: string;
  title: string;
}

export function AdminSubpageHeader({
  description,
  title,
}: AdminSubpageHeaderProps) {
  return (
    <header className="space-y-3">
      <Button variant="ghost" asChild className="-ml-2 w-fit">
        <Link to="/dashboard/admin">
          <ArrowLeft className="h-4 w-4" />
          Back to Admin
        </Link>
      </Button>

      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-2">{description}</p>
      </div>
    </header>
  );
}
