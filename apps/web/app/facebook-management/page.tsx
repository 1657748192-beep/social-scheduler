'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {AppShell} from '../../components/AppShell';
import {FacebookManagementPanel} from '../../components/facebook/FacebookManagementPanel';
import {useLanguage} from '../../components/LanguageProvider';
import {apiRequest,type Workspace} from '../../lib/api';
export default function FacebookManagementPage(){
  const router=useRouter(),{t}=useLanguage();
  const [token,setToken]=useState<string|null>(null),[workspaces,setWorkspaces]=useState<Workspace[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(false),[outcome,setOutcome]=useState('');
  useEffect(()=>{
    let current=true;const controller=new AbortController();let stored:string|null=null;
    try{stored=window.localStorage.getItem('social_scheduler_token');}catch{setError(true);setLoading(false);return;}
    if(!stored){router.replace('/login');return;}
    setToken(stored);const result=new URLSearchParams(window.location.search).get('facebook_management');if(result==='connected'||result==='failed')setOutcome(result);
    void apiRequest<Workspace[]>('/workspaces',{token:stored,signal:controller.signal}).then(spaces=>{if(current)setWorkspaces(spaces);}).catch(()=>{if(current)setError(true);}).finally(()=>{if(current)setLoading(false);});
    return()=>{current=false;controller.abort();};
  },[router]);
  return <AppShell title={t('BM 主页管理','BM Page management')} subtitle={t('只读公共主页目录与独立管理授权','Read-only Page directory and independent management authorization')} wide>
    {outcome?<p role="status">{outcome==='connected'?t('管理连接已保存，请刷新目录核验实际权限。','Management connection saved. Refresh the directory to verify actual permissions.'):t('管理授权未完成，原发布连接未改动。','Management authorization did not complete. Existing publishing connections are unchanged.')}</p>:null}
    {loading?<p role="status">{t('正在读取工作区…','Loading workspaces…')}</p>:null}{error?<p role="alert" className="error">{t('无法读取工作区，请重新登录或稍后重试。','Could not load workspaces. Sign in again or retry later.')}</p>:null}
    {token&&!loading&&!error&&workspaces.length?<FacebookManagementPanel token={token} workspaces={workspaces}/>:null}
    {!loading&&!error&&!workspaces.length?<section className="panel"><p>{t('暂无工作区，请先在控制台创建工作区。','No workspaces. Create one in the dashboard first.')}</p></section>:null}
  </AppShell>;
}
