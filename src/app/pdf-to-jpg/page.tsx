"use client";

import { useEffect, useRef, useState } from "react";
import ActionButton from "@/components/arc/action-button/action-button";
import Button from "@/components/arc/button/button";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
import FileDropzone, { formatFileSize } from "@/components/arc/file-dropzone/file-dropzone";
import type { FileDropzoneUpload } from "@/components/arc/file-dropzone/file-dropzone";
import { SiteHeader } from "@/components/site-header";
import {
  PdfToJpgDropzoneIcon,
  PdfFileBadgeIcon,
  JpgFileBadgeIcon,
} from "@/components/ui/convert-icons";
import { CheckCircle2, Download, Image as ImageIcon, Pencil, X } from "lucide-react";
import styles from "../home.module.css";

const MAX_PDF_SIZE = 100 * 1024 * 1024; // 100 MB

type ConvertedJpgPage = {
  pageNumber: number;
  dataUrl: string;
  blob: Blob;
  filename: string;
  size: number;
};

type ConversionResult = {
  id: string;
  filename: string;
  originalSize: number;
  pageCount: number;
  downloadUrl: string;
  pages: ConvertedJpgPage[];
};

export default function PdfToJpgPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [converting, setConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [qualityDpi, setQualityDpi] = useState<"standard" | "high">("high");

  // Keep track of object URLs to clean them up on unmount or reset
  const createdUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    return () => {
      createdUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      createdUrlsRef.current = [];
    };
  }, []);

  const uploadFile: FileDropzoneUpload = (item, { onProgress }) =>
    new Promise(async (resolve, reject) => {
      if (!item.file) {
        reject(new Error("The selected file could not be read."));
        return;
      }

      setConvertError(null);
      setConversionResult(null);

      const name = item.file.name.toLowerCase();
      const type = item.file.type.toLowerCase();
      const isValidPdf = name.endsWith(".pdf") || type === "application/pdf";

      if (!isValidPdf) {
        reject(new Error("Please upload a valid PDF document (.pdf)."));
        return;
      }

      onProgress(30);

      try {
        // Quick inspection of page count using pdfjs-dist
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const arrayBuf = await item.file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuf }).promise;
        setPageCount(pdf.numPages);
      } catch {
        setPageCount(null);
      }

      setSelectedFile(item.file);
      onProgress(100);
      resolve();
    });

  const removeDoc = () => {
    setSelectedFile(null);
    setPageCount(null);
    setConvertError(null);
    setConversionResult(null);
    createdUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    createdUrlsRef.current = [];
  };

  const handleConvert = async () => {
    if (!selectedFile || converting) return;
    setConverting(true);
    setConvertError(null);
    setConversionProgress(10);

    try {
      // 1. Submit to API to register transient document for workspace editing
      const formData = new FormData();
      formData.append("file", selectedFile);

      const apiPromise = fetch("/api/documents/pdf-to-jpg", {
        method: "POST",
        body: formData,
      });

      // 2. Concurrently render PDF pages to high-resolution JPGs in the browser
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const arrayBuf = await selectedFile.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuf }).promise;
      const totalPages = pdf.numPages;

      const scale = qualityDpi === "high" ? 2.0 : 1.5; // High resolution rendering
      const convertedPages: ConvertedJpgPage[] = [];
      const baseName = selectedFile.name.replace(/\.pdf$/i, "") || "document";

      // Render each page to an offscreen canvas and export as JPEG
      for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) continue;

        // Fill white background for JPEG rendering (PDFs may have transparent canvas backgrounds)
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
          canvas,
          canvasContext: ctx,
          viewport,
        }).promise;

        const blob = await new Promise<Blob | null>((res) =>
          canvas.toBlob((b) => res(b), "image/jpeg", 0.94),
        );

        if (blob) {
          const url = URL.createObjectURL(blob);
          createdUrlsRef.current.push(url);

          convertedPages.push({
            pageNumber: i,
            dataUrl: url,
            blob,
            filename: `${baseName}-page-${i}.jpg`,
            size: blob.size,
          });
        }

        const progressPercent = Math.min(90, Math.floor(10 + (i / totalPages) * 80));
        setConversionProgress(progressPercent);
      }

      const response = await apiPromise;
      let apiData = { id: crypto.randomUUID() };
      if (response.ok) {
        apiData = await response.json();
      }

      setConversionProgress(100);
      setConversionResult({
        id: apiData.id,
        filename: selectedFile.name,
        originalSize: selectedFile.size,
        pageCount: convertedPages.length,
        downloadUrl: `/api/documents/${apiData.id}/file?download=1`,
        pages: convertedPages,
      });

      setIsDialogOpen(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "PDF to JPG conversion failed.";
      setConvertError(message);
    } finally {
      setConverting(false);
      setConversionProgress(0);
    }
  };

  const handleReset = () => {
    setIsDialogOpen(false);
    setSelectedFile(null);
    setPageCount(null);
    setConversionResult(null);
    setConvertError(null);
    createdUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    createdUrlsRef.current = [];
  };

  const downloadSinglePage = (page: ConvertedJpgPage) => {
    const link = document.createElement("a");
    link.href = page.dataUrl;
    link.download = page.filename;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
  };

  const downloadAllPages = () => {
    if (!conversionResult || conversionResult.pages.length === 0) return;

    conversionResult.pages.forEach((page, index) => {
      setTimeout(() => {
        downloadSinglePage(page);
      }, index * 250);
    });
  };

  return (
    <div className="relative min-h-screen flex flex-col bg-background text-foreground transition-colors">
      {/* Top Center Navbar with Theme Switcher at Top-Right */}
      <SiteHeader />

      {/* Main Section */}
      <main className="flex-1 flex flex-col items-center justify-start pt-8 sm:pt-12 pb-16 px-4">
        {/* Heading Section Above Dropzone */}
        <div className="text-center max-w-xl mx-auto mb-6 space-y-2">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-foreground">
            PDF to JPG
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-lg mx-auto leading-relaxed">
            Convert PDF pages to high-quality JPG images in seconds.
          </p>
        </div>

        {/* Center File Dropzone with PDF to JPG Icon */}
        <div className={styles.uploader}>
          <FileDropzone
            className={styles.dropzone}
            borderless
            accept="application/pdf,.pdf"
            multiple={false}
            maxFiles={1}
            maxSize={MAX_PDF_SIZE}
            icon={<PdfToJpgDropzoneIcon className="w-16 h-16 sm:w-20 sm:h-20" />}
            label="Drop your PDF file here"
            description="or click to browse from your device"
            note="PDF only · Up to 100 MB"
            dropLabel="Release to convert PDF to JPG"
            onUpload={uploadFile}
            onFilesChange={(files) => {
              if (files.length === 0) {
                setSelectedFile(null);
                setPageCount(null);
                setConvertError(null);
                setConversionResult(null);
              }
            }}
          />

          {convertError && (
            <div className="mt-4 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm text-center">
              {convertError}
            </div>
          )}

          {/* Selected PDF Document Preview and Action Area */}
          {selectedFile && (
            <div className="mt-5 space-y-4">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <ImageIcon className="size-3.5 text-amber-500" />
                  <span>
                    PDF ready to convert {pageCount ? `(${pageCount} ${pageCount === 1 ? "page" : "pages"})` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  Clear
                </button>
              </div>

              {/* PDF Document Card */}
              <div className="relative group flex items-center gap-3 p-3 rounded-xl bg-card border border-border/80 shadow-xs">
                <PdfFileBadgeIcon className="size-11 shrink-0" />
                <div className="min-w-0 flex-1 pr-6">
                  <p className="text-sm font-semibold truncate text-foreground" title={selectedFile.name}>
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(selectedFile.size)} ·{" "}
                    {pageCount ? `${pageCount} ${pageCount === 1 ? "page" : "pages"}` : "PDF Document"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={removeDoc}
                  className="absolute top-2.5 right-2.5 size-6 flex items-center justify-center rounded-full bg-muted/80 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer"
                  title="Remove document"
                >
                  <X className="size-3.5" />
                </button>
              </div>

              {/* Quality Selector */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/40 border border-border/50 text-xs">
                <span className="font-medium text-muted-foreground">Image Quality:</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setQualityDpi("standard")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      qualityDpi === "standard"
                        ? "bg-background text-foreground shadow-xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Standard (150 DPI)
                  </button>
                  <button
                    type="button"
                    onClick={() => setQualityDpi("high")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      qualityDpi === "high"
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    High (300 DPI)
                  </button>
                </div>
              </div>

              {/* Action Button */}
              <div className={styles.processAction}>
                <ActionButton
                  label="Convert to JPG"
                  pendingLabel={
                    conversionProgress > 0
                      ? `Converting (${conversionProgress}%)...`
                      : "Extracting Images..."
                  }
                  successLabel="Converted"
                  onAction={handleConvert}
                />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Result Dialog Modal Popup */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent
          title="PDF Converted to JPG"
          description="Your JPG images are ready to download."
          className="sm:max-w-[480px]"
        >
          {conversionResult && (
            <div className="space-y-4 pt-1">
              {/* Summary Status pill */}
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs">
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="size-3.5" />
                  Status
                </span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  Successfully Converted ({conversionResult.pages.length}{" "}
                  {conversionResult.pages.length === 1 ? "image" : "images"})
                </span>
              </div>

              {/* Summary Card with JpgFileBadgeIcon */}
              <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card/60">
                <JpgFileBadgeIcon className="size-11 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate text-foreground">
                    {conversionResult.filename.replace(/\.pdf$/i, "")}.jpg
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {conversionResult.pages.length} {conversionResult.pages.length === 1 ? "page converted" : "pages converted"}
                  </p>
                </div>
              </div>

              {/* Converted JPG Pages Gallery */}
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-0.5">
                  Extracted Pages ({conversionResult.pages.length})
                </p>
                <div className="max-h-60 overflow-y-auto space-y-2 pr-1 rounded-xl">
                  {conversionResult.pages.map((page) => (
                    <div
                      key={page.pageNumber}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-border bg-card/70 hover:bg-card transition-colors"
                    >
                      {/* Image Thumbnail and Details */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="relative size-12 rounded-lg overflow-hidden border border-border bg-muted/40 shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={page.dataUrl}
                            alt={`Page ${page.pageNumber}`}
                            className="size-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold truncate text-foreground" title={page.filename}>
                            {page.filename}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Page {page.pageNumber} · {formatFileSize(page.size)}
                          </p>
                        </div>
                      </div>

                      {/* Download Single JPG Button */}
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-8 px-2.5 text-xs font-medium gap-1.5 shrink-0 rounded-lg cursor-pointer"
                        onClick={() => downloadSinglePage(page)}
                        title={`Download Page ${page.pageNumber}`}
                      >
                        <Download className="size-3.5" />
                        <span>JPG</span>
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Download All and Workspace Action Buttons */}
              <div className="flex flex-col gap-2 pt-1 border-t border-border/50">
                <Button
                  type="button"
                  variant="primary"
                  className="w-full h-11 justify-center gap-2 text-sm font-semibold rounded-xl cursor-pointer bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={downloadAllPages}
                >
                  <Download className="size-4" />
                  Download All JPGs ({conversionResult.pages.length})
                </Button>
                <a
                  href={`/documents/${conversionResult.id}`}
                  className="w-full"
                >
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full h-9 justify-center gap-2 text-xs font-medium rounded-xl"
                  >
                    <Pencil className="size-3.5" />
                    Edit PDF in Workspace
                  </Button>
                </a>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full h-9 justify-center text-xs text-muted-foreground hover:text-foreground rounded-xl"
                  onClick={handleReset}
                >
                  Convert Another PDF
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
