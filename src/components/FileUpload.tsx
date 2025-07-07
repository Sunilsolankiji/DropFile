"use client";

import { useState, useCallback } from 'react';
import { UploadCloud } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type FileUploadProps = {
  onUpload: (files: File[]) => void;
};

const MAX_FILES = 10;
const MAX_FILE_SIZE_MB = 100;

export default function FileUpload({ onUpload }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    if (files.length > MAX_FILES) {
      toast({
        title: 'Too many files',
        description: `You can upload a maximum of ${MAX_FILES} files at a time.`,
        variant: 'destructive',
      });
      return;
    }

    const validFiles: File[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: `${file.name} is larger than ${MAX_FILE_SIZE_MB}MB and was not added.`,
          variant: 'destructive',
        });
      } else {
        validFiles.push(file);
      }
    }

    if (validFiles.length > 0) {
      onUpload(validFiles);
      toast({
        title: 'Upload Started',
        description: `${validFiles.length} file(s) are being uploaded.`,
      });
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    e.target.value = ''; // Reset input to allow re-uploading the same file
  };

  return (
    <div
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      className={cn(
        "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-300",
        isDragging ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/70 hover:bg-secondary/50'
      )}
    >
      <input
        id="file-upload-input"
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />
      <label htmlFor="file-upload-input" className="cursor-pointer w-full h-full flex flex-col items-center justify-center">
        <UploadCloud className={cn("w-16 h-16 mb-4 transition-colors", isDragging ? 'text-primary' : 'text-muted-foreground')} />
        <h3 className="text-xl font-semibold">Drag & drop files here</h3>
        <p className="text-muted-foreground mt-1">or click to browse</p>
        <p className="text-xs text-muted-foreground mt-4">Max {MAX_FILE_SIZE_MB}MB per file</p>
      </label>
    </div>
  );
}
