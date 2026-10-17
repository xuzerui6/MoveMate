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
function MotionView({children}:{children:React.ReactNode}){const {loaded,loading}=useStore();return <div className="motion-view">{loaded?children:<div className="motion-loading">{loading?'正在读取你的运动数据…':'运动数据尚未读取，请重试。'}</div>}</div>;}
function MotionHome(){const navigate=useNavigate();return <MotionView><Home start={()=>navigate('/train')}/></MotionView>;}
function MotionAvatar(){const navigate=useNavigate();return <MotionView><Avatar inventory={()=>navigate('/inventory')}/></MotionView>;}
function Pages(){return <BrowserRouter><ErrorBoundary><AvatarPreview/><Suspense fallback={<div className="motion-loading">正在加载…</div>}><Routes>
  <Route path="/login" element={<Login/>}/>
  <Route path="/" element={<ProtectedRoute><Layout/></ProtectedRoute>}>
    <Route index element={<MotionHome/>}/><Route path="train" element={<MotionView><Training/></MotionView>}/>
    <Route path="train/plans" element={<MotionView><PlanHub/></MotionView>}/>
    <Route path="train/plans/:planId/edit" element={<MotionView><PlanEditor/></MotionView>}/>
    <Route path="train/workout/:workoutId" element={<MotionView><PlanWorkout/></MotionView>}/>
    <Route path="train/library" element={<MotionView><ExerciseLibrary/></MotionView>}/>
    <Route path="train/stats" element={<MotionView><Analytics/></MotionView>}/>
    <Route path="train/body" element={<MotionView><BodyRecords/></MotionView>}/>
    <Route path="train/records" element={<MotionView><WorkoutRecords/></MotionView>}/>
    <Route path="train/data" element={<MotionView><DataManagement/></MotionView>}/>
    <Route path="groups" element={<Lobby/>}/><Route path="create" element={<CreateGame/>}/><Route path="game/:id" element={<GameDetail/>}/>
    <Route path="notifications" element={<Notifications/>}/><Route path="profile" element={<Profile/>}/>
    <Route path="leaderboard" element={<Leaderboard/>}/><Route path="history" element={<MotionView><History/></MotionView>}/>
    <Route path="avatar" element={<MotionAvatar/>}/><Route path="inventory" element={<MotionView><Inventory/></MotionView>}/><Route path="feedback" element={<Feedback/>}/>
    <Route path="admin" element={<Admin/>}/>
  </Route><Route path="*" element={<Navigate to="/" replace/>}/>
</Routes></Suspense></ErrorBoundary></BrowserRouter>;}
export default function App(){useSocketConnection();const user=useAuthStore(s=>s.user);return <div className="motion-app">{user?<StoreProvider key={user.id}><HeartRateProvider><Pages/></HeartRateProvider></StoreProvider>:<Pages/>}</div>;}
