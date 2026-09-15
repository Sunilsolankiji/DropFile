import { useRef, useState } from 'react';
import { Button } from 'react-bootstrap';
import { ArrowUpFromLine, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { MAX_FILE_SIZE } from '@/lib/transfer-types';
import { formatFileSize } from '@/lib/utils';

type FileUploadProps = {
  onUpload: (files: File[]) => Promise<void>;
  disabled?: boolean;
};

const MAX_FILES = 10;
const FILE_SIZE_LIMIT_LABEL = formatFileSize(MAX_FILE_SIZE);

export default function FileUpload({ onUpload, disabled = false }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [registering, setRegistering] = useState(false);
  const registrationPending = useRef(false);
  const dragDepth = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    if (registrationPending.current) {
      toast({ title: 'Adding your files', description: 'Wait for the selected files to appear before adding more.', variant: 'info' });
      return;
    }
    if (disabled) {
      toast({ title: 'Not connected yet', description: 'Wait for the room to connect before adding files.', variant: 'warning' });
      return;
    }
    if (files.length > MAX_FILES) {
      toast({ title: 'Too many files', description: `Choose up to ${MAX_FILES} files at a time.`, variant: 'danger' });
      return;
    }
    const validFiles = Array.from(files).filter(file => {
      if (file.size > MAX_FILE_SIZE) {
        toast({ title: 'File is too large', description: `${file.name} exceeds ${FILE_SIZE_LIMIT_LABEL} and was not added.`, variant: 'danger' });
        return false;
      }
      return true;
    });
    if (validFiles.length) {
      registrationPending.current = true;
      setRegistering(true);
      void onUpload(validFiles).finally(() => {
        registrationPending.current = false;
        setRegistering(false);
      });
    }
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
          <p id="upload-limits">Up to {MAX_FILES} files at a time. {FILE_SIZE_LIMIT_LABEL} per file.</p>
        </div>
        <Button variant="outline-secondary" onClick={() => fileInputRef.current?.click()} disabled={disabled || registering} aria-describedby="upload-limits" aria-busy={registering}>
          <Plus size={17} aria-hidden="true" /> {registering ? 'Adding…' : 'Choose files'}
        </Button>
      </div>
    </section>
  );
}
