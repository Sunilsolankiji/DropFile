import RoomPage from '@/components/RoomPage';

type RoomProps = {
  params: {
    code: string;
  };
};

export default function Room({ params }: RoomProps) {
  return <RoomPage roomCode={params.code} />;
}
