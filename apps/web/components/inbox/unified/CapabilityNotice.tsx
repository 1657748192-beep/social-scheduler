'use client';
import React from 'react';import {useLanguage} from '../../LanguageProvider';
export function CapabilityNotice({reason}:{reason:string}){
 const {t}=useLanguage();const labels:Record<string,[string,string]>={not_integrated:['该平台的互动功能尚未接入，不会显示模拟消息。','Interactions are not integrated for this platform. No simulated messages are shown.'],not_open:['此项功能暂未开放。','This feature is not open yet.'],verification_required:['请选择账号并核验当前互动能力。','Select an account and verify interaction access.'],authorization_required:['需要独立互动授权，发布授权不等于互动授权。','Separate interaction authorization is required.'],authorization_expired:['互动授权已失效。','Interaction authorization expired.'],unsupported:['平台不支持此项功能。','This feature is unsupported.'],approval_unverified:['应用审批状态尚未核实。','Application approval is unverified.'],unavailable:['部分账号不可用或同步失败，不能视为没有消息。','Some accounts are unavailable; this does not mean there are no messages.']};const copy=labels[reason]??labels.unavailable;
 return <p className="muted" role="status">{t(...copy)}</p>;
}
