import { useState } from 'react';
import { UploadCloud, FileUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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
        variant: 'danger',
      });
      return;
    }

    const validFiles: File[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: `${file.name} is larger than ${MAX_FILE_SIZE_MB}MB and was not added.`,
          variant: 'danger',
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
        variant: 'success',
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
    e.target.value = '';
  };

  return (
    <div
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      className={`dropzone ${isDragging ? 'dragging' : ''}`}
    >
      <input
        id="file-upload-input"
        type="file"
        multiple
        className="d-none"
        onChange={handleFileSelect}
      />
      <label
        htmlFor="file-upload-input"
        className="d-flex flex-column align-items-center justify-content-center w-100 h-100 m-0"
        style={{ cursor: 'pointer' }}
      >
        <div className={`dropzone-icon ${isDragging ? 'pulse-animation' : ''}`}>
          {isDragging ? <FileUp size={36} style={{ width: 36, height: 36 }} /> : <UploadCloud size={36} style={{ width: 36, height: 36 }} />}
        </div>
        <h5 className="fw-bold mb-2">
          {isDragging ? 'Drop files here!' : 'Drag & drop files here'}
        </h5>
        <p className="text-muted mb-3">or click to browse from your device</p>
        <div className="d-flex gap-3 text-muted small">
          <span className="d-flex align-items-center gap-1">
            <span className="badge bg-secondary bg-opacity-10 text-secondary">
              Max {MAX_FILE_SIZE_MB}MB
            </span>
          </span>
          <span className="d-flex align-items-center gap-1">
            <span className="badge bg-secondary bg-opacity-10 text-secondary">
              Up to {MAX_FILES} files
            </span>
          </span>
        </div>
      </label>
    </div>
  );
}
