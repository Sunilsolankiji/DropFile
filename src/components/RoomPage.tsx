"use client";

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Copy, Users, Home, Loader2, Check } from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import FileList from '@/components/FileList';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useRoom } from '@/hooks/use-room';

type RoomPageProps = {
  roomCode: string;
};

export default function RoomPage({ roomCode }: RoomPageProps) {
  const { toast } = useToast();
  const { files, uploadFiles, deleteFile, loading, error } = useRoom(roomCode);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [hasCopied, setHasCopied] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = window.location.href;
      setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=128x128&data=${encodeURIComponent(url)}`);
    }
  }, []);
  
  useEffect(() => {
    if (error) {
      toast({
        title: "Error",
        description: error,
        variant: "destructive",
      });
    }
  }, [error, toast]);

  const handleCopy = () => {
    navigator.clipboard.writeText(roomCode);
    setHasCopied(true);
    toast({
      title: 'Copied!',
      description: 'Access code copied to clipboard.',
    });
    setTimeout(() => setHasCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex items-center justify-between p-4 border-b">
        <Link href="/" className="flex items-center gap-2">
          <Home className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold text-primary font-headline">DropCode</h1>
        </Link>
        <div className="flex items-center gap-2">
          <Users className="text-muted-foreground" />
          <span className="font-semibold text-lg">Room:</span>
          <div className="flex items-center gap-2 p-2 rounded-md bg-secondary">
            <span className="font-mono text-xl font-bold text-primary tracking-widest">{roomCode}</span>
            <Button variant="ghost" size="icon" onClick={handleCopy} className="w-8 h-8">
              {hasCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-grow p-4 md:p-6 lg:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <FileUpload onUpload={uploadFiles} />
            <div className="mt-8">
              <h2 className="text-2xl font-semibold mb-4">Shared Files</h2>
              {loading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="ml-2 text-muted-foreground">Loading files...</p>
                </div>
              ) : (
                <FileList files={files} onDelete={deleteFile} />
              )}
            </div>
          </div>
          
          <aside className="lg:col-span-1">
            <div className="bg-card p-6 rounded-lg shadow-sm border sticky top-8">
              <h3 className="text-lg font-semibold mb-4">Share this Room</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Others can join this room using the access code or by scanning the QR code.
              </p>
              {qrCodeUrl && (
                 <div className="flex justify-center">
                    <Image
                      src={qrCodeUrl}
                      alt="Room QR Code"
                      width={128}
                      height={128}
                      className="rounded-md"
                    />
                 </div>
              )}
              <div className="mt-4 text-center text-sm text-muted-foreground">
                <p>Files expire 15 minutes after upload.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
