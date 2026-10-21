'use client';
import {useLanguage} from './LanguageProvider';
import type {WorkspaceReadStatus} from '../lib/usePublishingWorkspaces';

export function WorkspaceLoadNotice({status,empty}:{status:WorkspaceReadStatus;empty:boolean}){
 const {t}=useLanguage();
 if(status==='loading')return <section className="panel" role="status"><p className="muted">{t('正在读取工作区…','Loading workspaces…')}</p></section>;
 if(status==='error')return <section className="panel" role="alert"><p className="error">{t('无法读取工作区，请刷新页面或重新登录。','Could not load workspaces. Refresh the page or sign in again.')}</p></section>;
 if(!empty)return null;
 return <section className="panel"><h2>{t('暂无工作区','No workspaces')}</h2><p className="muted">{t('请先在控制台创建工作区，再继续操作。','Create a workspace in the dashboard to continue.')}</p></section>;
}
