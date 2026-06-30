import { Routes, Route } from 'react-router-dom'
import { ConfirmProvider } from './components/ui/ConfirmDialog'
import { NotificationProvider } from './components/notify/NotificationProvider'
import CloseConfirmDialog from './components/CloseConfirmDialog'
import MainLayout from './components/layout/MainLayout'
import GroupsPage from './pages/GroupsPage'
import StudentsPage from './pages/StudentsPage'
import DailyRegisterPage from './pages/DailyRegisterPage'
import StudentScoresPage from './pages/StudentScoresPage'
import HomeworkPage from './pages/HomeworkPage'
import AttendancePage from './pages/AttendancePage'
import LunchRestPage from './pages/LunchRestPage'
import DailyPracticePage from './pages/DailyPracticePage'
import SettingsPage from './pages/SettingsPage'
import DashboardPage from './pages/DashboardPage'
import CoinsPage from './pages/CoinsPage'
import MathHomeworkPage from './pages/MathHomeworkPage'
import NotifyPage from './pages/NotifyPage'
import MessageBoardPage from './pages/MessageBoardPage'
import AfterSchoolPage from './pages/AfterSchoolPage'
import ReflectionSignInPage from './pages/ReflectionSignInPage'
import CopyPunishmentSignInPage from './pages/CopyPunishmentSignInPage'
import GrowthRecordsPage from './pages/GrowthRecordsPage'
import DutyRotationPage from './pages/DutyRotationPage'
import DashboardWidgetPage from './pages/DashboardWidgetPage'
import TreePage from './pages/TreePage'
import ChineseClassPage from './pages/ChineseClassPage'
import DoubaoPage from './pages/DoubaoPage'

function App() {
  return (
    <NotificationProvider>
    <ConfirmProvider>
      <CloseConfirmDialog />
      <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="groups" element={<GroupsPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="daily-register" element={<DailyRegisterPage />} />
        <Route path="student-scores" element={<StudentScoresPage />} />
        <Route path="growth-records" element={<GrowthRecordsPage />} />
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
        <Route path="after-school" element={<AfterSchoolPage />} />
        <Route path="tree" element={<TreePage />} />
        <Route path="chinese-class" element={<ChineseClassPage />} />
        <Route path="doubao" element={<DoubaoPage />} />
      </Route>
      {/* 桌面便签看板（无侧边栏） */}
      <Route path="/dashboard-widget" element={<DashboardWidgetPage />} />
      {/* 小组团建学生签到（无侧边栏，LAN 端访问） */}
      <Route path="/reflection-signin" element={<ReflectionSignInPage />} />
      <Route path="/punishment-signin" element={<CopyPunishmentSignInPage />} />
    </Routes>
    </ConfirmProvider>
    </NotificationProvider>
  )
}

export default App
