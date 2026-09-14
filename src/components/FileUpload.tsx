import { useRef, useState } from 'react';
import { Button } from 'react-bootstrap';
import { ArrowUpFromLine, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type FileUploadProps = {
  onUpload: (files: File[]) => Promise<void>;
  disabled?: boolean;
};

const MAX_FILES = 10;
const MAX_FILE_SIZE_MB = 100;

export default function FileUpload({ onUpload, disabled = false }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    if (disabled) {
      toast({ title: 'Not connected yet', description: 'Wait for the room to connect before adding files.', variant: 'warning' });
      return;
    }
    if (files.length > MAX_FILES) {
      toast({ title: 'Too many files', description: `Choose up to ${MAX_FILES} files at a time.`, variant: 'danger' });
      return;
    }
    const validFiles = Array.from(files).filter(file => {
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        toast({ title: 'File is too large', description: `${file.name} exceeds ${MAX_FILE_SIZE_MB} MB and was not added.`, variant: 'danger' });
        return false;
      }
      return true;
    });
    if (validFiles.length) void onUpload(validFiles);
  };

  return (
    <section
      className={`dropzone${isDragging && !disabled ? ' dragging' : ''}${disabled ? ' is-disabled' : ''}`}
      aria-labelledby="upload-title"
      onDragEnter={(event) => {
        event.preventDefault();
        if (!event.dataTransfer.types.includes('Files')) return;
        dragDepth.current += 1;
        setIsDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setIsDragging(false);
        handleFiles(event.dataTransfer.files);
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        disabled={disabled}
        aria-label="Choose files to share"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <div className="dropzone-content">
        <span className="dropzone-icon"><ArrowUpFromLine size={24} aria-hidden="true" /></span>
        <div className="dropzone-copy">
          <h2 id="upload-title">{isDragging && !disabled ? 'Let go to share your files' : 'Drop files here to share'}</h2>
          <p id="upload-limits">Up to {MAX_FILES} files at a time. {MAX_FILE_SIZE_MB} MB per file.</p>
        </div>
        <Button variant="outline-secondary" onClick={() => fileInputRef.current?.click()} disabled={disabled} aria-describedby="upload-limits">
          <Plus size={17} aria-hidden="true" /> Choose files
        </Button>
      </div>
    </section>
  );
}
