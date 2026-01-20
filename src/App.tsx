import { Routes, Route, useParams } from 'react-router-dom'
import HomePage from './components/HomePage'
import RoomPage from './components/RoomPage'
import { Toaster } from './components/Toaster'

function RoomPageWrapper() {
  const { code } = useParams<{ code: string }>()
  return <RoomPage roomCode={code || ''} />
}

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/room/:code" element={<RoomPageWrapper />} />
      </Routes>
      <Toaster />
    </>
  )
}

export default App
