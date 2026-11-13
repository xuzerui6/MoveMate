import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import RouteErrorBoundary from './components/RouteErrorBoundary';
import { lazyWithRetry } from './components/lazyWithRetry';
import AvatarPreview from './components/AvatarPreview';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
const Lobby=lazyWithRetry(()=>import('./pages/Lobby/Lobby'));
const CreateGame=lazyWithRetry(()=>import('./pages/CreateGame/CreateGame'));
const GameDetail=lazyWithRetry(()=>import('./pages/GameDetail/GameDetail'));
const BossFight=lazyWithRetry(()=>import('./pages/BossFight/BossFight'));
const BossAtlas=lazyWithRetry(()=>import('./pages/BossAtlas/BossAtlas'));
const Leaderboard=lazyWithRetry(()=>import('./pages/Leaderboard/Leaderboard'));
const Notifications=lazyWithRetry(()=>import('./pages/Notifications/Notifications'));
const Friends=lazyWithRetry(()=>import('./pages/Friends/Friends'));
const InviteFriend=lazyWithRetry(()=>import('./pages/InviteFriend/InviteFriend'));
const GameSummary=lazyWithRetry(()=>import('./pages/GameSummary/GameSummary'));
const Profile=lazyWithRetry(()=>import('./pages/Profile/Profile'));
const Feedback=lazyWithRetry(()=>import('./pages/Feedback/Feedback'));
const Admin=lazyWithRetry(()=>import('./pages/Admin/Admin'));
import Login from './pages/Login/Login';
import { useSocketConnection } from './hooks/useSocket';
import { useAuthStore } from './stores/authStore';
import { StoreProvider, useStore } from './features/motion/lib/store';
import { HeartRateProvider } from './features/motion/hooks/useHeartRateMonitor';
import { Home } from './features/motion/pages/Home';
import './features/gym/gym.css';
import './features/motion/motion.css';
const TrainingSchedule=lazyWithRetry(()=>import("./features/gym/Schedule"));
const TrainingSettings=lazyWithRetry(()=>import("./features/gym/Schedule").then(m=>({default:m.TrainingSettings})));
const FreeWorkout=lazyWithRetry(()=>import('./features/gym/FreeWorkout'));
const PlanHub=lazyWithRetry(()=>import('./features/gym/PlanHub'));
const PlanEditor=lazyWithRetry(()=>import('./features/gym/PlanEditor'));
const PlanWorkout=lazyWithRetry(()=>import('./features/gym/PlanWorkout'));
const ExerciseLibrary=lazyWithRetry(()=>import('./features/gym/Library'));
const Analytics=lazyWithRetry(()=>import('./features/gym/GymTools').then(m=>({default:m.Analytics})));
const BodyRecords=lazyWithRetry(()=>import('./features/gym/GymTools').then(m=>({default:m.BodyRecords})));
const WorkoutRecords=lazyWithRetry(()=>import('./features/gym/GymTools').then(m=>({default:m.WorkoutRecords})));
const DataManagement=lazyWithRetry(()=>import('./features/gym/GymTools').then(m=>({default:m.DataManagement})));
const Training=lazyWithRetry(()=>import('./features/motion/Training'));
const History=lazyWithRetry(()=>import('./features/motion/History'));
const Avatar=lazyWithRetry(()=>import('./features/motion/pages/Avatar').then(m=>({default:m.Avatar})));
const Inventory=lazyWithRetry(()=>import('./features/motion/pages/Inventory').then(m=>({default:m.Inventory})));
function MotionView({children}:{children:React.ReactNode}){const {loaded,loading,error}=useStore();React.useEffect(()=>{if(error)console.error('[MotionView] 运动数据问题（原始信息仅记日志）:',error);},[error]);return <div className="motion-view">{loaded?<>{error&&<p className="gym-error" role="status">运动数据暂时没读出来，稍后再看看</p>}{children}</>:<div className="motion-loading">{loading?'正在读取你的运动数据…':'运动数据尚未读取，请重试。'}</div>}</div>;}
function MotionHome(){const navigate=useNavigate();return <MotionView><Home start={()=>navigate('/train')}/></MotionView>;}
function MotionAvatar(){const navigate=useNavigate();return <MotionView><Avatar inventory={()=>navigate('/inventory')}/></MotionView>;}
function GameDetailRoute(){const {id}=useParams();const navigate=useNavigate();return <RouteErrorBoundary resetKey={id} onBack={()=>navigate('/groups')}><GameDetail/></RouteErrorBoundary>;}
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
    <Route path="groups" element={<Lobby/>}/><Route path="create" element={<CreateGame/>}/><Route path="game/:id" element={<GameDetailRoute/>}/>
    <Route path="game/:id/summary" element={<GameSummary/>}/>
    <Route path="friends" element={<Friends/>}/><Route path="invite/:code" element={<InviteFriend/>}/>
    <Route path="game/:id/boss-fight" element={<BossFight/>}/><Route path="boss-Atlas" element={<BossAtlas/>}/>
    <Route path="notifications" element={<Notifications/>}/><Route path="profile" element={<Profile/>}/>
    <Route path="leaderboard" element={<Leaderboard/>}/><Route path="history" element={<MotionView><History/></MotionView>}/>
    <Route path="avatar" element={<MotionAvatar/>}/><Route path="inventory" element={<MotionView><Inventory/></MotionView>}/><Route path="feedback" element={<Feedback/>}/>
    <Route path="admin" element={<Admin/>}/>
  </Route><Route path="*" element={<Navigate to="/" replace/>}/>
</Routes></Suspense></ErrorBoundary></BrowserRouter>;}
export default function App(){useSocketConnection();const user=useAuthStore(s=>s.user);return <div className="motion-app">{user?<StoreProvider key={user.id}><HeartRateProvider><Pages/></HeartRateProvider></StoreProvider>:<Pages/>}</div>;}
