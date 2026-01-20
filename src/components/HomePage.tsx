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
      </footer>
    </div>
  );
}
