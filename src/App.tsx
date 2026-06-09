import { Routes, Route } from 'react-router-dom'
import { ConfirmProvider } from './components/ui/ConfirmDialog'
import { NotificationProvider } from './components/notify/NotificationProvider'
import MainLayout from './components/layout/MainLayout'
import GroupsPage from './pages/GroupsPage'
import StudentsPage from './pages/StudentsPage'
import DailyRegisterPage from './pages/DailyRegisterPage'
import StudentScoresPage from './pages/StudentScoresPage'
import HomeworkPage from './pages/HomeworkPage'
import AttendancePage from './pages/AttendancePage'
import LunchRestPage from './pages/LunchRestPage'
import DailyPracticePage from './pages/DailyPracticePage'
import DutyPage from './pages/DutyPage'
import SettingsPage from './pages/SettingsPage'
import DashboardPage from './pages/DashboardPage'
import CoinsPage from './pages/CoinsPage'
import MathHomeworkPage from './pages/MathHomeworkPage'
import NotifyPage from './pages/NotifyPage'
import MessageBoardPage from './pages/MessageBoardPage'
import GrowthRecordsPage from './pages/GrowthRecordsPage'
import DutyRotationPage from './pages/DutyRotationPage'
import DashboardWidgetPage from './pages/DashboardWidgetPage'

function App() {
  return (
    <NotificationProvider>
    <ConfirmProvider>
      <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="groups" element={<GroupsPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="daily-register" element={<DailyRegisterPage />} />
        <Route path="student-scores" element={<StudentScoresPage />} />
        <Route path="growth-records" element={<GrowthRecordsPage />} />
        <Route path="duty" element={<DutyPage />} />
        <Route path="homework" element={<HomeworkPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="lunch-rest" element={<LunchRestPage />} />
        <Route path="daily-practice" element={<DailyPracticePage />} />
        <Route path="coins" element={<CoinsPage />} />
        <Route path="math-homework" element={<MathHomeworkPage />} />
        <Route path="duty-rotation" element={<DutyRotationPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="notify" element={<NotifyPage />} />
        <Route path="message-board" element={<MessageBoardPage />} />
      </Route>
      {/* 桌面便签看板（无侧边栏） */}
      <Route path="/dashboard-widget" element={<DashboardWidgetPage />} />
    </Routes>
    </ConfirmProvider>
    </NotificationProvider>
  )
}

export default App
