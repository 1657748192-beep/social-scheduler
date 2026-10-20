'use client';
import {useEffect,useRef,useState} from 'react';import {useLanguage} from '../LanguageProvider';
export function takeInvitationSecret(browser:Pick<Window,'location'|'history'>){
 try{const url=new URL(browser.location.href),secret=url.hash.slice(1);url.hash='';browser.history.replaceState(browser.history.state,'',url.pathname+url.search);return /^[A-Za-z0-9_-]{43}$/.test(secret)?secret:'';}catch{return'';}
}
export function FacebookPageImportPublic(){
 const {t}=useLanguage(),[secret,setSecret]=useState(''),[result,setResult]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),initialized=useRef(false),pending=useRef(false),abort=useRef<AbortController|null>(null);
 useEffect(()=>{if(!initialized.current){initialized.current=true;setSecret(takeInvitationSecret(window));try{const q=new URL(window.location.href).searchParams.get('result');setResult(q==='received'?'received':q==='unavailable'?'unavailable':'');}catch{}}return()=>abort.current?.abort();},[]);
 async function authorize(){if(!secret||pending.current)return;pending.current=true;setBusy(true);setError('');const controller=new AbortController();abort.current=controller;
  try{const response=await fetch(window.location.origin+'/api/v1/facebook-page-import-public/exchange',{method:'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({secret})});if(!response.ok)throw Error();const value=await response.json(),url=new URL(value.authorizationUrl);if(url.protocol!=='https:'||url.hostname!=='www.facebook.com'||url.username||url.password||!url.pathname.endsWith('/dialog/oauth'))throw Error();if(!controller.signal.aborted)window.location.assign(url.href);
  }catch{if(!controller.signal.aborted)setError(t('链接不可用或授权暂时失败，请联系邀请人或稍后重试。','This link is unavailable or authorization failed. Contact the inviter or retry later.'));}finally{if(!controller.signal.aborted){pending.current=false;setBusy(false);}}
 }
 return <main className="share-auth-page"><section className="share-auth-card"><div className="brand-mark">S</div><h1>{t('分享链接导入 Facebook 公共主页','Import Facebook Pages by invitation')}</h1>
 {result==='received'?<p role="status">{t('授权已收到，请通知邀请人到软件选择主页。尚未自动绑定或发布帖子。','Authorization received. Ask the inviter to select Pages in the app. Nothing was automatically connected or published.')}</p>:<><p>{t('此链接只用于授权你允许访问的 Facebook 公共主页。最终由邀请人在软件中选择新增主页；不会由此立即发帖。','Authorize access to the Facebook Pages you allow. The inviter selects new Pages in the app; this does not publish a post.')}</p><p className="muted">{t('密码和验证码仅输入 Facebook 官方页面。请核对账号，不要取消原有主页的授权选择。','Enter passwords and verification codes only on Facebook. Check the account and keep existing Page authorizations selected.')}</p>
 {!secret?<p role="status">{t('请重新打开邀请人发送的完整链接；链接可能已失效或已完成授权。','Reopen the full invitation link. It may be unavailable or already authorized.')}</p>:null}<button className="button" disabled={!secret||busy} onClick={()=>void authorize()}>{busy?t('正在前往…','Opening…'):t('前往 Facebook 授权','Continue to Facebook')}</button></>}{error?<p role="alert">{error}</p>:null}</section></main>;
}
