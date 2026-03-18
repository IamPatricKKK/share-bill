import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import CreateGroup from './pages/CreateGroup'
import GroupOwner from './pages/GroupOwner'
import GroupMember from './pages/GroupMember'

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<CreateGroup />} />
          <Route path="/group/:groupId/owner" element={<GroupOwner />} />
          <Route path="/group/:groupId" element={<GroupMember />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
