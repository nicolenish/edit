import { Routes, Route } from 'react-router-dom'
import Nav from './components/Nav'
import WhatsNew from './features/whatsnew/WhatsNew'
import Almanac from './features/almanac/Almanac'
import BrandDetail from './features/brand/BrandDetail'
import Boards from './features/boards/Boards'
import Diary from './features/diary/Diary'

export default function App() {
  return (
    <div style={{ position: 'relative', background: '#fff', minHeight: '100vh' }}>
      <Nav />
      <Routes>
        <Route path="/" element={<WhatsNew />} />
        <Route path="/almanac" element={<Almanac />} />
        <Route path="/brand/:key" element={<BrandDetail />} />
        <Route path="/boards" element={<Boards />} />
        <Route path="/diary" element={<Diary />} />
      </Routes>
    </div>
  )
}
