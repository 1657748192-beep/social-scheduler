'use client';
import {useLanguage} from '../LanguageProvider';
export function FacebookConnectionStatus({status,lastReadAt}:{status:string;lastReadAt?:string|null}){
  const {t,locale}=useLanguage();
  const labels:Record<string,[string,string]>={active:['管理授权已连接','Management connected'],disconnected:['管理连接已断开','Management disconnected'],authorization_invalid:['管理授权已失效','Management authorization invalid'],expired:['管理授权已到期','Management authorization expired']};
  const label=labels[status]??['管理授权状态未知','Management state unknown'];
  return <div className="facebook-connection-state"><span>{t(label[0],label[1])}</span>{lastReadAt?<small>{t('最近成功读取：','Last successful read: ')}<time dateTime={lastReadAt}>{new Date(lastReadAt).toLocaleString(locale==='en'?'en-US':'zh-CN')}</time></small>:null}</div>;
}
