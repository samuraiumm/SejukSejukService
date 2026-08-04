import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import DashboardLayout from './components/DashboardLayout'
import RequireRole from './components/RequireRole'
import Login from './pages/Login'
import NewOrder from './pages/admin/NewOrder'
import OrdersList from './pages/admin/OrdersList'
import Technicians from './pages/admin/Technicians'
import OrderDetail from './pages/admin/OrderDetail'
import Schedule from './pages/admin/Schedule'
import AuditLog from './pages/admin/AuditLog'
import JobList from './pages/technician/JobList'
import JobComplete from './pages/technician/JobComplete'
import ReviewQueue from './pages/manager/ReviewQueue'
import Dashboard from './pages/manager/Dashboard'
import AiQuery from './pages/manager/AiQuery'

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Login />} />

        <Route
          path="/technician/jobs"
          element={
            <RequireRole role="technician">
              <JobList />
            </RequireRole>
          }
        />
        <Route
          path="/technician/jobs/:id"
          element={
            <RequireRole role="technician">
              <JobComplete />
            </RequireRole>
          }
        />
      </Route>

      <Route element={<DashboardLayout />}>
        <Route
          path="/admin/orders"
          element={
            <RequireRole role="admin">
              <OrdersList />
            </RequireRole>
          }
        />
        <Route
          path="/admin/new-order"
          element={
            <RequireRole role="admin">
              <NewOrder />
            </RequireRole>
          }
        />
        <Route
          path="/admin/technicians"
          element={
            <RequireRole role="admin">
              <Technicians />
            </RequireRole>
          }
        />
        <Route
          path="/admin/orders/:id"
          element={
            <RequireRole role="admin">
              <OrderDetail />
            </RequireRole>
          }
        />
        <Route
          path="/admin/schedule"
          element={
            <RequireRole role="admin">
              <Schedule />
            </RequireRole>
          }
        />
        <Route
          path="/admin/audit-log"
          element={
            <RequireRole role="admin">
              <AuditLog />
            </RequireRole>
          }
        />

        <Route
          path="/manager/review"
          element={
            <RequireRole role="manager">
              <ReviewQueue />
            </RequireRole>
          }
        />
        <Route
          path="/manager/dashboard"
          element={
            <RequireRole role="manager">
              <Dashboard />
            </RequireRole>
          }
        />
        <Route
          path="/manager/ai"
          element={
            <RequireRole role="manager">
              <AiQuery />
            </RequireRole>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
