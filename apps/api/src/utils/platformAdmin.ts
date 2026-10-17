import {config} from '../config';

export function isPlatformAdmin(email:string){
  return Boolean(email)&&config.ADMIN_EMAILS.split(/[,\s]+/).some(value=>value.trim().toLowerCase()===email.toLowerCase());
}
