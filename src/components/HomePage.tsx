"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, BrainCircuit, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { generateAccessCode } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { suggestAccessCode } from '@/ai/flows/suggest-access-code';

export default function HomePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [joinCode, setJoinCode] = useState('');
  const [aiTopic, setAiTopic] = useState('');
  const [suggestedCode, setSuggestedCode] = useState('');
  const [isSuggesting, setIsSuggesting] = useState(false);

  const handleCreateRoom = (code: string) => {
    if (code) {
      router.push(`/room/${code.toUpperCase()}`);
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
      router.push(`/room/${joinCode.trim().toUpperCase()}`);
    } else {
      toast({
        title: 'Invalid Code',
        description: 'Please enter a valid access code.',
        variant: 'destructive'
      });
    }
  };

  const handleSuggestCode = async () => {
    if (!aiTopic.trim()) {
      toast({
        title: 'Topic Required',
        description: 'Please enter a topic to get a suggestion.',
        variant: 'destructive'
      });
      return;
    }
    setIsSuggesting(true);
    setSuggestedCode('');
    try {
      const result = await suggestAccessCode({ topic: aiTopic });
      if (result.accessCode) {
        setSuggestedCode(result.accessCode);
      } else {
        throw new Error('No code suggested');
      }
    } catch (error) {
      console.error('AI suggestion failed:', error);
      toast({
        title: 'Suggestion Failed',
        description: 'Could not get an AI suggestion. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsSuggesting(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
      <header className="text-center mb-8">
        <h1 className="text-5xl font-bold text-primary font-headline">DropCode</h1>
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
                <Label htmlFor="ai-topic">Get a memorable code with AI</Label>
                <Input
                  id="ai-topic"
                  placeholder="e.g., 'Q2 Project Brief'"
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  disabled={isSuggesting}
                />
                <Button onClick={handleSuggestCode} disabled={isSuggesting} className="w-full" variant="outline">
                  {isSuggesting ? <RefreshCw className="mr-2 animate-spin" /> : <BrainCircuit className="mr-2" />}
                  Suggest Code
                </Button>
              </div>
              {suggestedCode && (
                <div className="mt-4">
                  <p className="text-sm text-muted-foreground">Suggested Code:</p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-lg font-semibold text-accent font-code p-2 bg-accent/10 rounded-md flex-grow">{suggestedCode}</p>
                    <Button size="sm" onClick={() => handleCreateRoom(suggestedCode.replace(/\s+/g, '-'))}>Use Code</Button>
                  </div>
                </div>
              )}
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
        <p>&copy; {new Date().getFullYear()} DropCode. All rights reserved.</p>
      </footer>
    </div>
  );
}
