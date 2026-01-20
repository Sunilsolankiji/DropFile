import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { generateAccessCode } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export default function HomePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [joinCode, setJoinCode] = useState('');
  const [customCode, setCustomCode] = useState('');

  const handleCreateRoom = (code: string) => {
    if (code) {
      navigate(`/room/${code.toUpperCase()}`);
    } else {
      toast({
        title: 'Error',
        description: 'Could not create a room. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.trim()) {
      navigate(`/room/${joinCode.trim().toUpperCase()}`);
    } else {
      toast({
        title: 'Invalid Code',
        description: 'Please enter a valid access code.',
        variant: 'destructive'
      });
    }
  };

  const handleCreateWithCustomCode = () => {
    if (customCode.trim()) {
      handleCreateRoom(customCode.trim().replace(/\s+/g, '-'));
    } else {
      toast({
        title: 'Code Required',
        description: 'Please enter a custom code.',
        variant: 'destructive'
      });
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
      <header className="text-center mb-8">
        <h1 className="text-5xl font-bold text-primary font-headline">DropFile</h1>
        <p className="text-muted-foreground mt-2">Instant file sharing via access code.</p>
      </header>

      <Card className="w-full max-w-2xl shadow-lg">
        <CardContent className="p-0">
          <div className="grid md:grid-cols-2">
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-2">Create a Space</h2>
              <p className="text-sm text-muted-foreground mb-4">Start a new sharing session.</p>
              <Button onClick={() => handleCreateRoom(generateAccessCode())} className="w-full mb-4 bg-primary hover:bg-primary/90">
                <Sparkles className="mr-2" /> Create Instant Space
              </Button>
              <Separator className="my-4" />
              <div className="space-y-2">
                <Label htmlFor="custom-code">Or use a custom code</Label>
                <Input
                  id="custom-code"
                  placeholder="e.g., 'MY-PROJECT'"
                  value={customCode}
                  onChange={(e) => setCustomCode(e.target.value)}
                />
                <Button onClick={handleCreateWithCustomCode} className="w-full" variant="outline">
                  Create with Custom Code
                </Button>
              </div>
            </div>

            <div className="p-6 bg-secondary/30 rounded-r-lg">
              <form onSubmit={handleJoinRoom}>
                <h2 className="text-xl font-semibold mb-2">Join a Space</h2>
                <p className="text-sm text-muted-foreground mb-4">Enter an access code to join.</p>
                <div className="space-y-2">
                  <Label htmlFor="join-code">Access Code</Label>
                  <Input
                    id="join-code"
                    placeholder="e.g., AB12CD"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    className="font-mono uppercase tracking-widest"
                  />
                  <Button type="submit" className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
                    <ArrowRight className="mr-2" /> Join Space
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </CardContent>
      </Card>

      <footer className="mt-8 text-center text-sm text-muted-foreground">
        <p>Files are temporary and automatically deleted after 15 minutes.</p>
        <p>&copy; {new Date().getFullYear()} DropFile. All rights reserved.</p>
        <p className="mt-2">
          <a
            href="https://github.com/Sunilsolankiji/DropFile"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-primary transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}
