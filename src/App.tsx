import { Routes, Route } from 'react-router-dom'
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
import DeductionsPage from './pages/DeductionsPage'
import SettingsPage from './pages/SettingsPage'
import DashboardPage from './pages/DashboardPage'
import CoinsPage from './pages/CoinsPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="groups" element={<GroupsPage />} />
        <Route path="score-calc" element={<GroupsPage />} />
        <Route path="score-history" element={<GroupsPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="daily-register" element={<DailyRegisterPage />} />
        <Route path="student-scores" element={<StudentScoresPage />} />
        <Route path="deductions" element={<DeductionsPage />} />
        <Route path="duty" element={<DutyPage />} />
        <Route path="homework" element={<HomeworkPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="lunch-rest" element={<LunchRestPage />} />
        <Route path="daily-practice" element={<DailyPracticePage />} />
        <Route path="coins" element={<CoinsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}

export default App
