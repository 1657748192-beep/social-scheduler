import {createHmac,timingSafeEqual} from 'node:crypto';
import {config} from '../config';
import {HttpError} from '../utils/errors';
const mac=(body:string)=>createHmac('sha256',config.JWT_SECRET).update('inbox_cursor:v1:'+body).digest();
export function encodeInboxCursor(scope:unknown,payload:Record<string,unknown>):string{
 const body=Buffer.from(JSON.stringify({scope,payload,expires:Date.now()+900000})).toString('base64url');return body+'.'+mac(body).toString('base64url');
}
export function decodeInboxCursor(scope:unknown,value:string):Record<string,unknown>{
 try{if(value.length>2048)throw Error();const [body,signature,...rest]=value.split('.');const supplied=Buffer.from(signature,'base64url'),expected=mac(body);if(rest.length||supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw Error();const parsed=JSON.parse(Buffer.from(body,'base64url').toString());if(JSON.stringify(parsed.scope)!==JSON.stringify(scope)||!Number.isFinite(parsed.expires)||parsed.expires<=Date.now()||!parsed.payload||typeof parsed.payload!=='object'||Array.isArray(parsed.payload))throw Error();return parsed.payload;}catch{throw new HttpError(400,'Invalid interaction cursor');}
}
