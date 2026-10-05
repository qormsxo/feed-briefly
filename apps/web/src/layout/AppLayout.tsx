import { useMutation } from '@tanstack/react-query';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { logout } from '../auth/api';
import { useAuth } from '../auth/use-auth';
import { queryClient } from '../lib/query-client';

export function AppLayout() {
  const auth = useAuth();
  const navigate = useNavigate();

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      queryClient.clear();
      navigate('/login');
    },
  });

  return (
    <div className="min-h-screen bg-[#0F1218] text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-[#0F1218]/90 backdrop-blur-md">
        <div className="flex h-14 items-center justify-between px-6 lg:px-8">
        <Link to="/" className="text-[15px] font-semibold tracking-tight">
          feed-briefly
        </Link>
        <nav className="flex items-center gap-3 text-[13px]">
          {/* RSS 피드 화면은 잠시 비활성화. App.tsx의 /feeds 라우트 주석과 같이 켠다.
          <Link to="/feeds" className="text-slate-600 hover:text-slate-900">
            피드
          </Link>
          */}
          <span className="text-zinc-200">
            {auth.data?.nickname ?? '사용자'}
          </span>
          <button
            type="button"
            className="text-zinc-200 hover:text-white"
            onClick={() => logoutMutation.mutate()}
          >
            로그아웃
          </button>
        </nav>
        </div>
      </header>
      <main className="px-6 py-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
