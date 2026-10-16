'use client';
import {Suspense,useEffect,useMemo,useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {AppShell} from '../../components/AppShell';
import {FacebookInbox} from '../../components/inbox/FacebookInbox';
import {useLanguage} from '../../components/LanguageProvider';
import {apiRequest,type Workspace} from '../../lib/api';
export default function FacebookInboxPage(){return <Suspense fallback={<p>Loading…</p>}><InboxPageContent/></Suspense>;}
function InboxPageContent(){
  const router=useRouter(),params=useSearchParams(),{t}=useLanguage();
  const [token,setToken]=useState<string|null>(null),[workspaces,setWorkspaces]=useState<Workspace[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(false);
  const query=params.toString();const initialContext=useMemo(()=>{const search=new URLSearchParams(query);return search.get('managedPageId')?{workspaceId:search.get('workspaceId')??'',managedPageId:search.get('managedPageId')??'',connectionId:search.get('connectionId')??''}:undefined;},[query]);
  useEffect(()=>{
    let current=true;const controller=new AbortController();let stored:string|null=null;
    try{stored=window.localStorage.getItem('social_scheduler_token');}catch{setError(true);setLoading(false);return;}
    if(!stored){router.replace('/login');return;}setToken(stored);
    void apiRequest<Workspace[]>('/workspaces',{token:stored,signal:controller.signal}).then(rows=>{if(current)setWorkspaces(rows);}).catch(()=>{if(current)setError(true);}).finally(()=>{if(current)setLoading(false);});
    return()=>{current=false;controller.abort();};
  },[router]);
  return <AppShell title={t('Facebook 收件箱','Facebook inbox')} subtitle={t('公共主页 Messenger，非个人账号私人聊天','Page Messenger, not personal account private chats')} wide>
    {loading?<p role="status">{t('正在读取工作区…','Loading workspaces…')}</p>:null}{error?<p role="alert" className="error">{t('无法读取工作区，请重新登录或稍后重试。','Could not load workspaces. Sign in again or retry later.')}</p>:null}
    {token&&!loading&&!error&&workspaces.length?<FacebookInbox token={token} workspaces={workspaces} initialContext={initialContext}/>:null}
    {!loading&&!error&&!workspaces.length?<section className="panel"><p>{t('暂无工作区，请先在控制台创建。','No workspaces. Create one in the dashboard first.')}</p></section>:null}
  </AppShell>;
}
