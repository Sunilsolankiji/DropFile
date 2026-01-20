import { Routes, Route, useParams } from 'react-router-dom'
import HomePage from './components/HomePage'
import RoomPage from './components/RoomPage'
import { Toaster } from './components/ui/toaster'

function RoomPageWrapper() {
  const { code } = useParams<{ code: string }>()
  return <RoomPage roomCode={code || ''} />
}

function App() {
  return (
    <>
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/room/:code" element={<RoomPageWrapper />} />
        </Routes>
      </main>
      <Toaster />
    </>
  )
}

export default App
