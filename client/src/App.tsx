import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import AvatarPreview from './components/AvatarPreview';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
const Lobby=lazy(()=>import('./pages/Lobby/Lobby'));
const CreateGame=lazy(()=>import('./pages/CreateGame/CreateGame'));
const GameDetail=lazy(()=>import('./pages/GameDetail/GameDetail'));
const Leaderboard=lazy(()=>import('./pages/Leaderboard/Leaderboard'));
const Notifications=lazy(()=>import('./pages/Notifications/Notifications'));
const Profile=lazy(()=>import('./pages/Profile/Profile'));
const Feedback=lazy(()=>import('./pages/Feedback/Feedback'));
const Admin=lazy(()=>import('./pages/Admin/Admin'));
import Login from './pages/Login/Login';
import { useSocketConnection } from './hooks/useSocket';
import { useAuthStore } from './stores/authStore';
import { StoreProvider, useStore } from './features/motion/lib/store';
import { HeartRateProvider } from './features/motion/hooks/useHeartRateMonitor';
import { Home } from './features/motion/pages/Home';
import './features/gym/gym.css';
const TrainingSchedule=lazy(()=>import("./features/gym/Schedule"));
const TrainingSettings=lazy(()=>import("./features/gym/Schedule").then(m=>({default:m.TrainingSettings})));
const FreeWorkout=lazy(()=>import('./features/gym/FreeWorkout'));
const PlanHub=lazy(()=>import('./features/gym/PlanHub'));
const PlanEditor=lazy(()=>import('./features/gym/PlanEditor'));
const PlanWorkout=lazy(()=>import('./features/gym/PlanWorkout'));
const ExerciseLibrary=lazy(()=>import('./features/gym/Library'));
const Analytics=lazy(()=>import('./features/gym/GymTools').then(m=>({default:m.Analytics})));
const BodyRecords=lazy(()=>import('./features/gym/GymTools').then(m=>({default:m.BodyRecords})));
const WorkoutRecords=lazy(()=>import('./features/gym/GymTools').then(m=>({default:m.WorkoutRecords})));
const DataManagement=lazy(()=>import('./features/gym/GymTools').then(m=>({default:m.DataManagement})));
const Training=lazy(()=>import('./features/motion/Training'));
const History=lazy(()=>import('./features/motion/History'));
const Avatar=lazy(()=>import('./features/motion/pages/Avatar').then(m=>({default:m.Avatar})));
const Inventory=lazy(()=>import('./features/motion/pages/Inventory').then(m=>({default:m.Inventory})));
function MotionView({children}:{children:React.ReactNode}){const {loaded,loading,error}=useStore();return <div className="motion-view">{loaded?<>{error&&<p className="gym-error" role="status">{error}</p>}{children}</>:<div className="motion-loading">{loading?'正在读取你的运动数据…':'运动数据尚未读取，请重试。'}</div>}</div>;}
function MotionHome(){const navigate=useNavigate();return <MotionView><Home start={()=>navigate('/train')}/></MotionView>;}
function MotionAvatar(){const navigate=useNavigate();return <MotionView><Avatar inventory={()=>navigate('/inventory')}/></MotionView>;}
function Pages(){return <BrowserRouter><ErrorBoundary><AvatarPreview/><Suspense fallback={<div className="motion-loading">正在加载…</div>}><Routes>
  <Route path="/login" element={<Login/>}/>
  <Route path="/" element={<ProtectedRoute><Layout/></ProtectedRoute>}>
    <Route index element={<MotionHome/>}/><Route path="train" element={<div className="motion-view"><Training/></div>}/>
    <Route path="train/schedule" element={<div className="motion-view"><TrainingSchedule/></div>}/><Route path="train/settings" element={<div className="motion-view"><TrainingSettings/></div>}/>
    <Route path="train/free" element={<div className="motion-view"><FreeWorkout/></div>}/>
    <Route path="train/plans" element={<div className="motion-view"><PlanHub/></div>}/>
    <Route path="train/plans/:planId/edit" element={<div className="motion-view"><PlanEditor/></div>}/>
    <Route path="train/workout/:workoutId" element={<div className="motion-view"><PlanWorkout/></div>}/>
    <Route path="train/library" element={<div className="motion-view"><ExerciseLibrary/></div>}/>
    <Route path="train/stats" element={<div className="motion-view"><Analytics/></div>}/>
    <Route path="train/body" element={<div className="motion-view"><BodyRecords/></div>}/>
    <Route path="train/records" element={<div className="motion-view"><WorkoutRecords/></div>}/>
    <Route path="train/data" element={<div className="motion-view"><DataManagement/></div>}/>
    <Route path="groups" element={<Lobby/>}/><Route path="create" element={<CreateGame/>}/><Route path="game/:id" element={<GameDetail/>}/>
    <Route path="notifications" element={<Notifications/>}/><Route path="profile" element={<Profile/>}/>
    <Route path="leaderboard" element={<Leaderboard/>}/><Route path="history" element={<MotionView><History/></MotionView>}/>
    <Route path="avatar" element={<MotionAvatar/>}/><Route path="inventory" element={<MotionView><Inventory/></MotionView>}/><Route path="feedback" element={<Feedback/>}/>
    <Route path="admin" element={<Admin/>}/>
  </Route><Route path="*" element={<Navigate to="/" replace/>}/>
</Routes></Suspense></ErrorBoundary></BrowserRouter>;}
export default function App(){useSocketConnection();const user=useAuthStore(s=>s.user);return <div className="motion-app">{user?<StoreProvider key={user.id}><HeartRateProvider><Pages/></HeartRateProvider></StoreProvider>:<Pages/>}</div>;}
