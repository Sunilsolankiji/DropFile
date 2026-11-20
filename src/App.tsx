import { Routes, Route, useParams } from 'react-router-dom'
import HomePage from './components/HomePage'
import RoomPage from './components/RoomPage'
import NearbyPage from './components/NearbyPage'
import { Toaster } from './components/Toaster'

function RoomPageWrapper() {
  const { code } = useParams<{ code: string }>()
  return <RoomPage key={code} roomCode={code || ''} />
}

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/nearby" element={<NearbyPage />} />
        <Route path="/room/:code" element={<RoomPageWrapper />} />
      </Routes>
      <Toaster />
    </>
  )
}

export default App
