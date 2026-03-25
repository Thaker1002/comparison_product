import React, { useCallback, useState, useRef, useEffect } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import {
  Upload,
  X,
  ImageIcon,
  Camera,
  Sparkles,
  FileImage,
  AlertCircle,
  CheckCircle2,
  ZoomIn,
} from "lucide-react";
import {
  cn,
  fileToDataUrl,
  formatFileSize,
  parseProductName,
  isImageFile,
} from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { UploadedImage } from "@/types";

interface ImageUploadProps {
  onImageChange: (image: UploadedImage | null) => void;
  onProductNameExtracted?: (name: string) => void;
  currentImage: UploadedImage | null;
  className?: string;
  disabled?: boolean;
}

const ACCEPTED_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "image/bmp": [".bmp"],
  "image/tiff": [".tiff", ".tif"],
};

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export function ImageUpload({
  onImageChange,
  onProductNameExtracted,
  currentImage,
  className,
  disabled = false,
}: ImageUploadProps) {
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);

      if (!isImageFile(file)) {
        setError("Please upload an image file (JPG, PNG, WebP, GIF, BMP)");
        return;
      }

      if (file.size > MAX_SIZE) {
        setError(`File too large. Maximum size is ${formatFileSize(MAX_SIZE)}`);
        return;
      }

      setIsProcessing(true);
      try {
        const preview = await fileToDataUrl(file);
        const uploadedImage: UploadedImage = {
          file,
          preview,
          name: file.name,
        };
        onImageChange(uploadedImage);

        // Extract product name from filename
        const extractedName = parseProductName(file.name);
        if (
          extractedName &&
          extractedName.length > 2 &&
          onProductNameExtracted
        ) {
          onProductNameExtracted(extractedName);
        }
      } catch {
        setError("Failed to process image. Please try again.");
      } finally {
        setIsProcessing(false);
      }
    },
    [onImageChange, onProductNameExtracted],
  );

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      setDragOver(false);

      if (rejectedFiles.length > 0) {
        const firstError = rejectedFiles[0]?.errors[0];
        if (firstError?.message?.includes("size")) {
          setError(
            `File too large. Maximum size is ${formatFileSize(MAX_SIZE)}`,
          );
        } else if (
          firstError?.message?.includes("type") ||
          firstError?.code === "file-invalid-type"
        ) {
          setError("Invalid file type. Please upload JPG, PNG, WebP, or GIF");
        } else {
          setError(firstError?.message || "File upload failed");
        }
        return;
      }

      if (acceptedFiles.length > 0) {
        handleFile(acceptedFiles[0]);
      }
    },
    [handleFile],
  );

  const { getRootProps, getInputProps, isDragActive, inputRef: dropzoneInputRef } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_SIZE,
    maxFiles: 1,
    multiple: false,
    disabled: disabled || isProcessing,
    onDragEnter: () => setDragOver(true),
    onDragLeave: () => setDragOver(false),
  });

  // Keep our local ref in sync with the dropzone's internal ref
  useEffect(() => {
    if (dropzoneInputRef.current) {
      (fileInputRef as React.MutableRefObject<HTMLInputElement | null>).current = dropzoneInputRef.current;
    }
  }, [dropzoneInputRef]);

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onImageChange(null);
    setError(null);
    setIsZoomed(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData.items);
      const imageItem = items.find((item) => item.type.startsWith("image/"));
      if (imageItem) {
        const file = imageItem.getAsFile();
        if (file) {
          handleFile(new File([file], "pasted-image.png", { type: file.type }));
        }
      }
    },
    [handleFile],
  );

  const isActive = isDragActive || dragOver;

  // ── Image Preview State ───────────────────────────────────────────────────
  if (currentImage) {
    return (
      <div className={cn("relative", className)}>
        {/* Preview container */}
        <div
          className={cn(
            "relative group rounded-2xl overflow-hidden border border-border transition-all duration-300",
            "bg-secondary/30",
            isZoomed ? "h-80" : "h-56",
          )}
        >
          {/* Image */}
          <img
            src={currentImage.preview}
            alt={currentImage.name}
            className={cn(
              "w-full h-full transition-all duration-500",
              isZoomed ? "object-contain" : "object-cover",
            )}
          />

          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          {/* Top controls */}
          <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            {/* Zoom toggle */}
            <button
              onClick={() => setIsZoomed(!isZoomed)}
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-lg",
                "glass border border-white/20 text-white",
                "hover:bg-white/20 transition-colors duration-200",
                "backdrop-blur-sm",
              )}
              title={isZoomed ? "Fit view" : "Zoom in"}
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            {/* Remove button */}
            <button
              onClick={handleRemove}
              disabled={disabled}
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-lg",
                "bg-red-500/80 border border-red-400/30 text-white",
                "hover:bg-red-500 transition-colors duration-200",
                "backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed",
              )}
              title="Remove image"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Bottom info bar */}
          <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
            <div className="glass rounded-xl px-3 py-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileImage className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-xs text-foreground truncate font-medium">
                  {currentImage.name}
                </span>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {formatFileSize(currentImage.file.size)}
              </span>
            </div>
          </div>

          {/* Success indicator */}
          <div className="absolute top-3 left-3">
            <div className="flex items-center gap-1.5 glass rounded-full px-2.5 py-1 border border-emerald-500/30">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span className="text-xs text-emerald-400 font-medium">
                Image ready
              </span>
            </div>
          </div>
        </div>

        {/* Change image button */}
        <div className="mt-3 flex gap-2">
          <div {...getRootProps()} className="flex-1">
            <input {...getInputProps()} />
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 text-muted-foreground hover:text-foreground border-dashed"
              disabled={disabled || isProcessing}
            >
              <Camera className="w-3.5 h-3.5" />
              Change Image
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            disabled={disabled}
            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  // ── Drop Zone State ────────────────────────────────────────────────────────
  return (
    <div className={cn("relative", className)}>
      <div
        {...getRootProps()}
        onPaste={handlePaste}
        tabIndex={0}
        className={cn(
          "relative flex flex-col items-center justify-center",
          "min-h-[220px] rounded-2xl border-2 border-dashed",
          "cursor-pointer select-none outline-none",
          "transition-all duration-300 ease-out",
          // Default state
          !isActive &&
            !error && [
              "border-border/60 bg-secondary/20",
              "hover:border-primary/40 hover:bg-secondary/40",
            ],
          // Active drag state
          isActive && [
            "border-primary bg-primary/5 scale-[1.01]",
            "shadow-[0_0_0_4px_rgba(99,102,241,0.1),inset_0_0_40px_rgba(99,102,241,0.05)]",
          ],
          // Error state
          error && "border-destructive/50 bg-destructive/5",
          // Disabled state
          (disabled || isProcessing) && "opacity-60 cursor-not-allowed",
          className,
        )}
      >
        <input {...getInputProps()} />

        {/* Background decoration */}
        <div
          className={cn(
            "absolute inset-0 rounded-2xl overflow-hidden pointer-events-none",
            "transition-opacity duration-300",
            isActive ? "opacity-100" : "opacity-0",
          )}
        >
          {/* Animated corner decorations */}
          {[
            "top-0 left-0",
            "top-0 right-0",
            "bottom-0 left-0",
            "bottom-0 right-0",
          ].map((pos, i) => (
            <div
              key={i}
              className={cn(
                "absolute w-6 h-6 border-primary",
                pos,
                i === 0 && "border-t-2 border-l-2 rounded-tl-2xl",
                i === 1 && "border-t-2 border-r-2 rounded-tr-2xl",
                i === 2 && "border-b-2 border-l-2 rounded-bl-2xl",
                i === 3 && "border-b-2 border-r-2 rounded-br-2xl",
              )}
            />
          ))}
        </div>

        {/* Content */}
        <div className="flex flex-col items-center gap-4 p-6 text-center">
          {isProcessing ? (
            /* Processing state */
            <div className="flex flex-col items-center gap-3">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-2xl bg-primary/10 animate-pulse" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  Processing image…
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Preparing your product photo
                </p>
              </div>
            </div>
          ) : isActive ? (
            /* Drag active state */
            <div className="flex flex-col items-center gap-3 animate-bounce-in">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center border border-primary/30">
                  <Upload className="w-7 h-7 text-primary animate-float" />
                </div>
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center animate-bounce">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
              </div>
              <div>
                <p className="text-base font-semibold text-primary">
                  Drop it here!
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Release to upload your product image
                </p>
              </div>
            </div>
          ) : error ? (
            /* Error state */
            <div className="flex flex-col items-center gap-3 animate-fade-in">
              <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center border border-destructive/30">
                <AlertCircle className="w-7 h-7 text-destructive" />
              </div>
              <div>
                <p className="text-sm font-semibold text-destructive">
                  Upload Failed
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">
                  {error}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={(e) => {
                  e.stopPropagation();
                  setError(null);
                }}
              >
                Try Again
              </Button>
            </div>
          ) : (
            /* Default state */
            <div className="flex flex-col items-center gap-4 animate-fade-in">
              {/* Icon cluster */}
              <div className="relative">
                {/* Outer ring */}
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center border border-primary/20 transition-all duration-300 group-hover:scale-105">
                  <ImageIcon className="w-8 h-8 text-primary/70" />
                </div>
                {/* Floating camera icon */}
                <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-xl bg-secondary border border-border flex items-center justify-center shadow-lg">
                  <Camera className="w-4 h-4 text-muted-foreground" />
                </div>
                {/* Sparkle accent */}
                <div className="absolute -top-2 -left-2 w-6 h-6 rounded-lg bg-accent/20 border border-accent/30 flex items-center justify-center">
                  <Sparkles className="w-3 h-3 text-accent" />
                </div>
              </div>

              {/* Text */}
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-foreground">
                  Drop product image here
                </p>
                <p className="text-xs text-muted-foreground">
                  or{" "}
                  <span className="text-primary font-medium underline underline-offset-2 cursor-pointer">
                    browse files
                  </span>{" "}
                  · paste from clipboard
                </p>
              </div>

              {/* Format badges */}
              <div className="flex items-center gap-1.5 flex-wrap justify-center">
                {["JPG", "PNG", "WebP", "GIF"].map((fmt) => (
                  <Badge
                    key={fmt}
                    variant="secondary"
                    className="text-[10px] px-2 py-0.5 font-medium rounded-md border-border/50"
                  >
                    {fmt}
                  </Badge>
                ))}
                <span className="text-[10px] text-muted-foreground">
                  · max 10MB
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Shimmer overlay when active */}
        {isActive && (
          <div
            className="absolute inset-0 rounded-2xl pointer-events-none overflow-hidden"
            aria-hidden
          >
            <div
              className="absolute inset-0 opacity-20"
              style={{
                background:
                  "linear-gradient(105deg, transparent 40%, rgba(99,102,241,0.4) 50%, transparent 60%)",
                backgroundSize: "200% 200%",
                animation: "shimmer 1.5s linear infinite",
              }}
            />
          </div>
        )}
      </div>

      {/* Tip below the dropzone */}
      {!currentImage && !error && (
        <p className="mt-2.5 text-center text-[11px] text-muted-foreground/60 flex items-center justify-center gap-1">
          <Sparkles className="w-3 h-3" />
          Upload a product photo to auto-fill the search query
        </p>
      )}
    </div>
  );
}
