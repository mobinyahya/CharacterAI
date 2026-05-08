"use client";

import * as React from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Gavel, MessageCircle, Pencil, Trash2 } from "lucide-react";
import { truncate } from "@/lib/utils";

interface LibraryCardProps {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  tags?: string[];
  href: string;
  editHref: string;
  startHref?: string;
  /** Optional second action — opens the eval runner for this entry. */
  evaluateHref?: string;
  onDelete: () => void;
}

export function LibraryCard({
  name,
  description,
  avatarUrl,
  tags,
  href,
  editHref,
  startHref,
  evaluateHref,
  onDelete,
}: LibraryCardProps) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  return (
    <>
      <Card className="group flex flex-col gap-4 p-5 transition-colors hover:border-primary/40">
        <Link href={href} className="flex items-start gap-3">
          <Avatar src={avatarUrl} name={name} size={48} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold">{name}</h3>
            {description && (
              <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
                {truncate(description, 220)}
              </p>
            )}
          </div>
        </Link>

        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.slice(0, 6).map((t) => (
              <Badge key={t} variant="muted" className="text-[10px]">
                {t}
              </Badge>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-2">
          <div className="flex flex-1 items-center gap-1.5">
            {startHref && (
              <Link href={startHref} className="flex-1">
                <Button size="sm" className="w-full">
                  <MessageCircle className="h-3.5 w-3.5" />
                  Chat
                </Button>
              </Link>
            )}
            {evaluateHref && (
              <Link
                href={evaluateHref}
                className={startHref ? undefined : "flex-1"}
              >
                <Button
                  size="sm"
                  variant="outline"
                  className={startHref ? "" : "w-full"}
                  title="Run an evaluation against this character — static (card audit) or dynamic (chat + judge)"
                >
                  <Gavel className="h-3.5 w-3.5" />
                  Evaluate
                </Button>
              </Link>
            )}
            {!startHref && !evaluateHref && <span className="flex-1" />}
          </div>
          <div className="flex items-center gap-1">
            <Link href={editHref}>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                aria-label="Edit"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </Link>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmOpen(true)}
              aria-label="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Delete "${name}"?`}
        description="This is permanent. Sessions tied to this entry will also be removed."
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onDelete();
              setConfirmOpen(false);
            }}
          >
            Delete
          </Button>
        </div>
      </Dialog>
    </>
  );
}
