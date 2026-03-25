import ParticleBackground from '@/components/common/ParticleBackground'
import TopNav from '@/components/layout/TopNav'
import ChatPanel from '@/components/chat/ChatPanel'
import Dashboard from '@/components/dashboard/Dashboard'
import { useSeedChat } from '@/hooks/useSeedChat'

export default function App() {
  useSeedChat()

  return (
    <>
      <ParticleBackground />
      <TopNav />
      <div className="relative z-10 grid grid-cols-[420px_1fr] h-[calc(100vh-64px)]">
        <ChatPanel />
        <Dashboard />
      </div>
    </>
  )
}
