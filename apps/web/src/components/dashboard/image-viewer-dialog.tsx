import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ImageViewerDialogProps {
  alt: string;
  imageUrl: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title?: string;
}

export const ImageViewerDialog = ({
  alt,
  imageUrl,
  onOpenChange,
  open,
  title = "Attached image",
}: ImageViewerDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="w-[calc(100%-2.5rem)] max-w-sm overflow-hidden rounded-2xl p-0 shadow-2xl sm:max-w-md">
      <div className="flex min-h-0 w-full flex-col">
        <DialogHeader className="border-border/50 bg-background/95 border-b px-4 py-3 pr-14 backdrop-blur-sm sm:px-5">
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[min(72vh,900px)] overflow-y-auto overscroll-y-contain p-3 [-webkit-overflow-scrolling:touch] sm:max-h-[78vh] sm:p-4">
          <div className="flex justify-center">
            <img
              src={imageUrl}
              alt={alt}
              width={1440}
              height={2560}
              className="border-border/50 bg-muted/20 h-auto w-full rounded-xl border object-contain shadow-sm"
            />
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
);
